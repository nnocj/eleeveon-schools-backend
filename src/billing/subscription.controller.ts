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
  async apply(
    @Param("id") id: string,
    @Req() request: AuthRequest,
  ) {
    // The ID alone must never grant access to another account's change order.
    await this.changes.getForAccount(request.user.accountId, id);
    return this.changes.apply(id, {
      appliedByUserId: request.user.id,
    });
  }

  @Post("change-orders/:id/schedule")
  async schedule(@Param("id") id: string, @Req() request: AuthRequest) {
    await this.changes.getForAccount(request.user.accountId, id);
    return this.changes.scheduleDowngrade(id);
  }
}
