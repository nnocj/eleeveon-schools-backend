import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/auth-user";

export type IdentityPersonType = "student" | "teacher";
export type IssuanceMode = "automatic" | "manual" | "disabled";
type Scope = { schoolId: string; branchId: string };
type PersonInput = Scope & { subjectType: IdentityPersonType; subjectId: string };
type IssueInput = PersonInput & { replace?: boolean };

@Injectable()
export class IdentityService {
  constructor(private readonly db: PrismaService) {}

  private signature(publicId: string) {
    const secret = process.env.IDENTITY_QR_HMAC_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException("ID verification signing is not configured.");
    return createHmac("sha256", secret).update(`eleeveon-id-v1:${publicId}`).digest("hex");
  }

  private verificationUrl(publicId: string) {
    const root = (process.env.IDENTITY_PUBLIC_BASE_URL || "https://schools.eleeveon.com").replace(/\/$/, "");
    return `${root}/verify/${publicId}.${this.signature(publicId)}`;
  }

  private ensureSubject(subjectType: string): asserts subjectType is IdentityPersonType {
    if (subjectType !== "student" && subjectType !== "teacher") throw new BadRequestException("Unsupported identity type.");
  }

  private assertAccess(actor: AuthUser, scope: Scope) {
    if (!actor?.accountId || !scope.schoolId || !scope.branchId) throw new ForbiddenException("Branch authorization required.");
    const roles = new Set(["owner", "super_admin", "admin", "branch_admin"]);
    const memberships = actor.memberships || [];
    const allowed = memberships.some((m) => m.active !== false && m.accountId === actor.accountId && roles.has(m.role) &&
      (!m.schoolId || m.schoolId === scope.schoolId) && (!m.branchId || m.branchId === scope.branchId));
    // Only fall back for older owner-level sessions that carry no memberships.
    // Never let a branch-admin membership in one school authorize another branch.
    const globalOwner = memberships.length === 0 &&
      ["owner", "super_admin"].includes(String(actor.activeRole || actor.role)) &&
      (!actor.schoolId || actor.schoolId === scope.schoolId) &&
      (!actor.branchId || actor.branchId === scope.branchId);
    if (!allowed && !globalOwner) throw new ForbiddenException("No permission for this branch.");
  }

  private async findPerson(accountId: string, input: PersonInput) {
    this.ensureSubject(input.subjectType);
    if (!input.subjectId || !input.schoolId || !input.branchId) throw new BadRequestException("Missing identity scope.");
    const tableName = input.subjectType === "student" ? "students" : "teachers";
    const record = await this.db.syncRecord.findFirst({
      where: { accountId, tableName, isDeleted: false, OR: [{localId: input.subjectId}, {cloudId: input.subjectId}] },
      orderBy: {updatedAt:"desc"},
    });
    const payload = record?.payload as Record<string, unknown> | undefined;
    if (!payload || String(payload.schoolId || "") !== input.schoolId || String(payload.branchId || "") !== input.branchId || payload.isDeleted === true) {
      throw new NotFoundException("This person's record must be synchronized before issuing an online ID.");
    }
    if (input.subjectType === "teacher" && (payload.active === false || payload.status === "inactive")) {
      throw new BadRequestException("An inactive teacher cannot have an active ID.");
    }
    if (input.subjectType === "student" && ["withdrawn", "transferred", "graduated"].includes(String(payload.status || ""))) {
      throw new BadRequestException("The student is no longer active at this school.");
    }
    return payload;
  }

  private cardResponse(card: {publicId:string;status:string;issuedAt:Date;expiresAt:Date|null;version:number;schoolId:string;branchId:string;subjectType:string;subjectId:string}) {
    const status = card.status === "active" && card.expiresAt && card.expiresAt.getTime() < Date.now()
      ? "expired" : card.status;
    return {status, issuedAt:card.issuedAt, expiresAt:card.expiresAt,
      version:card.version, schoolId:card.schoolId, branchId:card.branchId,
      subjectType:card.subjectType, subjectId:card.subjectId,
      verificationUrl: this.verificationUrl(card.publicId)};
  }

  async getPolicy(actor: AuthUser, schoolId: string, branchId: string) {
    this.assertAccess(actor,{schoolId,branchId});
    const row = await this.db.identityIssuancePolicy.findUnique({where:{accountId_schoolId_branchId:{accountId:actor.accountId,schoolId,branchId}}});
    return {studentMode:row?.studentMode || "manual",teacherMode:row?.teacherMode || "manual",
      expiryMonths:row?.expiryMonths || 12,showClassPublicly:row?.showClassPublicly ?? true,showNamePublicly:row?.showNamePublicly ?? false};
  }

  async savePolicy(actor: AuthUser, data: Scope & {
    studentMode: IssuanceMode;teacherMode: IssuanceMode;expiryMonths?:number;showClassPublicly?:boolean;showNamePublicly?:boolean;
  }) {
    this.assertAccess(actor,data);
    const modes = ["automatic","manual","disabled"];
    if (!modes.includes(data.studentMode) || !modes.includes(data.teacherMode)) throw new BadRequestException("Invalid issuance mode.");
    const expiryMonths = Number(data.expiryMonths ?? 12);
    if (!Number.isInteger(expiryMonths) || expiryMonths < 1 || expiryMonths > 120) throw new BadRequestException("Expiry must be 1–120 months.");
    return this.db.identityIssuancePolicy.upsert({
      where:{accountId_schoolId_branchId:{accountId:actor.accountId,schoolId:data.schoolId,branchId:data.branchId}},
      create:{accountId:actor.accountId,...data,expiryMonths,showClassPublicly:data.showClassPublicly ?? true,showNamePublicly:data.showNamePublicly ?? false},
      update:{studentMode:data.studentMode,teacherMode:data.teacherMode,expiryMonths,showClassPublicly:data.showClassPublicly ?? true,showNamePublicly:data.showNamePublicly ?? false},
    });
  }

  async getCard(actor: AuthUser,input: PersonInput) {
    this.assertAccess(actor,input);this.ensureSubject(input.subjectType);
    const card=await this.db.identityCardRegistry.findUnique({where:{accountId_subjectType_subjectId:{accountId:actor.accountId,subjectType:input.subjectType,subjectId:input.subjectId}}});
    if (!card || card.schoolId !== input.schoolId || card.branchId !== input.branchId) return {status:"not_issued"};
    return this.cardResponse(card);
  }

  async issue(actor: AuthUser,input: IssueInput) {
    this.assertAccess(actor,input);this.ensureSubject(input.subjectType);
    await this.findPerson(actor.accountId,input);
    const policy=await this.getPolicy(actor,input.schoolId,input.branchId);
    const mode=input.subjectType==="student"?policy.studentMode:policy.teacherMode;
    if (mode==="disabled") throw new ForbiddenException("ID generation is disabled for this category.");
    const existing=await this.db.identityCardRegistry.findUnique({where:{accountId_subjectType_subjectId:{accountId:actor.accountId,subjectType:input.subjectType,subjectId:input.subjectId}}});
    if(existing && existing.status==="active" && (!existing.expiresAt || existing.expiresAt.getTime()>Date.now()) && !input.replace) return this.cardResponse(existing);
    const months=policy.expiryMonths;
    const expiry=new Date();expiry.setUTCMonth(expiry.getUTCMonth()+months);
    const publicId=randomUUID();
    const card=await this.db.identityCardRegistry.upsert({
      where:{accountId_subjectType_subjectId:{accountId:actor.accountId,subjectType:input.subjectType,subjectId:input.subjectId}},
      create:{publicId,accountId:actor.accountId,schoolId:input.schoolId,branchId:input.branchId,subjectType:input.subjectType,
        subjectId:input.subjectId,status:"active",issuedAt:new Date(),expiresAt:expiry},
      update:{publicId,status:"active",issuedAt:new Date(),expiresAt:expiry,revokedAt:null,
        replacedAt:existing?new Date():null,version:{increment:1}},
    });
    await this.db.identityCardRegistryEvent.create({data:{cardId:card.id,accountId:actor.accountId,
      eventType:existing?"reissued":"issued",performedBy:actor.id}});
    return this.cardResponse(card);
  }

  async revoke(actor:AuthUser,input:PersonInput) {
    this.assertAccess(actor,input);this.ensureSubject(input.subjectType);
    const card=await this.db.identityCardRegistry.findUnique({where:{accountId_subjectType_subjectId:{accountId:actor.accountId,subjectType:input.subjectType,subjectId:input.subjectId}}});
    if (!card || card.schoolId!==input.schoolId || card.branchId!==input.branchId) throw new NotFoundException("ID not found.");
    await this.db.identityCardRegistry.update({where:{id:card.id},data:{status:"revoked",revokedAt:new Date()}});
    await this.db.identityCardRegistryEvent.create({data:{cardId:card.id,accountId:actor.accountId,eventType:"revoked",performedBy:actor.id}});
    return {status:"revoked"};
  }

  // Call after successful students/teachers SyncRecord push. Never issue IDs from unsynced browser claims.
  async onPersonSynchronized(accountId:string,tableName:string,payload:unknown) {
    if(tableName!=="students" && tableName!=="teachers") return;
    const person=(payload||{}) as Record<string,unknown>;
    const schoolId=String(person.schoolId||"");const branchId=String(person.branchId||"");const subjectId=String(person.id||"");
    if(!accountId||!schoolId||!branchId||!subjectId||person.isDeleted===true) return;
    if(tableName==="students" && ["withdrawn","transferred","graduated"].includes(String(person.status||""))) return;
    if(tableName==="teachers" && (person.active===false || person.status==="inactive")) return;
    const policy=await this.db.identityIssuancePolicy.findUnique({where:{accountId_schoolId_branchId:{accountId,schoolId,branchId}}});
    const subjectType:IdentityPersonType=tableName==="students"?"student":"teacher";
    if((subjectType==="student"?policy?.studentMode:policy?.teacherMode)!=="automatic") return;
    const existing=await this.db.identityCardRegistry.findUnique({where:{accountId_subjectType_subjectId:{accountId,subjectType,subjectId}}});
    if(existing) return; // revoked IDs are NEVER silently reactivated
    const expiry=new Date();expiry.setUTCMonth(expiry.getUTCMonth()+(policy?.expiryMonths||12));
    const card=await this.db.identityCardRegistry.create({data:{accountId,schoolId,branchId,subjectId,subjectType,
      publicId:randomUUID(),status:"active",expiresAt:expiry}});
    await this.db.identityCardRegistryEvent.create({data:{cardId:card.id,accountId,eventType:"issued",note:"Automatic issuance after synchronization"}});
  }

  async verify(token:string) {
    const [publicId,signature,extra]=String(token||"").split(".");
    if(extra || !/^[0-9a-f-]{36}$/i.test(publicId||"") || !/^[0-9a-f]{64}$/i.test(signature||"")) return {valid:false,status:"invalid"};
    const expected=this.signature(publicId);
    if(!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(signature,"hex"))) return {valid:false,status:"invalid"};
    const card=await this.db.identityCardRegistry.findUnique({where:{publicId}});
    if(!card) return {valid:false,status:"invalid"};
    if(card.status!=="active") return {valid:false,status:"revoked"};
    if(card.expiresAt && card.expiresAt.getTime()<Date.now()) return {valid:false,status:"expired"};
    let person:Record<string,unknown>;
    try {person=await this.findPerson(card.accountId,{schoolId:card.schoolId,branchId:card.branchId,subjectType:card.subjectType as IdentityPersonType,subjectId:card.subjectId});}
    catch {return {valid:false,status:"inactive"};}
    const policy=await this.db.identityIssuancePolicy.findUnique({where:{accountId_schoolId_branchId:{accountId:card.accountId,schoolId:card.schoolId,branchId:card.branchId}}});
    const [school,branch,personClass]=await Promise.all([
      this.db.syncRecord.findFirst({where:{accountId:card.accountId,tableName:"schools",localId:card.schoolId,isDeleted:false}}),
      this.db.syncRecord.findFirst({where:{accountId:card.accountId,tableName:"branches",localId:card.branchId,isDeleted:false}}),
      card.subjectType==="student" && policy?.showClassPublicly!==false && person.currentClassId
        ? this.db.syncRecord.findFirst({where:{accountId:card.accountId,tableName:"classes",localId:String(person.currentClassId),isDeleted:false}})
        : Promise.resolve(null),
    ]);
    // No contact details, date of birth, attendance, fee/payment details, or private media URLs.
    return {valid:true,status:"active",fullName:policy?.showNamePublicly===true?String(person.fullName||""):"",subjectType:card.subjectType,
      schoolName:String((school?.payload as any)?.name||"School"),branchName:String((branch?.payload as any)?.name||""),
      className:String((personClass?.payload as any)?.name||""),issuedAt:card.issuedAt,expiresAt:card.expiresAt};
  }
}
