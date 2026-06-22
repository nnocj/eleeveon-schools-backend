import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import {
  PlatformCacheDto,
  PullSyncDto,
  PushSyncDto,
  RegisterSyncDeviceDto,
  ResolveSyncConflictDto,
} from "./dto/sync.dto";
import { SyncService } from "./sync.service";

@Controller("sync")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get("status")
  status(@Req() req: any) {
    return this.syncService.status(req.user);
  }

  @Post("push")
  push(@Req() req: any, @Body() dto: PushSyncDto) {
    return this.syncService.push({ ...dto, accountId: req.user.accountId, deviceId: dto.deviceId });
  }

  @Post("pull")
  pull(@Req() req: any, @Body() dto: PullSyncDto) {
    return this.syncService.pull({ ...dto, accountId: req.user.accountId, deviceId: dto.deviceId });
  }

  @Post("bootstrap")
  bootstrap(@Req() req: any, @Body() dto: PlatformCacheDto) {
    return this.syncService.bootstrap(req.user, { ...dto, accountId: req.user.accountId });
  }

  @Post("platform-cache")
  platformCache(@Req() req: any, @Body() dto: PlatformCacheDto) {
    return this.syncService.platformCache({ ...dto, accountId: req.user.accountId });
  }

  @Post("devices/register")
  registerDevice(@Req() req: any, @Body() dto: RegisterSyncDeviceDto) {
    return this.syncService.registerDevice(req.user, { ...dto, accountId: req.user.accountId });
  }

  @Get("conflicts")
  conflicts(@Req() req: any, @Query("status") status?: string) {
    return this.syncService.listConflicts(req.user.accountId, status || "open");
  }

  @Post("conflicts/:id/resolve")
  resolveConflict(@Req() req: any, @Param("id") id: string, @Body() dto: ResolveSyncConflictDto) {
    return this.syncService.resolveConflict(req.user.accountId, id, req.user.id, dto);
  }

  @Roles("developer", "platform_team")
  @Get("diagnostics")
  diagnostics(@Req() req: any, @Query("accountId") accountId?: string) {
    return this.syncService.diagnostics(accountId || req.user.accountId);
  }
}
