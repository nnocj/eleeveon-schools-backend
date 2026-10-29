/** Eleeveon support controller: authenticated chat, read receipts, and deletion. */
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../common/auth-user";
import { SupportService } from "./support.service";
import { SupportDeviceLinksService } from "./support-device-links.service";
import { SupportBackgroundsService } from "./support-backgrounds.service";
import { SupportSurveysService } from "./support-surveys.service";
import { SupportLiveService } from "./support-live.service";
import type { SupportFile } from "./support-storage.service";
type RequestWithUser = { user: AuthUser };
const maxSize = Number(process.env.SUPPORT_MAX_FILE_SIZE_BYTES || 15 * 1024 * 1024);
@Controller("support")
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService, private readonly surveys: SupportSurveysService, private readonly live: SupportLiveService, private readonly links: SupportDeviceLinksService, private readonly backgrounds: SupportBackgroundsService) {}
  @Get("calls/config") callConfig(@Req() req:RequestWithUser){return this.live.iceConfig(req.user);}
  @Post("conversations/:id/presence") heartbeat(@Req() req:RequestWithUser,@Param("id") id:string,@Body("activity") activity:string){return this.live.heartbeat(req.user,id,activity);}
  @Get("conversations/:id/presence") presence(@Req() req:RequestWithUser,@Param("id") id:string){return this.live.presence(req.user,id);}
  @Post("conversations/:id/call-signals") callSignal(@Req() req:RequestWithUser,@Param("id") id:string,@Body() body:Record<string,unknown>){return this.live.signal(req.user,id,body||{});}
  @Get("conversations/:id/call-signals") callSignals(@Req() req:RequestWithUser,@Param("id") id:string,@Query("since") since?:string){return this.live.signals(req.user,id,since);}
  @Get("surveys") surveysList(@Req() req:RequestWithUser){return this.surveys.list(req.user);}
  @Post("surveys") surveyCreate(@Req() req:RequestWithUser,@Body() body:Record<string,any>){return this.surveys.create(req.user,body||{});}
  @Post("surveys/:id/responses") surveySubmit(@Req() req:RequestWithUser,@Param("id") id:string,@Body() body:Record<string,unknown>){return this.surveys.submit(req.user,id,body||{});}
  @Get("surveys/:id/results") surveyResults(@Req() req:RequestWithUser,@Param("id") id:string){return this.surveys.results(req.user,id);}
  @Patch("surveys/:id/status") surveyStatus(@Req() req:RequestWithUser,@Param("id") id:string,@Body("status") status:string){return this.surveys.setStatus(req.user,id,status);}
  @Get("directory") directory(@Req() req:RequestWithUser,@Query("accountId") accountId?:string){return this.support.directory(req.user,accountId);}
  @Post("invitations") invite(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>){return this.support.invite(req.user,body||{});}
  @Get("keys") keys(@Req() req:RequestWithUser,@Query("conversationId") conversationId?:string){return this.support.keys(req.user,conversationId);}
  @Post("keys") registerKey(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>){return this.support.registerKey(req.user,body);}
  // Device pairing and opaque historical message-key transfer.
  @Get("backgrounds") backgroundsList(@Req() req:RequestWithUser){return this.backgrounds.list(req.user);}
  @Post("backgrounds")
  @UseInterceptors(FileInterceptor("file",{storage:memoryStorage(),limits:{fileSize:6*1024*1024,files:1}}))
  backgroundsUpload(@Req() req:RequestWithUser,@UploadedFile() file?:SupportFile){return this.backgrounds.upload(req.user,file);}
  @Patch("backgrounds/selection") backgroundsSelect(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>){return this.backgrounds.select(req.user,body||{});}
  @Delete("backgrounds/:id") backgroundsRemove(@Req() req:RequestWithUser,@Param("id") id:string){return this.backgrounds.remove(req.user,id);}
  @Get("devices") devices(@Req() req:RequestWithUser){return this.links.devices(req.user);}
  @Post("device-links") linkStart(@Req() req:RequestWithUser,@Body() input:Record<string,unknown>){return this.links.start(req.user,input||{});}
  @Post("device-links/lookup") linkLookup(@Req() req:RequestWithUser,@Body() input:Record<string,unknown>){return this.links.lookup(req.user,input||{});}
  @Get("device-links/:id") linkStatus(@Req() req:RequestWithUser,@Param("id") id:string){return this.links.status(req.user,id);}
  @Post("device-links/:id/approve") linkApprove(@Req() req:RequestWithUser,@Param("id") id:string,@Body() input:Record<string,unknown>){return this.links.approve(req.user,id,input||{});}
  @Post("device-links/:id/history-keys") linkHistory(@Req() req:RequestWithUser,@Param("id") id:string,@Body() input:Record<string,unknown>){return this.links.uploadHistory(req.user,id,input||{});}
  @Post("device-links/:id/complete") linkComplete(@Req() req:RequestWithUser,@Param("id") id:string,@Body() input:Record<string,unknown>){return this.links.complete(req.user,id,input||{});}
  @Delete("device-links/:id") linkCancel(@Req() req:RequestWithUser,@Param("id") id:string){return this.links.cancel(req.user,id);}
  @Post("devices/:deviceId/revoke") revokeDevice(@Req() req:RequestWithUser,@Param("deviceId") id:string,@Body() input:Record<string,unknown>){return this.links.revoke(req.user,id,input||{});}
  @Get("conversations/:id/messages") messagePage(@Req() req:RequestWithUser,@Param("id") id:string,@Query("before") before?:string,@Query("limit") limit?:string,@Query("deviceId") deviceId?:string){return this.links.messagePage(req.user,id,{before,limit,deviceId});}
  @Get("unread") unread(@Req() req:RequestWithUser){return this.support.unread(req.user);}
  @Get("conversations") list(@Req() req:RequestWithUser){return this.support.list(req.user);}
  @Post("conversations") create(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>){return this.support.create(req.user,body||{});}
  @Get("conversations/history-pages") inboxHistoryPage(@Req() req:RequestWithUser,@Query("before") before?:string,@Query("limit") limit?:string){return this.links.conversationPage(req.user,{before,limit});}
  @Get("conversations/:id") open(@Req() req:RequestWithUser,@Param("id") id:string){return this.support.open(req.user,id);}
  @Post("conversations/:id/read") markRead(@Req() req:RequestWithUser,@Param("id") id:string){return this.support.markRead(req.user,id);}
  // Personal conversation title; updates metadata without changing ciphertext.
  @Patch("conversations/:id/title")
  renameConversation(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body("title") title: string,
  ) {
    return this.support.renameConversation(req.user, id, title);
  }

  // Hide a conversation only for the requesting user; do not erase other
  // participants' encrypted history.
  @Delete("conversations/:id")
  removeConversation(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
  ) {
    return this.support.removeConversation(req.user, id);
  }

  @Delete("conversations/:id/messages/:messageId") deleteMessage(@Req() req:RequestWithUser,@Param("id") id:string,@Param("messageId") messageId:string,@Query("scope") scope?:string){
    return scope === "everyone" ? this.support.deleteForEveryone(req.user,id,messageId) : scope === "me" ? this.support.deleteForMe(req.user,id,messageId) : (()=>{throw new BadRequestException("Scope must be me or everyone");})();
  }
  @Post("conversations/:id/direct-uploads") directUpload(@Req() req:RequestWithUser,@Param("id") id:string,@Body() body:Record<string,unknown>){return this.support.beginDirectUpload(req.user,id,body||{});}
  @Post("conversations/:id/messages")
  @UseInterceptors(FileInterceptor("file", {storage: memoryStorage(),limits:{fileSize:Number.isFinite(maxSize)&&maxSize>0?Math.min(maxSize,50*1024*1024):15*1024*1024,files:1}}))
  send(@Req() req:RequestWithUser,@Param("id") id:string,@Body("body") body?:string,@Body("clientId") clientId?:string,@Body("encrypted") encrypted?:string,@UploadedFile() file?:SupportFile,@Body("uploadId") uploadId?:string){return this.support.send(req.user,id,body,file,clientId,encrypted==="true",uploadId);}
  @Patch("conversations/:id/status") status(@Req() req:RequestWithUser,@Param("id") id:string,@Body("status") status:string){return this.support.status(req.user,id,status);}
}
