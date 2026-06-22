import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { FINANCE_ROLES } from "../common/roles";
import { PaymentGatewayService } from "./payment-gateway.service";
import {
  CreatePaymentIntentDto,
  CreatePaymentTransactionDto,
  UpdatePaymentIntentDto,
  VerifyProviderReferenceDto,
} from "./dto/payment-gateway.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FINANCE_ROLES)
@Controller("payment-gateway")
export class PaymentGatewayController {
  constructor(private readonly service: PaymentGatewayService) {}

  @Get("intents")
  listIntents(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listIntents(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("intents")
  createIntent(@Req() req: any, @Body() dto: CreatePaymentIntentDto) {
    return this.service.createIntent(req.user, dto);
  }

  @Patch("intents/:id")
  updateIntent(@Req() req: any, @Param("id") id: string, @Body() dto: UpdatePaymentIntentDto) {
    return this.service.updateIntent(req.user, id, dto);
  }

  @Post("intents/:id/cancel")
  cancelIntent(@Req() req: any, @Param("id") id: string) {
    return this.service.cancelIntent(req.user, id);
  }

  @Get("transactions")
  listTransactions(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listTransactions(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("transactions")
  createTransaction(@Req() req: any, @Body() dto: CreatePaymentTransactionDto) {
    return this.service.createTransaction(req.user, dto);
  }

  @Post("verify-reference")
  verifyReference(@Req() req: any, @Body() dto: VerifyProviderReferenceDto) {
    return this.service.verifyReference(req.user, dto);
  }
}
