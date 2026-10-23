import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthRequest } from "../common/auth-user";
import { IdentityService } from "./identity.service";
import { IdentityPolicyDto, IdentityIssueDto, IdentityCardTargetDto } from "./identity.dto";

@Controller("identity")
@UseGuards(JwtAuthGuard)
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get("policy")
  policy(@Req() req: AuthRequest, @Query("schoolId") schoolId: string, @Query("branchId") branchId: string) {
    return this.identity.getPolicy(req.user, schoolId, branchId);
  }

  @Post("policy")
  savePolicy(@Req() req: AuthRequest, @Body() body: IdentityPolicyDto) { return this.identity.savePolicy(req.user, body); }

  @Get("card")
  getCard(@Req() req: AuthRequest, @Query("subjectType") subjectType: "student"|"teacher",
    @Query("subjectId") subjectId: string, @Query("schoolId") schoolId: string,
    @Query("branchId") branchId: string) {
    return this.identity.getCard(req.user, {subjectType,subjectId,schoolId,branchId});
  }

  @Post("card/issue")
  issue(@Req() req: AuthRequest, @Body() body: IdentityIssueDto) { return this.identity.issue(req.user, body); }

  @Post("card/revoke")
  revoke(@Req() req: AuthRequest, @Body() body: IdentityCardTargetDto) { return this.identity.revoke(req.user, body); }
}

// Public endpoint: no authentication, intentionally returns a minimal profile.
@Controller("identity/verify")
export class PublicIdentityController {
  constructor(private readonly identity: IdentityService) {}
  @Get(":token") verify(@Param("token") token: string) {
    return this.identity.verify(token);
  }
}
