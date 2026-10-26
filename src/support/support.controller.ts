/** Authenticated support messages and public-key enrollment. */
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../common/auth-user";
import { SupportService } from "./support.service";
import { SupportSurveysService } from "./support-surveys.service";
import { SupportLiveService } from "./support-live.service";
import type { SupportFile } from "./support-storage.service";

type RequestWithUser = { user: AuthUser };
const maxSize = Number(process.env.SUPPORT_MAX_FILE_SIZE_BYTES || 15 * 1024 * 1024);
@Controller("support")
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService, private readonly surveys: SupportSurveysService, private readonly live: SupportLiveService) {}

  @Get("calls/config")
  callConfig(@Req() req:RequestWithUser){return this.live.iceConfig(req.user);}
  @Post("conversations/:id/presence")
  heartbeat(@Req() req:RequestWithUser,@Param("id") id:string,@Body("activity") activity:string){return this.live.heartbeat(req.user,id,activity);}
  @Get("conversations/:id/presence")
  presence(@Req() req:RequestWithUser,@Param("id") id:string){return this.live.presence(req.user,id);}
  @Post("conversations/:id/call-signals")
  callSignal(@Req() req:RequestWithUser,@Param("id") id:string,@Body() body:Record<string,unknown>){return this.live.signal(req.user,id,body||{});}
  @Get("conversations/:id/call-signals")
  callSignals(@Req() req:RequestWithUser,@Param("id") id:string,@Query("since") since?:string){return this.live.signals(req.user,id,since);}
  @Get("surveys")
  surveysList(@Req() req:RequestWithUser){return this.surveys.list(req.user);}
  @Post("surveys")
  surveyCreate(@Req() req:RequestWithUser,@Body() body:Record<string,any>){return this.surveys.create(req.user,body||{});}
  @Post("surveys/:id/responses")
  surveySubmit(@Req() req:RequestWithUser,@Param("id") id:string,@Body() body:Record<string,unknown>){return this.surveys.submit(req.user,id,body||{});}
  @Get("surveys/:id/results")
  surveyResults(@Req() req:RequestWithUser,@Param("id") id:string){return this.surveys.results(req.user,id);}
  @Patch("surveys/:id/status")
  surveyStatus(@Req() req:RequestWithUser,@Param("id") id:string,@Body("status") status:string){return this.surveys.setStatus(req.user,id,status);}
  @Get("directory")
  directory(@Req() req:RequestWithUser,@Query("accountId") accountId?:string){return this.support.directory(req.user,accountId);}
  @Post("invitations")
  invite(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>){return this.support.invite(req.user,body||{});}
  @Get("keys")
  keys(@Req() req: RequestWithUser, @Query("conversationId") conversationId?: string) {
    return this.support.keys(req.user, conversationId);
  }
  @Post("keys")
  registerKey(@Req() req: RequestWithUser, @Body() body: Record<string, unknown>) {
    return this.support.registerKey(req.user, body);
  }
  @Get("conversations")
  list(@Req() req: RequestWithUser) { return this.support.list(req.user); }
  @Post("conversations")
  create(@Req() req: RequestWithUser, @Body() body: Record<string, unknown>) { return this.support.create(req.user, body || {}); }
  @Get("conversations/:id")
  open(@Req() req: RequestWithUser, @Param("id") id: string) { return this.support.open(req.user, id); }

  @Post("conversations/:id/direct-uploads")
  directUpload(@Req() req:RequestWithUser,@Param("id") id:string,@Body() body:Record<string,unknown>){return this.support.beginDirectUpload(req.user,id,body||{});}
  @Post("conversations/:id/messages")
  @UseInterceptors(FileInterceptor("file", {
    storage: memoryStorage(),
    limits: { fileSize: Number.isFinite(maxSize) && maxSize > 0 ? Math.min(maxSize, 50 * 1024 * 1024) : 15 * 1024 * 1024, files: 1 },
  }))
  send(@Req() req: RequestWithUser, @Param("id") id: string,
    @Body("body") body?: string, @Body("clientId") clientId?: string,
    @Body("encrypted") encrypted?: string, @UploadedFile() file?: SupportFile,@Body("uploadId") uploadId?:string) {
    return this.support.send(req.user, id, body, file, clientId, encrypted === "true",uploadId);
  }
  @Patch("conversations/:id/status")
  status(@Req() req: RequestWithUser, @Param("id") id: string, @Body("status") status: string) {
    return this.support.status(req.user, id, status);
  }
}
