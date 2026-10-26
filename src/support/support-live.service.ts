import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { SupportService } from "./support.service";
import type { AuthUser } from "../common/auth-user";
const uuid=/^[0-9a-f-]{36}$/i;
function str(v:unknown,max=200){return typeof v==="string"?v.trim().slice(0,max):"";}
@Injectable()
export class SupportLiveService {
 private prunedAt=0;
 private prune(){
   if(Date.now()-this.prunedAt<600000)return;
   this.prunedAt=Date.now();
   void Promise.all([
     this.prisma.eleeveonSupportSignal.deleteMany({where:{expiresAt:{lt:new Date()}}}),
     this.prisma.eleeveonSupportPresence.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-86400000)}}}),
   ]).catch(()=>{/* Cleanup retries on a subsequent call. */});
 }
 constructor(private readonly prisma:PrismaService,private readonly support:SupportService){}
 private async access(actor:AuthUser,id:string){
  if(!uuid.test(id))throw new BadRequestException("Invalid conversation ID.");
  await this.support.assertConversationAccess(actor,id);
  const userId=str(actor.id,120),accountId=str(actor.accountId,120);
  if(!userId||!accountId)throw new ForbiddenException("Sign in again.");
  return {userId,accountId};
 }
 async heartbeat(actor:AuthUser,id:string,activity:string){
  this.prune();
  const a=await this.access(actor,id);
  const accepted=["online","typing","recording"].includes(activity)?activity:"online";
  await this.prisma.eleeveonSupportPresence.upsert({where:{feedbackId_userId:{feedbackId:id,userId:a.userId}},
   update:{activity:accepted,expiresAt:new Date(Date.now()+15000)},
   create:{feedbackId:id,userId:a.userId,accountId:a.accountId,activity:accepted,expiresAt:new Date(Date.now()+15000)}});
  return {ok:true};
 }
 async presence(actor:AuthUser,id:string){
  const a=await this.access(actor,id);
  const rows=await this.prisma.eleeveonSupportPresence.findMany({where:{feedbackId:id,expiresAt:{gt:new Date()},userId:{not:a.userId}},select:{userId:true,activity:true,updatedAt:true},take:100});
  return {people:rows,online:rows.length>0};
 }
 async signal(actor:AuthUser,id:string,input:Record<string,unknown>){
  this.prune();
  const a=await this.access(actor,id);
  const kind=str(input.kind,30),sessionId=str(input.sessionId,70);
  if(!["offer","answer","ice","end","decline"].includes(kind)||!uuid.test(sessionId))throw new BadRequestException("Invalid call signal.");
  const payload=input.payload??null;
  const raw=JSON.stringify(payload);
  if(raw.length>50000)throw new BadRequestException("Call signalling payload too large.");
  const recent=await this.prisma.eleeveonSupportSignal.count({where:{feedbackId:id,fromUserId:a.userId,createdAt:{gt:new Date(Date.now()-60000)}}});
  if(recent>160)throw new BadRequestException("Call signalling rate limit exceeded.");
  const created=await this.prisma.eleeveonSupportSignal.create({data:{feedbackId:id,fromUserId:a.userId,sessionId,kind,payload:payload as any,expiresAt:new Date(Date.now()+3600000)}});
  return {signal:{id:created.id,createdAt:created.createdAt}};
 }
 async signals(actor:AuthUser,id:string,since?:string){
  const a=await this.access(actor,id);
  const timestamp=Number(since||0);
  const time=Number.isFinite(timestamp)&&timestamp>Date.now()-3600000&&timestamp<Date.now()+120000
   ?new Date(timestamp):new Date(Date.now()-15000);
  const rows=await this.prisma.eleeveonSupportSignal.findMany({where:{feedbackId:id,fromUserId:{not:a.userId},createdAt:{gte:time},expiresAt:{gt:new Date()}},orderBy:{createdAt:"asc"},take:100});
  return {signals:rows};
 }
 async iceConfig(actor:AuthUser){
  const accountId=str(actor.accountId,120),userId=str(actor.id,120);
  const active=await this.prisma.userMembership.findFirst({where:{accountId,userId,active:true,status:"active"},select:{id:true}});
  if(!active)throw new ForbiddenException("Sign in to start a call.");
  const servers:Record<string,unknown>[]=[];
  const stun=str(process.env.SUPPORT_STUN_URL,500);
  if(stun)servers.push({urls:stun});
  const turn=str(process.env.SUPPORT_TURN_URL,500);
  if(turn){
    const secret=String(process.env.SUPPORT_TURN_SHARED_SECRET||"");
    if(!secret)throw new BadRequestException("Configure SUPPORT_TURN_SHARED_SECRET on Render before enabling calls.");
    // TURN REST API time-limited credentials (coturn use-auth-secret).
    const expiry=Math.floor(Date.now()/1000)+3600;
    const username=`${expiry}:${userId}`;
    const credential=createHmac("sha1",secret).update(username).digest("base64");
    servers.push({urls:turn,username,credential});
  }
  return {iceServers:servers,turnConfigured:!!turn};
 }
}
