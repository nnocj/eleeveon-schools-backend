import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthRequest } from "../common/auth-user";
import { CreateSubscriptionQuoteDto } from "./dto/subscription-quote.dto";
import { SubscriptionChangeService } from "./subscription-change.service";

@Controller("billing/subscriptions")
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(
    private readonly changes: SubscriptionChangeService,
  ) {}

  @Post("quote")
  quote(
    @Body() dto: CreateSubscriptionQuoteDto,
    @Req() request: AuthRequest,
  ) {
    return this.changes.quote(
      request.user.accountId,
      dto,
    );
  }

  @Post("change-orders")
  createOrder(
    @Body() dto: CreateSubscriptionQuoteDto,
    @Req() request: AuthRequest,
  ) {
    return this.changes.createOrder(
      request.user.accountId,
      dto,
    );
  }

  @Post("change-orders/:id/apply")
  apply(
    @Param("id") id: string,
    @Req() request: AuthRequest,
  ) {
    return this.changes.apply(id, {
      appliedByUserId: request.user.id,
    });
  }

  @Post("change-orders/:id/schedule")
  schedule(@Param("id") id: string) {
    return this.changes.scheduleDowngrade(id);
  }
}
