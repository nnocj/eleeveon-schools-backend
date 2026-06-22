import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { ADMIN_ROLES, FINANCE_ROLES, TEACHER_ROLES } from "../common/roles";
import { CommunicationsService } from "./communications.service";
import { CreateAnnouncementDto, CreateAnnouncementRecipientDto, CreateMessageDto, CreateMessageThreadDto, CreateNotificationTemplateDto } from "./dto/communications.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES, ...FINANCE_ROLES, ...TEACHER_ROLES)
@Controller("communications")
export class CommunicationsController {
  constructor(private readonly service: CommunicationsService) {}

  @Get("dashboard")
  dashboard(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.dashboard(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Get("announcements")
  listAnnouncements(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listAnnouncements(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("announcements")
  createAnnouncement(@Req() req: any, @Body() dto: CreateAnnouncementDto) {
    return this.service.createAnnouncement(req.user, dto);
  }

  @Post("announcements/:id/publish")
  publishAnnouncement(@Req() req: any, @Param("id") id: string) {
    return this.service.publishAnnouncement(req.user, id);
  }

  @Post("announcement-recipients")
  addRecipient(@Req() req: any, @Body() dto: CreateAnnouncementRecipientDto) {
    return this.service.addAnnouncementRecipient(req.user, dto);
  }

  @Get("threads")
  listThreads(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listThreads(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("threads")
  createThread(@Req() req: any, @Body() dto: CreateMessageThreadDto) {
    return this.service.createThread(req.user, dto);
  }

  @Get("messages")
  listMessages(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listMessages(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("messages")
  sendMessage(@Req() req: any, @Body() dto: CreateMessageDto) {
    return this.service.sendMessage(req.user, dto);
  }

  @Get("templates")
  listTemplates(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listTemplates(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("templates")
  createTemplate(@Req() req: any, @Body() dto: CreateNotificationTemplateDto) {
    return this.service.createTemplate(req.user, dto);
  }
}
