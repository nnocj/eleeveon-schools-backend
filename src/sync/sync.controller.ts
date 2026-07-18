/**
 * src/sync/sync.controller.ts
 * --------------------------------------------------------------------------
 * JWT-authoritative synchronization controller with Phase 21 workspace
 * bootstrap.
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../common/auth-user";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";

import {
  PlatformCacheDto,
  PullSyncDto,
  PushSyncDto,
  RegisterSyncDeviceDto,
  ResolveSyncConflictDto,
  WorkspaceBootstrapDto,
} from "./dto/sync.dto";

import { SyncService } from "./sync.service";

type AuthenticatedRequest = {
  user: AuthUser;
};

@Controller("sync")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
  ) {}

  @Get("status")
  status(
    @Req() req: AuthenticatedRequest,
  ) {
    return this.syncService.status(
      req.user,
    );
  }

  @Post("push")
  push(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PushSyncDto,
  ) {
    return this.syncService.push(
      req.user,
      {
        ...dto,
        accountId:
          req.user.accountId,
        deviceId:
          dto.deviceId,
      },
    );
  }

  @Post("pull")
  pull(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PullSyncDto,
  ) {
    return this.syncService.pull(
      req.user,
      {
        ...dto,
        accountId:
          req.user.accountId,
        deviceId:
          dto.deviceId,
      },
    );
  }

  /**
   * Fast selected-workspace bundle.
   *
   * The body cannot override account scope. School/branch/profile scope is
   * checked against the authenticated user's active membership.
   */
  @Post("workspace-bootstrap")
  workspaceBootstrap(
    @Req() req: AuthenticatedRequest,
    @Body() dto: WorkspaceBootstrapDto,
  ) {
    return this.syncService.workspaceBootstrap(
      req.user,
      {
        ...dto,
        accountId:
          req.user.accountId,
        deviceId:
          dto.deviceId,
      },
    );
  }

  @Post("bootstrap")
  bootstrap(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PlatformCacheDto,
  ) {
    return this.syncService.bootstrap(
      req.user,
      {
        ...dto,
        accountId:
          req.user.accountId,
      },
    );
  }

  @Post("platform-cache")
  platformCache(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PlatformCacheDto,
  ) {
    return this.syncService.platformCache(
      req.user,
      {
        ...dto,
        accountId:
          req.user.accountId,
      },
    );
  }

  @Post("devices/register")
  registerDevice(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterSyncDeviceDto,
  ) {
    return this.syncService.registerDevice(
      req.user,
      {
        ...dto,
        accountId:
          req.user.accountId,
      },
    );
  }

  @Get("conflicts")
  conflicts(
    @Req() req: AuthenticatedRequest,
    @Query("status") status?: string,
  ) {
    return this.syncService.listConflicts(
      req.user,
      status || "open",
    );
  }

  @Post("conflicts/:id/resolve")
  resolveConflict(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: ResolveSyncConflictDto,
  ) {
    return this.syncService.resolveConflict(
      req.user,
      id,
      dto,
    );
  }

  @Roles(
    "developer",
    "platform_team",
  )
  @Get("diagnostics")
  diagnostics(
    @Req() req: AuthenticatedRequest,
    @Query("accountId") accountId?: string,
  ) {
    return this.syncService.diagnostics(
      req.user,
      accountId,
    );
  }
}