/** Authenticated cross-account support conversations, backed by existing Prisma models. */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/auth-user";
import { SupportStorageService, type SupportAttachment, type SupportFile } from "./support-storage.service";

const KINDS = new Set(["support_request", "suggestion", "complaint", "bug", "feature_request", "billing_question", "general_feedback"]);
const STATUSES = new Set(["submitted", "acknowledged", "under_review", "planned", "in_progress", "resolved", "closed"]);
function text(value: unknown, max = 5000): string { return String(value ?? "").trim().slice(0, max); }
function asAttachments(value: unknown): SupportAttachment[] {
  return Array.isArray(value) ? value.filter((item): item is SupportAttachment =>
    Boolean(item && typeof item === "object" && typeof item.storageKey === "string" && typeof item.name === "string")) : [];
}

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService, private readonly storage: SupportStorageService) {}

  /** Derive platform privileges from an active database membership, not client flags. */
  private async authorize(actor: AuthUser): Promise<{ accountId: string; userId: string; platform: boolean }> {
    const accountId = text(actor?.accountId, 120);
    const userId = text(actor?.id, 120);
    if (!accountId || !userId) throw new ForbiddenException("An authenticated account and user are required.");
    const membership = await this.prisma.userMembership.findFirst({
      where: { accountId, userId, active: true, status: "active" },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException("An active membership is required to use Eleeveon Center.");
    const platformMembership = await this.prisma.userMembership.findFirst({
      where: { accountId, userId, active: true, status: "active", role: { in: ["developer", "platform_team"] } },
      select: { id: true },
    });
    return { accountId, userId, platform: Boolean(platformMembership) };
  }

  private async accessibleConversation(actor: AuthUser, feedbackId: string) {
    const access = await this.authorize(actor);
    const conversation = await this.prisma.platformFeedback.findFirst({
      where: { id: feedbackId, ...(access.platform ? {} : { accountId: access.accountId }) },
      include: { account: { select: { name: true } } },
    });
    if (!conversation) throw new NotFoundException("Support conversation not found.");
    return { access, conversation };
  }

  async list(actor: AuthUser) {
    const access = await this.authorize(actor);
    const rows = await this.prisma.platformFeedback.findMany({
      where: access.platform ? {} : { accountId: access.accountId },
      include: {
        account: { select: { name: true } },
        messages: { where: { internal: false }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    return { conversations: rows.map(({ messages, account, ...row }) => ({
      ...row, organizationName: account?.name || "School", lastMessage: messages[0] ? { body: messages[0].body, createdAt: messages[0].createdAt, authorType: messages[0].authorType } : null,
    })) };
  }

  async open(actor: AuthUser, feedbackId: string) {
    const { access, conversation } = await this.accessibleConversation(actor, feedbackId);
    const messages = await this.prisma.platformFeedbackMessage.findMany({
      where: { feedbackId, ...(access.platform ? {} : { internal: false }) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 700,
    });
    const expanded = await Promise.all(messages.map(async (message) => ({
      ...message,
      attachments: await Promise.all(asAttachments(message.attachments).map(async (item) => ({
        name: item.name, mimeType: item.mimeType, sizeBytes: item.sizeBytes,
        kind: item.kind, url: await this.storage.signedUrl(item),
      }))),
    })));
    return { conversation: { ...conversation, organizationName: conversation.account?.name || "School" }, messages: expanded };
  }

  async create(actor: AuthUser, input: Record<string, unknown>) {
    const access = await this.authorize(actor);
    if (access.platform) throw new ForbiddenException("Start customer conversations from a school workspace.");
    const subject = text(input.subject, 180);
    const body = text(input.body, 16000);
    const type = text(input.type, 60) || "support_request";
    if (!subject || !body) throw new BadRequestException("Enter a subject and message to start a conversation.");
    if (!KINDS.has(type)) throw new BadRequestException("Unknown support category.");
    const requestedSchoolId = text(input.schoolId, 120);
    const requestedBranchId = text(input.branchId, 120);
    if (requestedSchoolId || requestedBranchId) {
      const scopedMembership = await this.prisma.userMembership.findFirst({
        where: {
          accountId: access.accountId, userId: access.userId, active: true, status: "active",
          ...(requestedSchoolId ? { schoolId: requestedSchoolId } : {}),
          ...(requestedBranchId ? { branchId: requestedBranchId } : {}),
        }, select: { id: true },
      });
      if (!scopedMembership) {
        // Account owners may legitimately open school/branch workspaces without
        // one separate membership per school or branch.
        const ownerMembership = await this.prisma.userMembership.findFirst({
          where: { accountId: access.accountId, userId: access.userId, active: true, status: "active", role: { in: ["owner", "super_admin", "admin"] } },
          select: { id: true },
        });
        if (!ownerMembership) throw new ForbiddenException("The selected school or branch is outside this membership.");
      }
    }
    const account = await this.prisma.account.findUnique({ where: { id: access.accountId }, select: { name: true } });
    const created = await this.prisma.platformFeedback.create({
      data: {
        accountId: access.accountId,
        submittedByUserId: access.userId,
        submittedByMembershipId: text(input.membershipId, 120) || null,
        schoolId: requestedSchoolId || null,
        branchId: requestedBranchId || null,
        submittedByName: text(input.name, 180) || null,
        type, priority: "normal", status: "submitted", subject, description: body,
        metadata: { origin: "eleeveon_center", accountName: account?.name || "School" },
      },
    });
    return { conversation: { ...created, organizationName: account?.name || "School" } };
  }

  async send(actor: AuthUser, feedbackId: string, bodyInput: string | undefined, file?: SupportFile, clientId?: string) {
    const { access, conversation } = await this.accessibleConversation(actor, feedbackId);
    const body = text(bodyInput, 16000);
    if (!body && !file?.buffer?.length) throw new BadRequestException("Type a message or attach a file.");
    if (clientId && !/^[0-9a-f-]{36}$/i.test(clientId)) throw new BadRequestException("Invalid message identifier.");
    if (clientId) {
      const existing = await this.prisma.platformFeedbackMessage.findUnique({ where: { id: clientId } });
      if (existing) {
        if (existing.feedbackId !== feedbackId || existing.authorUserId !== access.userId) throw new ForbiddenException("Message identifier already exists.");
        return { message: { ...existing, attachments: await this.expose(existing.attachments) } };
      }
    }
    let attachment: SupportAttachment | null = null;
    if (file?.buffer?.length) attachment = await this.storage.store(conversation.accountId || access.accountId, feedbackId, file);
    const created = await this.prisma.platformFeedbackMessage.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        feedbackId, authorType: access.platform ? "platform" : "school", authorUserId: access.userId,
        body, attachments: attachment ? [{ ...attachment }] : undefined, internal: false,
      },
    });
    await this.prisma.platformFeedback.update({
      where: { id: feedbackId },
      data: access.platform && conversation.status === "submitted" ? { status: "acknowledged" } :
        !access.platform && ["resolved", "closed"].includes(conversation.status) ? { status: "in_progress", closedAt: null, resolvedAt: null } :
          { updatedAt: new Date() },
    });
    return { message: { ...created, attachments: await this.expose(created.attachments) } };
  }

  private async expose(value: unknown) {
    return Promise.all(asAttachments(value).map(async (item) => ({
      name: item.name, mimeType: item.mimeType, sizeBytes: item.sizeBytes,
      kind: item.kind, url: await this.storage.signedUrl(item),
    })));
  }

  async status(actor: AuthUser, feedbackId: string, status: string) {
    const { access } = await this.accessibleConversation(actor, feedbackId);
    if (!access.platform) throw new ForbiddenException("Only the Eleeveon support team can change ticket status.");
    if (!STATUSES.has(status)) throw new BadRequestException("Unknown support status.");
    const updated = await this.prisma.platformFeedback.update({ where: { id: feedbackId }, data: { status,
      ...(status === "resolved" ? { resolvedAt: new Date() } : {}),
      ...(status === "closed" ? { closedAt: new Date() } : {}),
      ...(status === "acknowledged" ? { acknowledgedAt: new Date() } : {}),
      ...(!["closed", "resolved"].includes(status) ? { closedAt: null, resolvedAt: null } : {}),
    } });
    await this.prisma.platformFeedbackStatusEvent.create({ data: {
      feedbackId, toStatus: status, changedByUserId: access.userId,
    } });
    return { conversation: updated };
  }
}
