import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/auth-user";

type SurveyQuestion = { id: string; label: string; type: "text" | "long_text" | "single" | "multiple" | "yes_no" | "rating"; required: boolean; options?: string[] };
type Target = { accounts?: string[]; roles?: string[]; schoolIds?: string[]; branchIds?: string[] };
const TYPES = new Set(["text", "long_text", "single", "multiple", "yes_no", "rating"]);
const UUID = /^[0-9a-f-]{36}$/i;
function str(v: unknown, max = 500) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function strings(v: unknown, count = 100) { return Array.isArray(v) ? v.slice(0,count).filter((x):x is string=>typeof x === "string").map(x=>x.trim()).filter(Boolean) : []; }

@Injectable()
export class SupportSurveysService {
  constructor(private readonly prisma: PrismaService) {}
  private async auth(actor: AuthUser) {
    const accountId = str(actor.accountId, 100), userId = str(actor.id, 100);
    if (!accountId || !userId) throw new ForbiddenException("Sign in to use Surveys.");
    const memberships = await this.prisma.userMembership.findMany({where:{accountId,userId,active:true,status:"active"},select:{role:true,schoolId:true,branchId:true}});
    if (!memberships.length) throw new ForbiddenException("An active membership is required.");
    const platformId = process.env.ELEEVEON_PLATFORM_ACCOUNT_ID || "";
    const platform = accountId === platformId && memberships.some(m=>["developer","platform_team"].includes(m.role));
    return {accountId,userId,memberships,platform};
  }
  private questions(v: unknown): SurveyQuestion[] {
    if (!Array.isArray(v) || v.length < 1 || v.length > 60) throw new BadRequestException("Add 1–60 survey questions.");
    const ids = new Set<string>();
    return v.map((q:any, i)=>{
      const id = str(q?.id, 60) || `q${i+1}`, label = str(q?.label, 280), type = str(q?.type, 20);
      if (!label || !TYPES.has(type) || ids.has(id)) throw new BadRequestException("Invalid or repeated survey question.");
      ids.add(id);
      const options = strings(q?.options,20).map(x=>x.slice(0,120));
      if (["single","multiple"].includes(type) && (options.length < 2 || options.length > 20)) throw new BadRequestException("Choice questions need 2–20 options.");
      return {id,label,type:type as SurveyQuestion["type"],required:q?.required===true,...(["single","multiple"].includes(type)?{options}:{})};
    });
  }
  private target(v: any): Target {
    if (!v || typeof v!=="object") return {};
    return {accounts:strings(v.accounts,250).filter(x=>UUID.test(x)),roles:strings(v.roles,20),schoolIds:strings(v.schoolIds,250),branchIds:strings(v.branchIds,250)};
  }
  private eligible(target: Target, a: Awaited<ReturnType<SupportSurveysService["auth"]>>) {
    if (target.accounts?.length && !target.accounts.includes(a.accountId)) return false;
    if (target.roles?.length && !a.memberships.some(m=>target.roles!.includes(m.role))) return false;
    if (target.schoolIds?.length && !a.memberships.some(m=>!!m.schoolId && target.schoolIds!.includes(m.schoolId))) return false;
    if (target.branchIds?.length && !a.memberships.some(m=>!!m.branchId && target.branchIds!.includes(m.branchId))) return false;
    return true;
  }
  async list(actor: AuthUser) {
    const a=await this.auth(actor);
    const rows=await this.prisma.eleeveonSurvey.findMany({where:a.platform?{}:{status:"published"},orderBy:{createdAt:"desc"},take:300});
    const visible=rows.filter(s=>a.platform || (this.eligible(this.target(s.targeting),a) && (!s.opensAt||s.opensAt.getTime()<=Date.now()) && (!s.closesAt||s.closesAt.getTime()>=Date.now())));
    const own=await this.prisma.eleeveonSurveyResponse.findMany({where:{userId:a.userId,surveyId:{in:visible.map(s=>s.id)}},select:{surveyId:true,submittedAt:true}});
    const taken=new Map(own.map(r=>[r.surveyId,r.submittedAt]));
    return {surveys:visible.map(s=>({...s,completedAt:taken.get(s.id)||null})),platform:a.platform};
  }
  async create(actor:AuthUser,input:Record<string,any>){
    const a=await this.auth(actor);if(!a.platform)throw new ForbiddenException("Only Eleeveon platform staff can publish surveys.");
    const title=str(input.title,180),description=str(input.description,2500);
    if(!title)throw new BadRequestException("A survey title is required.");
    const questions=this.questions(input.questions),targeting=this.target(input.targeting);
    const status=input.status==="published"?"published":"draft";
    const closesAt=input.closesAt?new Date(input.closesAt):null;
    if(closesAt&&!Number.isFinite(closesAt.getTime()))throw new BadRequestException("Invalid deadline.");
    const created=await this.prisma.eleeveonSurvey.create({data:{title,description:description||null,questions:questions as any,targeting:targeting as any,status,createdByUserId:a.userId,closesAt}});
    return {survey:created};
  }
  async setStatus(actor:AuthUser,id:string,status:string){
    const a=await this.auth(actor);if(!a.platform)throw new ForbiddenException("Platform access required.");
    if(!["draft","published","closed"].includes(status))throw new BadRequestException("Invalid survey state.");
    return {survey:await this.prisma.eleeveonSurvey.update({where:{id},data:{status}})};
  }
  async submit(actor:AuthUser,id:string,input:Record<string,unknown>){
    const a=await this.auth(actor);
    const s=await this.prisma.eleeveonSurvey.findUnique({where:{id}});
    if(!s||s.status!=="published"||!this.eligible(this.target(s.targeting),a))throw new NotFoundException("This survey is not available to your account.");
    if((s.opensAt&&s.opensAt.getTime()>Date.now())||(s.closesAt&&s.closesAt.getTime()<Date.now()))throw new ForbiddenException("The survey is not currently accepting answers.");
    const questions=this.questions(s.questions);const raw=input.answers;
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new BadRequestException("Answers are required.");
    const answers:Record<string,string|string[]>={};
    for(const q of questions){
      const v=(raw as any)[q.id],empty=v===undefined||v===null||v===""||(Array.isArray(v)&&!v.length);
      if(empty){if(q.required)throw new BadRequestException(`Please answer: ${q.label}`);continue;}
      if(q.type==="multiple"){
        if(!Array.isArray(v)||v.length>20||v.some(x=>!q.options?.includes(x)))throw new BadRequestException(`Invalid answer: ${q.label}`);
        answers[q.id]=[...new Set(v as string[])];
      }else{
        if(typeof v!=="string"||v.length>5000)throw new BadRequestException(`Invalid answer: ${q.label}`);
        if(["single"].includes(q.type)&&!q.options?.includes(v))throw new BadRequestException(`Invalid selection: ${q.label}`);
        if(q.type==="yes_no"&&!['yes','no'].includes(v))throw new BadRequestException(`Invalid yes/no response: ${q.label}`);
        if(q.type==="rating"&&!['1','2','3','4','5'].includes(v))throw new BadRequestException(`Invalid rating: ${q.label}`);
        answers[q.id]=v;
      }
    }
    const previous=await this.prisma.eleeveonSurveyResponse.findUnique({where:{surveyId_userId:{surveyId:id,userId:a.userId}}});
    if(previous)throw new BadRequestException("You have already completed this survey.");
    const submitted=await this.prisma.eleeveonSurveyResponse.create({data:{surveyId:id,userId:a.userId,accountId:a.accountId,branchId:a.memberships[0]?.branchId||null,answers:answers as any}});
    return {response:{id:submitted.id,submittedAt:submitted.submittedAt}};
  }
  async results(actor:AuthUser,id:string){
    const a=await this.auth(actor);if(!a.platform)throw new ForbiddenException("Platform access required.");
    const survey=await this.prisma.eleeveonSurvey.findUnique({where:{id}});
    if(!survey)throw new NotFoundException("Survey not found.");
    const responses=await this.prisma.eleeveonSurveyResponse.findMany({where:{surveyId:id},select:{accountId:true,answers:true,submittedAt:true},orderBy:{submittedAt:"desc"},take:1000});
    return {survey,responses,count:await this.prisma.eleeveonSurveyResponse.count({where:{surveyId:id}})};
  }
}
