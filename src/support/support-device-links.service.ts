/**
 * Eleeveon Hub — authenticated device pairing and opaque historical-key relay.
 * The server NEVER receives plaintext messages, attachment keys or private keys.
 * Requires migrated Prisma schema. QR/code UI and WebCrypto wrapping are separate
 * frontend responsibilities; see docs/INTEGRATION.md for exact signed contracts.
 */
import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
  HttpException, HttpStatus,
} from "@nestjs/common";
import { createHmac, createPublicKey, randomInt, randomUUID, verify as verifySignature } from "node:crypto";
import type { AuthUser } from "../common/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { SupportService } from "./support.service";
import { SupportStorageService, type SupportAttachment } from "./support-storage.service";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CODE = /^\d{10}$/;
const B64URL = /^[a-zA-Z0-9_-]+$/;
const LINK_TTL_MS = 5 * 60 * 1000;
const PAIRING_PROOF_VERSION = "ELEEVEON_HUB_PAIR_V1";
const HISTORY_PROOF_VERSION = 1;
const PER_PAGE_MAX = 100;
const HISTORY_BATCH_MAX = 100;

function asId(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function publicJwk(value: any): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    value.kty === "EC" && value.crv === "P-256" &&
    typeof value.x === "string" && typeof value.y === "string" &&
    /^[a-zA-Z0-9_-]{43,44}$/.test(value.x) && /^[a-zA-Z0-9_-]{43,44}$/.test(value.y) &&
    !Object.prototype.hasOwnProperty.call(value, "d");
}
function signedBy(jwk: unknown, data: string, signature: unknown): boolean {
  if (!publicJwk(jwk) || typeof signature !== "string" || !B64URL.test(signature) || signature.length > 120) return false;
  try {
    const raw = Buffer.from(signature, "base64url");
    return raw.length === 64 && verifySignature("sha256", Buffer.from(data, "utf8"),
      { key: createPublicKey({ key: jwk as any, format: "jwk" }), dsaEncoding: "ieee-p1363" }, raw);
  } catch { return false; }
}
function validWrappedKey(value: any): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.v !== 1 || value.algorithm !== "ECDH-P256-AES-GCM" || !publicJwk(value.ephemeralPublicJwk)) return false;
  if (typeof value.iv !== "string" || typeof value.ciphertext !== "string" ||
      !B64URL.test(value.iv) || !B64URL.test(value.ciphertext)) return false;
  if (Buffer.from(value.iv, "base64url").length !== 12 || Buffer.from(value.ciphertext, "base64url").length < 17) return false;
  return JSON.stringify(value).length <= 12000;
}
function asAttachments(value: any): SupportAttachment[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item.storageKey === "string" &&
    typeof item.name === "string" && item.storageKey.length < 500) : [];
}

type HistoryInput = { conversationId: string; messageId: string; wrappedKey: unknown; signature: string };

@Injectable()
export class SupportDeviceLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SupportService,
    private readonly storage: SupportStorageService,
  ) {}

  private async account(actor: AuthUser) {
    const accountId = asId(actor?.accountId), userId = asId(actor?.id);
    if (!UUID.test(accountId) || !UUID.test(userId)) throw new ForbiddenException("Sign in to your account first.");
    const member = await this.prisma.userMembership.findFirst({
      where: { accountId, userId, active: true, status: "active" }, select: { id: true },
    });
    if (!member) throw new ForbiddenException("An active membership is required.");
    return { accountId, userId };
  }

  private secret(): string {
    const secret = String(process.env.SUPPORT_PAIRING_CODE_SECRET || "");
    if (Buffer.byteLength(secret, "utf8") < 32) {
      // Never fall back to a predictable or JWT/shared application secret.
      throw new Error("SUPPORT_PAIRING_CODE_SECRET must contain at least 32 bytes.");
    }
    return secret;
  }
  private codeHash(code: string): string {
    return createHmac("sha256", this.secret()).update(`eleeveon-hub-code-v1:${code}`).digest("hex");
  }

  private async rateLimit(accountId: string, userId: string) {
    const minuteAgo = new Date(Date.now() - 60_000);
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const [minute, hour] = await Promise.all([
      this.prisma.supportPairingAttempt.count({ where: { userId, createdAt: { gte: minuteAgo } } }),
      this.prisma.supportPairingAttempt.count({ where: { userId, createdAt: { gte: hourAgo } } }),
    ]);
    if (minute >= 6 || hour >= 25) throw new HttpException("Too many linking attempts. Try later.", HttpStatus.TOO_MANY_REQUESTS);
    await this.prisma.supportPairingAttempt.create({ data: { accountId, userId } });
  }

  private async linkedDevice(accountId: string, userId: string, id: string) {
    if (!UUID.test(id)) throw new BadRequestException("Invalid device ID.");
    const row = await this.prisma.supportEncryptionDevice.findFirst({
      where: { id, accountId, userId, revokedAt: null, linkedAt: { not: null } },
    });
    if (!row) throw new ForbiddenException("This device is not approved for this account.");
    return row;
  }

  private async getLink(actor: AuthUser, id: string) {
    const identity = await this.account(actor);
    if (!UUID.test(id)) throw new BadRequestException("Invalid link ID.");
    const row = await this.prisma.supportDeviceLink.findFirst({ where: { id, ...identity } });
    if (!row) throw new NotFoundException("Link request not found.");
    return { identity, row };
  }

  async devices(actor: AuthUser) {
    const identity = await this.account(actor);
    const devices = await this.prisma.supportEncryptionDevice.findMany({
      where: identity, orderBy: { registeredAt: "desc" }, take: 100,
      select: { id: true, fingerprint: true, registeredAt: true, linkedAt: true, revokedAt: true,
        linkedByDeviceId: true, lastSeenAt: true, deviceName: true },
    });
    return { devices: devices.map(device => ({ ...device,
      status: device.revokedAt ? "revoked" : device.linkedAt ? "linked" : "pending" })) };
  }

  /** Initiated on the NEW signed-in device after it registers its public keys. */
  async start(actor: AuthUser, input: Record<string, unknown>) {
    const identity = await this.account(actor);
    const targetDeviceId = asId(input.targetDeviceId);
    if (!UUID.test(targetDeviceId)) throw new BadRequestException("Register the new device's public keys first.");
    const target = await this.prisma.supportEncryptionDevice.findFirst({ where: { id: targetDeviceId, ...identity, revokedAt: null } });
    if (!target) throw new NotFoundException("New device not found.");
    if (target.linkedAt) throw new BadRequestException("This device is already linked.");
    await this.rateLimit(identity.accountId, identity.userId);
    const count = await this.prisma.supportDeviceLink.count({
      where: { ...identity, targetDeviceId, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    });
    if (count >= 10) throw new HttpException("Too many requests for this device.", HttpStatus.TOO_MANY_REQUESTS);
    await this.prisma.supportDeviceLink.updateMany({
      where: { ...identity, targetDeviceId, status: "pending" }, data: { status: "cancelled" },
    });
    const id = randomUUID();
    const code = String(randomInt(0, 10_000_000_000)).padStart(10, "0");
    const codeHash = this.codeHash(code);
    const link = await this.prisma.supportDeviceLink.create({ data: {
      id, ...identity, targetDeviceId, codeHash, challenge: randomUUID(),
      deviceName: String(input.deviceName || "New device").trim().slice(0, 80),
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    } });
    // Only the newly authenticated device receives this one-time code.
    return { id: link.id, code, expiresAt: link.expiresAt,
      qrPayload: `eleeveon-hub-link:v1:${link.id}:${code}`,
      targetDeviceId, targetFingerprint: target.fingerprint };
  }

  /** Existing trusted device enters a 10-digit code; lookup is rate-limited. */
  async lookup(actor: AuthUser, input: Record<string, unknown>) {
    const identity = await this.account(actor);
    const code = asId(input.code);
    if (!CODE.test(code)) throw new BadRequestException("Enter the 10-digit linking code.");
    await this.rateLimit(identity.accountId, identity.userId);
    const link = await this.prisma.supportDeviceLink.findFirst({
      where: { ...identity, codeHash: this.codeHash(code), status: "pending", expiresAt: { gt: new Date() } },
    });
    if (!link) throw new NotFoundException("Code expired or not found.");
    const target = await this.prisma.supportEncryptionDevice.findFirst({
      where: { id: link.targetDeviceId, ...identity, revokedAt: null },
      select: { fingerprint: true, id: true },
    });
    if (!target) throw new NotFoundException("New device is unavailable.");
    return { id: link.id, targetDeviceId: link.targetDeviceId, targetFingerprint: target.fingerprint,
      deviceName: link.deviceName, challenge: link.challenge, expiresAt: link.expiresAt };
  }

  /** Verify a proof from the OLD trusted device, then activate the new public key. */
  async approve(actor: AuthUser, id: string, input: Record<string, unknown>) {
    const { identity, row } = await this.getLink(actor, id);
    await this.rateLimit(identity.accountId, identity.userId);
    if (row.status !== "pending" || row.expiresAt <= new Date() || row.attemptCount >= 5) {
      throw new ForbiddenException("This linking request is closed or expired.");
    }
    const code = asId(input.code);
    const sourceDeviceId = asId(input.sourceDeviceId);
    if (!CODE.test(code) || !UUID.test(sourceDeviceId) || sourceDeviceId === row.targetDeviceId ||
        this.codeHash(code) !== row.codeHash) {
      await this.prisma.supportDeviceLink.update({ where: { id }, data: { attemptCount: { increment: 1 } } });
      throw new ForbiddenException("Invalid linking approval.");
    }
    const source = await this.linkedDevice(identity.accountId, identity.userId, sourceDeviceId);
    const message = `${PAIRING_PROOF_VERSION}|${id}|${row.targetDeviceId}|${row.challenge}|${code}`;
    if (!signedBy(source.signingPublicJwk, message, input.signature)) {
      await this.prisma.supportDeviceLink.update({ where: { id }, data: { attemptCount: { increment: 1 } } });
      throw new ForbiddenException("The trusted device did not sign this approval.");
    }
    // Conditional update is single-winner; concurrent/replayed approvals cannot both succeed.
    const changed = await this.prisma.supportDeviceLink.updateMany({
      where: { id, status: "pending", expiresAt: { gt: new Date() }, attemptCount: { lt: 5 } },
      data: { status: "approved", approvedByDeviceId: sourceDeviceId, approvedAt: new Date() },
    });
    if (changed.count !== 1) throw new ForbiddenException("Link already processed or expired.");
    const target = await this.prisma.supportEncryptionDevice.updateMany({
      where: { id: row.targetDeviceId, ...identity, linkedAt: null, revokedAt: null },
      data: { linkedAt: new Date(), linkedByDeviceId: sourceDeviceId, deviceName: row.deviceName },
    });
    if (target.count !== 1) throw new ForbiddenException("Target device is no longer available.");
    return { status: "approved", targetDeviceId: row.targetDeviceId, sourceDeviceId,
      historyTransfer: "pending", message: "Device linked. Transfer historical message keys from the trusted device." };
  }

  async status(actor: AuthUser, id: string) {
    const { row } = await this.getLink(actor, id);
    return { id: row.id, status: row.expiresAt <= new Date() && row.status === "pending" ? "expired" : row.status,
      targetDeviceId: row.targetDeviceId, approvedByDeviceId: row.approvedByDeviceId,
      expiresAt: row.expiresAt, approvedAt: row.approvedAt, completedAt: row.completedAt };
  }

  async cancel(actor: AuthUser, id: string) {
    const { row } = await this.getLink(actor, id);
    if (row.status !== "pending") throw new BadRequestException("Only pending requests can be cancelled.");
    await this.prisma.supportDeviceLink.updateMany({ where: { id, status: "pending" }, data: { status: "cancelled" } });
    return { status: "cancelled" };
  }

  /** Source device decrypts each old message key locally and wraps it to the target public key.
   * The server checks authorization, a signed batch, and opaque structure only. */
  async uploadHistory(actor: AuthUser, id: string, input: Record<string, unknown>) {
    const { identity, row } = await this.getLink(actor, id);
    if (row.status !== "approved" && row.status !== "completed") {
      throw new ForbiddenException("Approve the new device before sharing history keys.");
    }
    const sourceDeviceId = asId(input.sourceDeviceId);
    if (sourceDeviceId !== row.approvedByDeviceId) throw new ForbiddenException("Only the approving trusted device can share history.");
    const source = await this.linkedDevice(identity.accountId, identity.userId, sourceDeviceId);
    await this.linkedDevice(identity.accountId, identity.userId, row.targetDeviceId);
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > HISTORY_BATCH_MAX) {
      throw new BadRequestException("Supply 1 to 100 encrypted message keys.");
    }
    const items: HistoryInput[] = input.items as HistoryInput[];
    const seen = new Set<string>();
    for (const entry of items) {
      if (!entry || !UUID.test(asId(entry.conversationId)) ||
          !(UUID.test(asId(entry.messageId)) || entry.messageId === `${entry.conversationId}-opening`) ||
          !validWrappedKey(entry.wrappedKey)) throw new BadRequestException("Invalid encrypted key entry.");
      const signedItem = JSON.stringify({ v: HISTORY_PROOF_VERSION, linkId: id, sourceDeviceId,
        targetDeviceId: row.targetDeviceId, conversationId: entry.conversationId,
        messageId: entry.messageId, wrappedKey: entry.wrappedKey });
      if (!signedBy(source.signingPublicJwk, signedItem, entry.signature)) {
        throw new ForbiddenException("One of the historical key envelopes has an invalid signature.");
      }
      if (seen.has(entry.messageId)) throw new BadRequestException("Duplicate message in key batch.");
      seen.add(entry.messageId);
    }
    if (JSON.stringify(items).length > 1_300_000) {
      throw new BadRequestException("History-key batch is too large.");
    }
    const conversationIds = [...new Set(items.map(item => item.conversationId))];
    if (conversationIds.length > 30) throw new BadRequestException("Too many conversations in one key batch.");
    for (const conversationId of conversationIds) await this.support.assertConversationAccess(actor, conversationId);
    const ordinary = items.filter(item => UUID.test(item.messageId));
    const messages = ordinary.length ? await this.prisma.platformFeedbackMessage.findMany({
      where: { id: { in: ordinary.map(item => item.messageId) } },
      select: { id: true, feedbackId: true, body: true },
    }) : [];
    const matching = new Map(messages.map(message => [message.id, message]));
    const opening = items.filter(item => !UUID.test(item.messageId));
    const openings = opening.length ? await this.prisma.platformFeedback.findMany({
      where: { id: { in: opening.map(item => item.conversationId) } },
      select: { id: true, description: true },
    }) : [];
    const openingMap = new Map(openings.map(c => [c.id, c.description]));
    for (const item of items) {
      if (item.messageId === `${item.conversationId}-opening`) {
        if (!String(openingMap.get(item.conversationId) || "").startsWith("ELEEVEON_E2EE_V1:")) {
          throw new BadRequestException("Encrypted opening message was not found.");
        }
      } else {
        const message = matching.get(item.messageId);
        if (!message || message.feedbackId !== item.conversationId || !message.body.startsWith("ELEEVEON_E2EE_V1:")) {
          throw new BadRequestException("A message is missing or does not contain an encrypted envelope.");
        }
      }
    }
    const result = await this.prisma.supportHistoryKey.createMany({
      data: items.map(item => ({
        linkId: id, conversationId: item.conversationId, messageId: item.messageId,
        targetDeviceId: row.targetDeviceId, sourceDeviceId,
        wrappedKey: item.wrappedKey as any, signature: item.signature,
      })), skipDuplicates: true,
    });
    return { accepted: result.count, duplicates: items.length - result.count };
  }

  async complete(actor: AuthUser, id: string, input: Record<string, unknown>) {
    const { identity, row } = await this.getLink(actor, id);
    if (row.status !== "approved" && row.status !== "completed") throw new ForbiddenException("Link is not approved.");
    const sourceDeviceId = asId(input.sourceDeviceId);
    if (sourceDeviceId !== row.approvedByDeviceId) throw new ForbiddenException("Wrong trusted device.");
    const source = await this.linkedDevice(identity.accountId, identity.userId, sourceDeviceId);
    const signed = `${PAIRING_PROOF_VERSION}|complete|${id}|${row.targetDeviceId}|${row.challenge}`;
    if (!signedBy(source.signingPublicJwk, signed, input.signature)) throw new ForbiddenException("Completion needs a trusted-device signature.");
    await this.prisma.supportDeviceLink.update({ where: { id }, data: { status: "completed", completedAt: new Date() } });
    return { status: "completed", historyTransfer: "finished_by_source" };
  }

  /** Cursor-based inbox history beyond the existing 300-conversation list cap.
   * Each candidate is independently checked against SupportService audience policy. */
  async conversationPage(actor: AuthUser, input: { before?: string; limit?: string }) {
    const identity = await this.account(actor);
    const requested = Number(input.limit || 50);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 75) : 50;
    const platformAccount = String(process.env.ELEEVEON_PLATFORM_ACCOUNT_ID || "").trim();
    const platformMember = platformAccount && platformAccount === identity.accountId ?
      await this.prisma.userMembership.findFirst({ where: {
        ...identity, active: true, status: "active", role: { in: ["developer", "platform_team"] },
      }, select: { id: true } }) : null;
    const before = asId(input.before);
    let cursor: { id: string; updatedAt: Date } | null = null;
    if (before) {
      if (!UUID.test(before)) throw new BadRequestException("Invalid conversation cursor.");
      cursor = await this.prisma.platformFeedback.findUnique({
        where: { id: before }, select: { id: true, updatedAt: true },
      });
      if (!cursor) throw new BadRequestException("Conversation cursor not found.");
    }
    const candidates = await this.prisma.platformFeedback.findMany({
      where: { ...(platformMember ? {} : { accountId: identity.accountId }),
        ...(cursor ? { OR: [{ updatedAt: { lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: limit + 1,
      include: { account: { select: { name: true } },
        messages: { where: { internal: false }, orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const hasMore = candidates.length > limit;
    const slice = candidates.slice(0, limit);
    const allowed: Array<Record<string, unknown>> = [];
    for (const candidate of slice) {
      try {
        await this.support.assertConversationAccess(actor, candidate.id);
        const { messages, account, ...record } = candidate;
        allowed.push({ ...record, organizationName: account?.name || "School",
          lastMessage: messages[0] ? { body: messages[0].body,
            createdAt: messages[0].createdAt, authorType: messages[0].authorType } : null });
      } catch (error) {
        if (!(error instanceof ForbiddenException) && !(error instanceof NotFoundException)) throw error;
      }
    }
    return { conversations: allowed, hasMore,
      nextCursor: hasMore && slice.length ? slice[slice.length - 1].id : null };
  }

  /** Read one page of the stored ciphertext. Existing open() remains backward compatible. */
  async messagePage(actor: AuthUser, conversationId: string, input: { before?: string; limit?: string; deviceId?: string }) {
    const identity = await this.account(actor);
    await this.support.assertConversationAccess(actor, conversationId);
    const requested = Number(input.limit || 75);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), PER_PAGE_MAX) : 75;
    const before = asId(input.before);
    const deviceId = asId(input.deviceId);
    if (deviceId) await this.linkedDevice(identity.accountId, identity.userId, deviceId);
    let cursorMessage: {id:string; createdAt:Date}|null = null;
    if (before) {
      if (!UUID.test(before)) throw new BadRequestException("Invalid message cursor.");
      cursorMessage = await this.prisma.platformFeedbackMessage.findFirst({
        where: { id: before, feedbackId: conversationId }, select: { id: true, createdAt: true },
      });
      if (!cursorMessage) throw new BadRequestException("Message cursor was not found in this conversation.");
    }
    const messages = await this.prisma.platformFeedbackMessage.findMany({
      where: { feedbackId: conversationId, internal: false,
        ...(cursorMessage ? { OR: [ { createdAt: { lt: cursorMessage.createdAt } },
          { createdAt: cursorMessage.createdAt, id: { lt: cursorMessage.id } } ] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1,
    });
    const hasMore = messages.length > limit;
    const page = messages.slice(0, limit);
    const historyKeys = deviceId && page.length ? await this.prisma.supportHistoryKey.findMany({
      where: { targetDeviceId: deviceId, messageId: { in: page.map(message => message.id) } },
      select: { messageId: true, sourceDeviceId: true, wrappedKey: true, signature: true, linkId: true },
    }) : [];
    const openingHistoryKey = deviceId && !before ? await this.prisma.supportHistoryKey.findUnique({
      where: { messageId_targetDeviceId: { messageId: `${conversationId}-opening`, targetDeviceId: deviceId } },
      select: { messageId: true, sourceDeviceId: true, wrappedKey: true, signature: true, linkId: true },
    }) : null;
    const attachments = await Promise.all(page.map(async message => ({
      ...message, attachments: await Promise.all(asAttachments(message.attachments).map(async attachment => ({
        name: attachment.name, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes,
        kind: attachment.kind, url: await this.storage.signedUrl(attachment),
      }))),
    })));
    return {
      messages: attachments.reverse(), historyKeys, openingHistoryKey,
      hasMore, nextCursor: hasMore && page.length ? page[page.length - 1].id : null,
    };
  }

  async revoke(actor: AuthUser, deviceId: string, input: Record<string, unknown>) {
    const identity = await this.account(actor);
    if (!UUID.test(deviceId)) throw new BadRequestException("Invalid device ID.");
    const sourceDeviceId = asId(input.sourceDeviceId);
    if (deviceId === sourceDeviceId) throw new BadRequestException("Use account security to unlink your current device.");
    const source = await this.linkedDevice(identity.accountId, identity.userId, sourceDeviceId);
    const target = await this.prisma.supportEncryptionDevice.findFirst({ where: { id: deviceId, ...identity, revokedAt: null } });
    if (!target) throw new NotFoundException("Device not found.");
    const message = `${PAIRING_PROOF_VERSION}|revoke|${deviceId}|${sourceDeviceId}`;
    if (!signedBy(source.signingPublicJwk, message, input.signature)) throw new ForbiddenException("Revocation needs trusted-device approval.");
    await this.prisma.supportEncryptionDevice.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
    await this.prisma.supportHistoryKey.deleteMany({ where: { targetDeviceId: deviceId } });
    await this.prisma.supportDeviceLink.updateMany({ where: { targetDeviceId: deviceId, status: { in: ["pending", "approved"] } },
      data: { status: "cancelled" } });
    return { revoked: true };
  }
}
