import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { FINANCE_ROLES } from "../common/roles";
import { PayrollService } from "./payroll.service";
import { CreatePayrollItemDto, CreatePayrollProfileDto, CreatePayrollRunDto, PayPayrollItemDto, PayrollStatusDto } from "./dto/payroll.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FINANCE_ROLES)
@Controller("payroll")
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  @Get("dashboard")
  dashboard(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.dashboard(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Get("profiles")
  listProfiles(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listProfiles(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("profiles")
  createProfile(@Req() req: any, @Body() dto: CreatePayrollProfileDto) {
    return this.service.createProfile(req.user, dto);
  }

  @Patch("profiles/:id")
  updateProfile(@Req() req: any, @Param("id") id: string, @Body() dto: Partial<CreatePayrollProfileDto>) {
    return this.service.updateProfile(req.user, id, dto);
  }

  @Get("runs")
  listRuns(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listRuns(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("runs")
  createRun(@Req() req: any, @Body() dto: CreatePayrollRunDto) {
    return this.service.createRun(req.user, dto);
  }

  @Patch("runs/:id/status")
  updateRunStatus(@Req() req: any, @Param("id") id: string, @Body() dto: PayrollStatusDto) {
    return this.service.updateRunStatus(req.user, id, dto);
  }

  @Get("items")
  listItems(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listItems(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("items")
  createItem(@Req() req: any, @Body() dto: CreatePayrollItemDto) {
    return this.service.createItem(req.user, dto);
  }

  @Post("items/:id/pay")
  payItem(@Req() req: any, @Param("id") id: string, @Body() dto: PayPayrollItemDto) {
    return this.service.payItem(req.user, id, dto);
  }
}
