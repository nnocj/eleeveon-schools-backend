import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { RecordStoreService } from "../payment-gateway/record-store.service";
import { CreateAnnouncementDto, CreateAnnouncementRecipientDto, CreateMessageDto, CreateMessageThreadDto, CreateNotificationTemplateDto } from "./dto/communications.dto";

@Injectable()
export class CommunicationsService {
  constructor(private readonly records: RecordStoreService) {}

  async dashboard(user: AuthUser, schoolId?: number, branchId?: number) {
    const [announcements, recipients, threads, messages, logs] = await Promise.all([
      this.records.list(user, "announcements", { schoolId, branchId }),
      this.records.list(user, "announcementRecipients", { schoolId, branchId }),
      this.records.list(user, "messageThreads", { schoolId, branchId }),
      this.records.list(user, "messages", { schoolId, branchId }),
      this.records.list(user, "communicationLogs", { schoolId, branchId }),
    ]);

    return {
      announcementCount: announcements.length,
      recipientCount: recipients.length,
      threadCount: threads.length,
      messageCount: messages.length,
      logCount: logs.length,
      failedDeliveries: logs.filter((row: any) => row.status === "failed").length,
    };
  }

  listAnnouncements(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "announcements", { schoolId, branchId });
  }

  createAnnouncement(user: AuthUser, dto: CreateAnnouncementDto) {
    return this.records.create(user, "announcements", {
      ...dto,
      priority: dto.priority || "normal",
      published: false,
      createdBy: user.id,
    });
  }

  publishAnnouncement(user: AuthUser, id: string) {
    return this.records.update(user, "announcements", id, {
      published: true,
      publishedAt: new Date().toISOString(),
    });
  }

  addAnnouncementRecipient(user: AuthUser, dto: CreateAnnouncementRecipientDto) {
    return this.records.create(user, "announcementRecipients", {
      ...dto,
      status: "queued",
    });
  }

  listThreads(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "messageThreads", { schoolId, branchId });
  }

  createThread(user: AuthUser, dto: CreateMessageThreadDto) {
    return this.records.create(user, "messageThreads", {
      ...dto,
      createdBy: user.id,
      archived: false,
      lastMessageAt: new Date().toISOString(),
    });
  }

  listMessages(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "messages", { schoolId, branchId });
  }

  async sendMessage(user: AuthUser, dto: CreateMessageDto) {
    const message = await this.records.create(user, "messages", {
      ...dto,
      senderUserId: user.id,
      senderRole: user.role,
      status: "sent",
      deliveredAt: new Date().toISOString(),
    });

    await this.records.create(user, "communicationLogs", {
      schoolId: dto.schoolId,
      branchId: dto.branchId,
      channel: dto.channel || "in_app",
      purpose: "message",
      relatedTable: "messages",
      relatedLocalId: message.id,
      subject: "Message",
      body: dto.body,
      status: "sent",
      sentAt: new Date().toISOString(),
      deliveredAt: new Date().toISOString(),
    });

    return message;
  }

  listTemplates(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "notificationTemplates", { schoolId, branchId });
  }

  createTemplate(user: AuthUser, dto: CreateNotificationTemplateDto) {
    return this.records.create(user, "notificationTemplates", {
      ...dto,
      active: true,
    });
  }
}
