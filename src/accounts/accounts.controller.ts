import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";

import { AccountsService } from "./accounts.service";
import {
  ChangeMyEmailDto,
  ChangeMyPasswordDto,
  CreateAccountDto,
  CreateAccountUserDto,
  UpdateAccountDto,
  UpdateAccountSettingsDto,
  UpdateAccountUserDto,
  UpdateAccountUserStatusDto,
  UpdateMyProfileDto,
} from "./dto/account-users.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("accounts")
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  // ======================================================
  // CURRENT ACCOUNT
  // Keep all static "me/..." routes before ":accountId".
  // ======================================================

  @Get("me")
  me(@Req() req: any) {
    return this.accountsService.getAccount(req.user);
  }

  @Roles(
    "developer",
    "platform_team",
    "owner",
    "super_admin",
  )
  @Patch("me")
  updateMyAccount(
    @Req() req: any,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.updateAccount(
      req.user,
      req.user.accountId,
      dto,
    );
  }

  // Current authenticated user profile. For the owner portal, the service
  // also returns the matching Account owner/customer record so the UI can
  // keep owner identity synchronized across Account + AppUser.
  @Get("me/profile")
  getMyProfile(@Req() req: any) {
    return this.accountsService.getMyProfile(req.user);
  }

  @Patch("me/profile")
  updateMyProfile(
    @Req() req: any,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.accountsService.updateMyProfile(
      req.user,
      dto,
    );
  }

  // Owner email changes are synchronized by the service across:
  // Account.email + the owner's AppUser.email.
  @Patch("me/email")
  changeMyEmail(
    @Req() req: any,
    @Body() dto: ChangeMyEmailDto,
  ) {
    return this.accountsService.changeMyEmail(
      req.user,
      dto,
    );
  }

  // Password is authentication-only and therefore remains AppUser-only.
  @Patch("me/password")
  changeMyPassword(
    @Req() req: any,
    @Body() dto: ChangeMyPasswordDto,
  ) {
    return this.accountsService.changeMyPassword(
      req.user,
      dto,
    );
  }

  @Get("me/settings")
  getMySettings(@Req() req: any) {
    return this.accountsService.getAccountSettings(
      req.user,
    );
  }

  @Roles(
    "developer",
    "platform_team",
    "owner",
    "super_admin",
  )
  @Patch("me/settings")
  updateMySettings(
    @Req() req: any,
    @Body() dto: UpdateAccountSettingsDto,
  ) {
    return this.accountsService.updateAccountSettings(
      req.user,
      dto,
    );
  }

  @Get("me/users")
  getMyUsers(
    @Req() req: any,
    @Query("schoolId") schoolId?: string,
    @Query("branchId") branchId?: string,
  ) {
    return this.accountsService.getUsers(
      req.user,
      undefined,
      {
        schoolId,
        branchId,
      },
    );
  }

  @Post("me/users")
  createMyUser(
    @Req() req: any,
    @Body() dto: CreateAccountUserDto,
  ) {
    return this.accountsService.createUser(req.user, dto);
  }

  @Get("me/schools")
  async mySchools(@Req() req: any) {
    return this.accountsService.getOwnerRecords(
      req.user.accountId,
      "schools",
    );
  }

  @Get("me/branches")
  async myBranches(@Req() req: any) {
    return this.accountsService.getOwnerRecords(
      req.user.accountId,
      "branches",
    );
  }

  @Post("me/schools")
  async createSchool(
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.accountsService.createOwnerRecord(
      req.user.accountId,
      "schools",
      body,
    );
  }

  @Post("me/branches")
  async createBranch(
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.accountsService.createOwnerRecord(
      req.user.accountId,
      "branches",
      body,
    );
  }

  @Roles(
    "developer",
    "platform_team",
    "owner",
    "super_admin",
    "admin",
  )
  @Patch("users/:id")
  updateUser(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateAccountUserDto,
  ) {
    return this.accountsService.updateUser(req.user, id, dto);
  }

  @Roles(
    "developer",
    "platform_team",
    "owner",
    "super_admin",
    "admin",
  )
  @Patch("users/:id/status")
  updateUserStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateAccountUserStatusDto,
  ) {
    return this.accountsService.updateUserStatus(
      req.user,
      id,
      dto,
    );
  }

  @Roles(
    "developer",
    "platform_team",
    "owner",
    "super_admin",
    "admin",
  )
  @Delete("users/:id")
  deleteUser(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    return this.accountsService.deleteUser(req.user, id);
  }

  @Patch("schools/:id")
  async updateSchool(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.accountsService.updateOwnerRecord(
      req.user.accountId,
      id,
      body,
    );
  }

  @Patch("branches/:id")
  async updateBranch(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.accountsService.updateOwnerRecord(
      req.user.accountId,
      id,
      body,
    );
  }

  @Delete("schools/:id")
  async deleteSchool(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    return this.accountsService.deleteOwnerRecord(
      req.user.accountId,
      id,
    );
  }

  @Delete("branches/:id")
  async deleteBranch(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    return this.accountsService.deleteOwnerRecord(
      req.user.accountId,
      id,
    );
  }

  @Roles("developer")
  @Get()
  listAccounts(
    @Req() req: any,
    @Query("q") q?: string,
  ) {
    return this.accountsService.listAccounts(req.user, q);
  }

  @Roles("developer")
  @Post()
  createAccount(
    @Req() req: any,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountsService.createAccount(req.user, dto);
  }

  @Get(":accountId/users")
  getUsers(
    @Req() req: any,
    @Param("accountId") accountId: string,
    @Query("schoolId") schoolId?: string,
    @Query("branchId") branchId?: string,
  ) {
    return this.accountsService.getUsers(
      req.user,
      accountId,
      {
        schoolId,
        branchId,
      },
    );
  }

  @Post(":accountId/users")
  createUser(
    @Req() req: any,
    @Param("accountId") accountId: string,
    @Body() dto: CreateAccountUserDto,
  ) {
    return this.accountsService.createUser(
      req.user,
      dto,
      accountId,
    );
  }

  @Get(":accountId")
  getAccount(
    @Req() req: any,
    @Param("accountId") accountId: string,
  ) {
    return this.accountsService.getAccount(
      req.user,
      accountId,
    );
  }

  @Patch(":accountId")
  updateAccount(
    @Req() req: any,
    @Param("accountId") accountId: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.updateAccount(
      req.user,
      accountId,
      dto,
    );
  }

  @Roles("developer")
  @Delete(":accountId")
  closeAccount(
    @Req() req: any,
    @Param("accountId") accountId: string,
  ) {
    return this.accountsService.closeAccount(
      req.user,
      accountId,
    );
  }
}
