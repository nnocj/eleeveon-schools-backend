import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffInvitationsController } from './staff-invitations.controller';
import { StaffInvitationsService } from './staff-invitations.service';
@Module({ imports: [AuthModule], controllers: [StaffInvitationsController], providers: [StaffInvitationsService] })
export class StaffInvitationsModule {}
