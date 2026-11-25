import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../common/auth-user';
import { DriveService } from './drive.service';
@Controller('drive-connection')
@UseGuards(JwtAuthGuard)
export class DriveController {
 constructor(private readonly drive: DriveService) {}
 @Get('status') status(@Req() req:{user:AuthUser}) { return this.drive.status(req.user); }
 @Post('begin') begin(@Req() req:{user:AuthUser}) { return this.drive.begin(req.user); }
 @Post('complete') complete(@Req() req:{user:AuthUser}, @Body() body:{code:string;state:string}) { return this.drive.complete(req.user,body?.code,body?.state); }
 @Post('validate') validate(@Req() req:{user:AuthUser}) { return this.drive.validate(req.user); }
 @Get('backups') list(@Req() req:{user:AuthUser}) { return this.drive.listBackups(req.user); }
 @Get('backups/:id') download(@Req() req:{user:AuthUser}, @Param('id') id:string) { return this.drive.downloadBackup(req.user,id); }
 @Post('backups') upload(@Req() req:{user:AuthUser}, @Body() body:{encrypted:string}) { return this.drive.uploadBackup(req.user,body?.encrypted); }
 @Post('disconnect') disconnect(@Req() req:{user:AuthUser}) { return this.drive.disconnect(req.user); }
}
