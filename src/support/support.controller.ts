/** Only authenticated school members or platform support staff may access support conversations. */
import { Body, Controller, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../common/auth-user";
import { SupportService } from "./support.service";
import type { SupportFile } from "./support-storage.service";

type RequestWithUser = { user: AuthUser };
const limit = Number(process.env.SUPPORT_MAX_FILE_SIZE_BYTES || 15 * 1024 * 1024);

@Controller("support")
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get("conversations")
  list(@Req() req: RequestWithUser) { return this.support.list(req.user); }

  @Post("conversations")
  create(@Req() req: RequestWithUser, @Body() body: Record<string, unknown>) {
    return this.support.create(req.user, body || {});
  }

  @Get("conversations/:id")
  open(@Req() req: RequestWithUser, @Param("id") id: string) {
    return this.support.open(req.user, id);
  }

  @Post("conversations/:id/messages")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50 * 1024 * 1024) : 15 * 1024 * 1024, files: 1 } }))
  send(@Req() req: RequestWithUser, @Param("id") id: string,
    @Body("body") body: string | undefined, @Body("clientId") clientId: string | undefined,
    @UploadedFile() file?: SupportFile) {
    return this.support.send(req.user, id, body, file, clientId);
  }

  @Patch("conversations/:id/status")
  status(@Req() req: RequestWithUser, @Param("id") id: string, @Body("status") status: string) {
    return this.support.status(req.user, id, status);
  }
}
