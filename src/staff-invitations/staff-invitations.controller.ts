import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StaffInvitationsService } from './staff-invitations.service';

@Controller('staff-invitations')
export class StaffInvitationsController {
  constructor(private readonly service: StaffInvitationsService) {}
  @UseGuards(JwtAuthGuard)
  @Post() create(@Req() req: any, @Body() body: { email: string; role: string; schoolId: string; branchId: string; teacherId?: string }) { return this.service.create(req.user, body); }
  @Get('preview/:token') preview(@Param('token') token: string) { return this.service.preview(token); }
  // Existing users must authenticate; new users create their central account with the invitation.
  @Post('accept/:token') accept(@Param('token') token: string, @Body() body: { fullName?: string; password?: string }) { return this.service.accept(token, body); }
  @UseGuards(JwtAuthGuard)
  @Post('accept-existing/:token') acceptExisting(@Req() req: any, @Param('token') token: string) { return this.service.accept(token, {}, req.user); }
  @UseGuards(JwtAuthGuard)
  @Delete(':id') revoke(@Req() req: any, @Param('id') id: string) { return this.service.revoke(req.user, id); }
}
