import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { AccountsService } from "./accounts.service";
import { CreateAccountDto, CreateAccountUserDto, UpdateAccountDto, UpdateAccountUserDto, UpdateAccountUserStatusDto } from "./dto/account-users.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("accounts")
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Roles("developer")
  @Get()
  listAccounts(@Req() req: any, @Query("q") q?: string) {
    return this.accountsService.listAccounts(req.user, q);
  }

  @Roles("developer")
  @Post()
  createAccount(@Req() req: any, @Body() dto: CreateAccountDto) {
    return this.accountsService.createAccount(req.user, dto);
  }

  @Get("me")
  me(@Req() req: any) {
    return this.accountsService.getAccount(req.user);
  }

  @Get(":accountId")
  getAccount(@Req() req: any, @Param("accountId") accountId: string) {
    return this.accountsService.getAccount(req.user, accountId);
  }

  @Patch(":accountId")
  updateAccount(@Req() req: any, @Param("accountId") accountId: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.updateAccount(req.user, accountId, dto);
  }

  @Roles("developer")
  @Delete(":accountId")
  closeAccount(@Req() req: any, @Param("accountId") accountId: string) {
    return this.accountsService.closeAccount(req.user, accountId);
  }

  @Get("me/users")
  getMyUsers(@Req() req: any) {
    return this.accountsService.getUsers(req.user);
  }

  @Get(":accountId/users")
  getUsers(@Req() req: any, @Param("accountId") accountId: string) {
    return this.accountsService.getUsers(req.user, accountId);
  }

  @Post("me/users")
  createMyUser(@Req() req: any, @Body() dto: CreateAccountUserDto) {
    return this.accountsService.createUser(req.user, dto);
  }

  @Post(":accountId/users")
  createUser(@Req() req: any, @Param("accountId") accountId: string, @Body() dto: CreateAccountUserDto) {
    return this.accountsService.createUser(req.user, dto, accountId);
  }

  @Patch("users/:id")
  updateUser(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateAccountUserDto) {
    return this.accountsService.updateUser(req.user, id, dto);
  }

  @Patch("users/:id/status")
  updateUserStatus(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateAccountUserStatusDto) {
    return this.accountsService.updateUserStatus(req.user, id, dto);
  }

  @Delete("users/:id")
  deleteUser(@Req() req: any, @Param("id") id: string) {
    return this.accountsService.deleteUser(req.user, id);
  }

  @Get("me/schools")
async mySchools(@Req() req: any) {
  return this.accountsService.getOwnerRecords(req.user.accountId, "schools");
}

@Get("me/branches")
async myBranches(@Req() req: any) {
  return this.accountsService.getOwnerRecords(req.user.accountId, "branches");
}

@Post("me/schools")
async createSchool(@Req() req: any, @Body() body: any) {
  return this.accountsService.createOwnerRecord(req.user.accountId, "schools", body);
}

@Post("me/branches")
async createBranch(@Req() req: any, @Body() body: any) {
  return this.accountsService.createOwnerRecord(req.user.accountId, "branches", body);
}

@Patch("schools/:id")
async updateSchool(@Req() req: any, @Param("id") id: string, @Body() body: any) {
  return this.accountsService.updateOwnerRecord(req.user.accountId, id, body);
}

@Patch("branches/:id")
async updateBranch(@Req() req: any, @Param("id") id: string, @Body() body: any) {
  return this.accountsService.updateOwnerRecord(req.user.accountId, id, body);
}

@Delete("schools/:id")
async deleteSchool(@Req() req: any, @Param("id") id: string) {
  return this.accountsService.deleteOwnerRecord(req.user.accountId, id);
}

@Delete("branches/:id")
async deleteBranch(@Req() req: any, @Param("id") id: string) {
  return this.accountsService.deleteOwnerRecord(req.user.accountId, id);
}
}
