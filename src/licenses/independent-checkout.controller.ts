import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthRequest } from "../common/auth-user";
import { IndependentCheckoutService } from "./independent-checkout.service";
@UseGuards(JwtAuthGuard)
@Controller("licenses/independent-checkout")
export class IndependentCheckoutController {
 constructor(private readonly checkout:IndependentCheckoutService){}
 @Post() start(@Req() req:AuthRequest,@Body() body:{planId:string;payerEmail:string}){return this.checkout.start(req.user,body.planId,body.payerEmail);}
 @Get("latest") latest(@Req() req:AuthRequest){return this.checkout.latest(req.user);}
 @Get(":id") status(@Req() req:AuthRequest,@Param("id") id:string){return this.checkout.status(req.user,id);}
 @Post(":id/verify") verify(@Req() req:AuthRequest,@Param("id") id:string){return this.checkout.verify(req.user,id);}
}
