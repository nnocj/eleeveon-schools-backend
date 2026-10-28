/** Authenticated cross-account support conversations, backed by existing Prisma models. */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/auth-user";
import { SupportStorageService, type SupportAttachment, type SupportFile } from "./support-storage.service";

const E2EE_PREFIX = "ELEEVEON_E2EE_V1:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validPublicKey(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") return false;
  const key = value as Record<string, any>;
  return key.kty === "EC" && key.crv === "P-256" &&
    typeof key.x === "string" && typeof key.y === "string" &&
    /^[a-zA-Z0-9_-]{43,44}$/.test(key.x) && /^[a-zA-Z0-9_-]{43,44}$/.test(key.y) &&
    !Object.prototype.hasOwnProperty.call(key, "d");
}
function fingerprint(encryption: Record<string, string>, signing: Record<string, string>): string {
  const raw = `${encryption.x}.${encryption.y}|${signing.x}.${signing.y}`;
  const hex = createHash("sha256").update(raw).digest("hex").slice(0, 32).toUpperCase();
  return hex.match(/.{1,4}/g)!.join(" ");
}
function decodeEnvelope(value: string, feedbackId: string, messageId: string) {
  if (!value.startsWith(E2EE_PREFIX) || value.length > 250000) throw new BadRequestException("An encrypted message payload is required.");
  let envelope: any;
  try { envelope = JSON.parse(Buffer.from(value.slice(E2EE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); }
  catch { throw new BadRequestException("Invalid encrypted payload."); }
  if (envelope?.v !== 1 || envelope.conversationId !== feedbackId || envelope.messageId !== messageId ||
    !UUID_RE.test(String(envelope.fromDeviceId || "")) || !Array.isArray(envelope.keys) ||
    envelope.keys.length < 2 || envelope.keys.length > 100 || typeof envelope.signature !== "string" ||
    typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") {
    throw new BadRequestException("The encrypted payload is malformed or bound to a different message.");
  }
  return envelope;
}
const KINDS = new Set(["support_request", "suggestion", "complaint", "bug", "feature_request", "billing_question", "general_feedback"]);
const STATUSES = new Set(["submitted", "acknowledged", "under_review", "planned", "in_progress", "resolved", "closed"]);
function text(value: unknown, max = 5000): string { return String(value ?? "").trim().slice(0, max); }
function asAttachments(value: unknown): SupportAttachment[] {
  return Array.isArray(value) ? value.filter((item): item is SupportAttachment =>
    Boolean(item && typeof item === "object" && typeof item.storageKey === "string" && typeof item.name === "string")) : [];
}

/** Per-user inbox settings live in existing PlatformFeedback.metadata (no new table). */
function conversationPreference(metadata: unknown, userId: string): { title?: string; hiddenAt?: string } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const root = metadata as Record<string, unknown>;
  const all = root.supportChatPreferences;
  if (!all || typeof all !== "object" || Array.isArray(all)) return {};
  const item = (all as Record<string, unknown>)[userId];
  if (!item || typeof item !== "object" || Array.isArray(item)) return {};
  return item as { title?: string; hiddenAt?: string };
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
    // A "developer" membership at an arbitrary school must NEVER grant platform-wide access.
    // Configure this to the real Eleeveon account UUID on Render.
    const platformAccountId = String(process.env.ELEEVEON_PLATFORM_ACCOUNT_ID || "").trim();
    const platform = Boolean(platformAccountId && platformMembership && accountId === platformAccountId);
    return { accountId, userId, platform };
  }

  private async verifyEncryptedAuthor(access: { accountId: string; userId: string }, envelope: any) {
    const sender = await this.prisma.supportEncryptionDevice.findUnique({ where: { id: envelope.fromDeviceId } });
    if (!sender || sender.revokedAt || !sender.linkedAt || sender.userId !== access.userId || sender.accountId !== access.accountId) {
      throw new ForbiddenException("The signing device is not registered for this user.");
    }
    const { signature, ...unsigned } = envelope;
    try {
      const key = createPublicKey({ key: sender.signingPublicJwk as any, format: "jwk" });
      const rawSignature = Buffer.from(String(signature).replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (rawSignature.length !== 64 || !verifySignature("sha256", Buffer.from(JSON.stringify(unsigned)),
        { key, dsaEncoding: "ieee-p1363" }, rawSignature)) throw new Error("Invalid signature");
    } catch {
      throw new ForbiddenException("Encrypted message signature verification failed.");
    }
  }

  /** Only verified members register their own public device keys. */
  async registerKey(actor: AuthUser, input: Record<string, unknown>) {
    const access = await this.authorize(actor);
    const id = text(input.id, 64);
    const encryptionPublicJwk = input.encryptionPublicJwk;
    const signingPublicJwk = input.signingPublicJwk;
    if (!UUID_RE.test(id) || !validPublicKey(encryptionPublicJwk) || !validPublicKey(signingPublicJwk)) {
      throw new BadRequestException("Invalid E2EE device public keys.");
    }
    const keyFingerprint = fingerprint(encryptionPublicJwk, signingPublicJwk);
    const existing = await this.prisma.supportEncryptionDevice.findUnique({ where: { id } });
    if (existing) {
      if (existing.userId !== access.userId || existing.accountId !== access.accountId || existing.revokedAt || existing.fingerprint !== keyFingerprint) {
        throw new ForbiddenException("This device identifier is already assigned or its public keys changed.");
      }
      return { device: existing, linked: !!existing.linkedAt };
    }
    // Only the first-ever device can bootstrap itself. Further devices remain
    // pending until an already-linked device signs an explicit pairing approval.
    // Database uniqueness on userId+linkedAt is not suitable (many linked devices);
    // the first-device bootstrap must be serialized with a per-user advisory lock.
    const device = await this.prisma.$transaction(async tx => {
      // PostgreSQL transaction-scoped lock, keyed to authenticated user UUID.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${access.userId}))`;
      const linkedCount = await tx.supportEncryptionDevice.count({
        where: { accountId: access.accountId, userId: access.userId, linkedAt: { not: null }, revokedAt: null },
      });
      const everRegistered = await tx.supportEncryptionDevice.count({
        where: { accountId: access.accountId, userId: access.userId },
      });
      return tx.supportEncryptionDevice.create({ data: {
        id, accountId: access.accountId, userId: access.userId,
        encryptionPublicJwk: encryptionPublicJwk as any, signingPublicJwk: signingPublicJwk as any,
        fingerprint: keyFingerprint,
        // NEVER self-approve a replacement device after revocation/loss.
        linkedAt: linkedCount === 0 && everRegistered === 0 ? new Date() : null,
      } });
    });
    return { device, linked: !!device.linkedAt };
  }

  async keys(actor: AuthUser, conversationId?: string) {
    const access = await this.authorize(actor);
    let creatorId = access.userId;
    let customerAccountId = access.accountId;
    if (conversationId) {
      const { conversation } = await this.accessibleConversation(actor, conversationId);
      creatorId = conversation.submittedByUserId || "";
      customerAccountId = conversation.accountId || "";
    } else if (access.platform) {
      // The platform needs a conversation context before retrieving customer keys.
      creatorId = "";
      customerAccountId = "";
    }
    const platformAccountId = String(process.env.ELEEVEON_PLATFORM_ACCOUNT_ID || "").trim();
    const staffMemberships = platformAccountId ? await this.prisma.userMembership.findMany({
      where: { accountId: platformAccountId, active: true, status: "active", role: { in: ["developer", "platform_team"] } },
      select: { userId: true }, take: 100,
    }) : [];
    let recipientIds = creatorId ? [creatorId] : [];
    if(conversationId){
      const {conversation}=await this.accessibleConversation(actor,conversationId);
      const metadata=(conversation.metadata||{}) as Record<string,any>;
      if(metadata.origin==="platform_outreach"){
        const target=metadata.target||{};
        const membershipWhere={accountId:conversation.accountId||"",active:true,status:"active",
          ...(target.scope==="user"?{userId:String(target.userId)}:{}),
          ...(target.scope==="role"?{role:String(target.role)}:{}),
          ...(target.schoolId?{schoolId:String(target.schoolId)}:{}),
          ...(target.branchId?{branchId:String(target.branchId)}:{})};
        const people=await this.prisma.userMembership.findMany({where:membershipWhere,select:{userId:true},take:200});
        recipientIds=[...new Set<string>(people.map((x:{userId:string})=>x.userId))];
      }
    }
    const ids=[...new Set([...recipientIds,...staffMemberships.map(r=>r.userId)].filter(Boolean))];
    if(ids.length>90)throw new BadRequestException("This recipient group is too large for the current encryption envelope; use a smaller group.");
    const devices=ids.length?await this.prisma.supportEncryptionDevice.findMany({
      // Retain revoked public keys to validate OLD signed messages, but never
      // expose unlinked/pending keys as encryption recipients.
      where:{userId:{in:ids},OR:[{linkedAt:{not:null}},{revokedAt:{not:null}}]},
      orderBy:{registeredAt:"asc"},take:110,
    }):[];
    const audience=new Set(recipientIds);
    const platformUsers=new Set(staffMemberships.map(x=>x.userId));
    return {devices:devices.filter(d=>(audience.has(d.userId)&&d.accountId===customerAccountId)||
      (platformUsers.has(d.userId)&&d.accountId===platformAccountId)).map(({id,accountId,userId,encryptionPublicJwk,signingPublicJwk,fingerprint,revokedAt})=>({
       id,accountId,userId,encryptionPublicJwk,signingPublicJwk,fingerprint,revoked:!!revokedAt,
    }))};
  }

  /** Original customer chats are private to their creator. Platform-led outreach is
   * shared only with the explicitly targeted account/user/membership scope. */
  private async permittedTarget(accountId: string,userId: string,conversation: { accountId?: string|null; submittedByUserId?:string|null; metadata?:unknown }) {
    if(conversation.accountId!==accountId)return false;
    const meta=(conversation.metadata||{}) as Record<string,any>;
    if(meta.origin!=="platform_outreach") return meta.e2ee!==true || conversation.submittedByUserId===userId;
    const target=meta.target||{};
    if(target.scope==="user"&&target.userId!==userId)return false;
    if(target.scope==="account")return true;
    if(target.scope==="user")return true;
    if(target.scope==="role"){
      return Boolean(await this.prisma.userMembership.findFirst({where:{accountId,userId,active:true,status:"active",
        role:String(target.role||""),...(target.schoolId?{schoolId:String(target.schoolId)}:{}),
        ...(target.branchId?{branchId:String(target.branchId)}:{})},select:{id:true}}));
    }
    return false;
  }

  /** Platform staff can discover account/user/role targets without exposing credentials. */
  async directory(actor:AuthUser,accountId?:string){
    const a=await this.authorize(actor);if(!a.platform)throw new ForbiddenException("Only Eleeveon platform staff can browse support recipients.");
    const accounts=await this.prisma.account.findMany({where:{status:"active"},select:{id:true,name:true,email:true},orderBy:{name:"asc"},take:300});
    const selected=accounts.find(x=>x.id===accountId);
    if(!selected)return {accounts,users:[],memberships:[]};
    const [users,memberships]=await Promise.all([
      this.prisma.appUser.findMany({where:{accountId,active:true},select:{id:true,fullName:true,email:true},orderBy:{fullName:"asc"},take:250}),
      this.prisma.userMembership.findMany({where:{accountId,active:true,status:"active"},select:{userId:true,role:true,schoolId:true,branchId:true},take:500}),
    ]);
    return {accounts,users,memberships};
  }

  /** An invitation contains NO plaintext conversation message. Its content is
   * encrypted and sent later, after the recipient has enrolled a key. */
  async invite(actor:AuthUser,input:Record<string,unknown>){
    const a=await this.authorize(actor);if(!a.platform)throw new ForbiddenException("Platform access required.");
    const targetAccountId=text(input.accountId,120),scope=text(input.scope,20);
    if(!UUID_RE.test(targetAccountId)||!["account","user","role"].includes(scope))throw new BadRequestException("Select a valid recipient scope.");
    const account=await this.prisma.account.findFirst({where:{id:targetAccountId,status:"active"},select:{id:true,name:true}});
    if(!account)throw new NotFoundException("Target account not found.");
    const target:Record<string,string>={scope};
    if(scope==="user"){
      const userId=text(input.userId,120);
      const targetUser=await this.prisma.appUser.findFirst({where:{id:userId,accountId:targetAccountId,active:true},select:{id:true}});
      if(!targetUser)throw new BadRequestException("Choose an active user in that account.");
      target.userId=userId;
    }
    if(scope==="role"){
      const role=text(input.role,80),schoolId=text(input.schoolId,120),branchId=text(input.branchId,120);
      if(!role)throw new BadRequestException("Choose a recipient role.");
      const hasRecipients=await this.prisma.userMembership.count({where:{accountId:targetAccountId,role,active:true,status:"active",
        ...(schoolId?{schoolId}:{}),...(branchId?{branchId}:{})}});
      if(!hasRecipients)throw new BadRequestException("No active users match that role and branch.");
      Object.assign(target,{role,...(schoolId?{schoolId}:{}),...(branchId?{branchId}:{})});
    }
    const created=await this.prisma.platformFeedback.create({data:{accountId:targetAccountId,type:"support_request",status:"submitted",
      subject:"Eleeveon secure conversation",description:"",assignedToUserId:a.userId,
      schoolId:target.schoolId||null,branchId:target.branchId||null,
      metadata:{origin:"platform_outreach",e2ee:true,target,createdByPlatformUserId:a.userId}}});
    return {conversation:{...created,organizationName:account.name}};
  }

  async assertConversationAccess(actor: AuthUser, feedbackId: string) { await this.accessibleConversation(actor, feedbackId); }

  private async accessibleConversation(actor: AuthUser, feedbackId: string) {
    const access = await this.authorize(actor);
    const conversation = await this.prisma.platformFeedback.findFirst({
      where: { id: feedbackId, ...(access.platform ? {} : { accountId: access.accountId }) },
      include: { account: { select: { name: true } } },
    });
    if (!conversation) throw new NotFoundException("Support conversation not found.");
    if (!access.platform && !await this.permittedTarget(access.accountId,access.userId,conversation)) {
      throw new ForbiddenException("This conversation is outside your assigned support audience.");
    }
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
    const allowed=access.platform?rows:(await Promise.all(rows.map(async row=>await this.permittedTarget(access.accountId,access.userId,row)?row:null))).filter((r):r is (typeof rows)[number]=>r!==null);
    const shown = allowed.filter(row => !conversationPreference(row.metadata, access.userId).hiddenAt);
    const unread = await this.unread(actor);
    const unreadById = new Map(unread.conversations.map(x => [x.id, x.unreadCount]));
    return { unreadTotal: unread.total, conversations: shown.map(({ messages, account, ...row }) => ({
      ...row,
      displayTitle: conversationPreference(row.metadata, access.userId).title || null,
      unreadCount: unreadById.get(row.id) || 0,
      organizationName: account?.name || "School",
      lastMessage: messages[0] ? { body: messages[0].body, createdAt: messages[0].createdAt, authorType: messages[0].authorType } : null,
    })) };
  }

  async open(actor: AuthUser, feedbackId: string) {
    const { access, conversation } = await this.accessibleConversation(actor, feedbackId);
    const preference = conversationPreference(conversation.metadata, access.userId);
    if (preference.hiddenAt) throw new NotFoundException("Conversation removed from your inbox.");
    const displayTitle = preference.title || null;
    const messages = await this.prisma.platformFeedbackMessage.findMany({
      where: { feedbackId, ...(access.platform ? {} : { internal: false }) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 700,
    });
    const hiddenRows = await this.prisma.$queryRaw<Array<{messageId: string}>>`
      SELECT "messageId" FROM "SupportMessageHidden" WHERE "userId" = ${access.userId}
    `;
    const tombstones = await this.prisma.$queryRaw<Array<{messageId: string}>>`
      SELECT "messageId" FROM "SupportMessageTombstone" WHERE "feedbackId" = ${feedbackId}
    `;
    const hiddenIds = new Set(hiddenRows.map(x => x.messageId));
    const deletedIds = new Set(tombstones.map(x => x.messageId));
    const visibleMessages = messages.filter(m => !hiddenIds.has(m.id));
    const expanded = await Promise.all(visibleMessages.map(async (message) => ({
      ...(deletedIds.has(message.id)
        ? { ...message, body: "", attachments: [], deletedForEveryone: true }
        : message),
      ...message,
      attachments: deletedIds.has(message.id) ? [] : await Promise.all(asAttachments(message.attachments).map(async (item) => ({
        name: item.name, mimeType: item.mimeType, sizeBytes: item.sizeBytes,
        kind: item.kind, url: await this.storage.signedUrl(item),
      }))),
    })));
    return { conversation: { ...conversation, organizationName: conversation.account?.name || "School", displayTitle }, messages: expanded };
  }

  async create(actor: AuthUser, input: Record<string, unknown>) {
    const access = await this.authorize(actor);
    if (access.platform) throw new ForbiddenException("Start customer conversations from a school workspace.");
    const subject = text(input.subject, 180);
    const body = text(input.body, 250000);
    const type = text(input.type, 60) || "support_request";
    const encrypted = input.encrypted === true;
    const requestedId = text(input.conversationId, 64);
    if (encrypted) {
      if (!UUID_RE.test(requestedId)) throw new BadRequestException("An encrypted conversation ID is required.");
      const envelope = decodeEnvelope(body, requestedId, `${requestedId}-opening`);
      await this.verifyEncryptedAuthor(access, envelope);
    } else if (type === "support_request") {
      throw new BadRequestException("Support chats require end-to-end encryption. Please update the Eleeveon app.");
    }
    if ((!subject && !encrypted) || !body) throw new BadRequestException("Enter a subject and message to start a conversation.");
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
        ...(encrypted ? { id: requestedId } : {}),
        accountId: access.accountId,
        submittedByUserId: access.userId,
        submittedByMembershipId: text(input.membershipId, 120) || null,
        schoolId: requestedSchoolId || null,
        branchId: requestedBranchId || null,
        submittedByName: text(input.name, 180) || null,
        type, priority: "normal", status: "submitted", subject: encrypted ? "Encrypted support conversation" : subject, description: body,
        metadata: { origin: "eleeveon_center", accountName: account?.name || "School", e2ee: encrypted },
      },
    });
    return { conversation: { ...created, organizationName: account?.name || "School" } };
  }

  async beginDirectUpload(actor:AuthUser,feedbackId:string,input:Record<string,unknown>){
    const {access,conversation}=await this.accessibleConversation(actor,feedbackId);
    const messageId=text(input.messageId,64),sizeBytes=Number(input.sizeBytes);
    const max=Math.min(Math.max(Number(process.env.SUPPORT_MAX_DIRECT_UPLOAD_BYTES)||100*1024*1024,1024*1024),250*1024*1024);
    if(!UUID_RE.test(messageId)||!Number.isSafeInteger(sizeBytes)||sizeBytes<1||sizeBytes>max)
      throw new BadRequestException(`Encrypted attachment must be 1–${Math.ceil(max/1048576)} MB.`);
    const existing=await this.prisma.eleeveonSupportDirectUpload.findFirst({where:{feedbackId,userId:access.userId,messageId,expiresAt:{gt:new Date()}}});
    if(existing)throw new BadRequestException("This message already has a reserved upload.");
    const object=await this.storage.reserveDirectUpload(conversation.accountId||access.accountId,feedbackId);
    const reserved=await this.prisma.eleeveonSupportDirectUpload.create({data:{feedbackId,accountId:conversation.accountId||access.accountId,
      userId:access.userId,messageId,storageKey:object.storageKey,expectedBytes:sizeBytes,expiresAt:new Date(Date.now()+110*60000)}});
    return {uploadId:reserved.id,signedUrl:object.signedUrl,maxBytes:max};
  }

  async send(actor: AuthUser, feedbackId: string, bodyInput: string | undefined, file?: SupportFile, clientId?: string, encrypted = false, uploadId?:string) {
    const { access, conversation } = await this.accessibleConversation(actor, feedbackId);
    const body = text(bodyInput, 250000);
    if (!encrypted || !clientId || !UUID_RE.test(clientId)) {
      throw new BadRequestException("Support replies must be end-to-end encrypted. Update the Eleeveon app to send messages.");
    }
    if (encrypted) {
      if (!clientId || !UUID_RE.test(clientId)) throw new BadRequestException("Encrypted messages need a client ID.");
      const envelope = decodeEnvelope(body, feedbackId, clientId);
      await this.verifyEncryptedAuthor(access, envelope);
      if (file?.buffer?.length && (file.mimetype || "").toLowerCase() !== "application/octet-stream") {
        throw new BadRequestException("Encrypted attachments must be uploaded as ciphertext bytes.");
      }
    }
    if (!body && !file?.buffer?.length) throw new BadRequestException("Type a message or attach a file.");
    if (clientId && !/^[0-9a-f-]{36}$/i.test(clientId)) throw new BadRequestException("Invalid message identifier.");
    if (clientId) {
      const existing = await this.prisma.platformFeedbackMessage.findUnique({ where: { id: clientId } });
      if (existing) {
        if (existing.feedbackId !== feedbackId || existing.authorUserId !== access.userId) throw new ForbiddenException("Message identifier already exists.");
        return { message: { ...existing, attachments: await this.expose(existing.attachments) } };
      }
    }
    // Create a database message first, then attach verified encrypted bytes.
    // A failed small-file upload rolls back the message instead of leaving an
    // orphaned file in Supabase. Direct signed uploads are separately reserved.
    let reservation: {id:string;storageKey:string;expectedBytes:number}|null=null;
    if(uploadId){
      if(file?.buffer?.length)throw new BadRequestException("Choose either a direct upload or multipart upload.");
      reservation=await this.prisma.eleeveonSupportDirectUpload.findFirst({where:{id:uploadId,feedbackId,userId:access.userId,messageId:clientId,consumedAt:null,expiresAt:{gt:new Date()}},select:{id:true,storageKey:true,expectedBytes:true}});
      if(!reservation)throw new ForbiddenException("Upload reservation expired or belongs to another message.");
    }
    let created=await this.prisma.platformFeedbackMessage.create({data:{
      ...(clientId?{id:clientId}:{}),feedbackId,authorType:access.platform?"platform":"school",authorUserId:access.userId,
      body,internal:false,
    }});
    let attachment:SupportAttachment|null=null;
    try{
      if(reservation)attachment=await this.storage.confirmDirectUpload(reservation.storageKey,reservation.expectedBytes);
      else if(file?.buffer?.length)attachment=await this.storage.store(conversation.accountId||access.accountId,feedbackId,file,encrypted);
      if(attachment){created=await this.prisma.platformFeedbackMessage.update({where:{id:created.id},data:{attachments:[attachment]}});}
      if(reservation)await this.prisma.eleeveonSupportDirectUpload.update({where:{id:reservation.id},data:{consumedAt:new Date()}});
    }catch(cause){
      await this.prisma.platformFeedbackMessage.delete({where:{id:created.id}}).catch(()=>undefined);
      if(attachment&&!reservation)await this.storage.remove(attachment.storageKey).catch(()=>undefined);
      throw cause;
    }
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

  /** Personal conversation title, which does not change ciphertext or the recipient's copy. */
  async renameConversation(actor: AuthUser, feedbackId: string, titleInput: unknown) {
    const { access } = await this.accessibleConversation(actor, feedbackId);
    const title = text(titleInput, 100);
    if (!title) throw new BadRequestException("Enter a conversation name.");
    await this.prisma.$executeRaw`
      UPDATE "PlatformFeedback" SET metadata =
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('supportChatPreferences', COALESCE(metadata->'supportChatPreferences', '{}'::jsonb)),
          ARRAY['supportChatPreferences', ${access.userId}],
          COALESCE(metadata->'supportChatPreferences'->${access.userId}, '{}'::jsonb) || jsonb_build_object('title', ${title}),
          true
        )
      WHERE id = ${feedbackId}
    `;
    return { ok: true, displayTitle: title };
  }

  /** Hide this chat only for its current user, preserving everybody else's inbox. */
  async removeConversation(actor: AuthUser, feedbackId: string) {
    const { access } = await this.accessibleConversation(actor, feedbackId);
    await this.prisma.$executeRaw`
      UPDATE "PlatformFeedback" SET metadata =
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('supportChatPreferences', COALESCE(metadata->'supportChatPreferences', '{}'::jsonb)),
          ARRAY['supportChatPreferences', ${access.userId}],
          COALESCE(metadata->'supportChatPreferences'->${access.userId}, '{}'::jsonb) || jsonb_build_object('hiddenAt', CURRENT_TIMESTAMP::text),
          true
        )
      WHERE id = ${feedbackId}
    `;
    return { ok: true, feedbackId };
  }

  /** User-specific, persisted read state; never exposes decrypted message content. */
  async markRead(actor: AuthUser, feedbackId: string) {
    const { access } = await this.accessibleConversation(actor, feedbackId);
    const latest = await this.prisma.platformFeedbackMessage.findFirst({
      where: { feedbackId, internal: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    });
    const cutoff = latest?.createdAt || new Date();
    await this.prisma.$executeRaw`
      INSERT INTO "SupportMessageRead" ("feedbackId", "userId", "readAt")
      VALUES (${feedbackId}, ${access.userId}, ${cutoff})
      ON CONFLICT ("feedbackId", "userId")
      DO UPDATE SET "readAt" = GREATEST("SupportMessageRead"."readAt", EXCLUDED."readAt")
    `;
    return { ok: true, feedbackId, readAt: cutoff };
  }

  /** Counts are strictly authorized and ignore own/hidden/deleted messages. */
  async unread(actor: AuthUser) {
    const access = await this.authorize(actor);
    const rows = await this.prisma.platformFeedback.findMany({
      where: access.platform ? {} : { accountId: access.accountId },
      select: { id: true, accountId: true, submittedByUserId: true, metadata: true },
      orderBy: { updatedAt: "desc" }, take: 300,
    });
    const allowed = access.platform ? rows : (await Promise.all(rows.map(async row =>
      await this.permittedTarget(access.accountId, access.userId, row) ? row : null
    ))).filter((row): row is NonNullable<typeof row> => row !== null);
    const visible = allowed.filter(row => !conversationPreference(row.metadata, access.userId).hiddenAt);
    if (!visible.length) return { total: 0, conversations: [] as Array<{id:string;unreadCount:number}> };
    const ids = visible.map(x => x.id);
    const counts = await this.prisma.$queryRaw<Array<{ feedbackId: string; count: bigint }>>`
      SELECT m."feedbackId" AS "feedbackId", COUNT(*)::bigint AS count
      FROM "PlatformFeedbackMessage" m
      LEFT JOIN "SupportMessageRead" r ON r."feedbackId" = m."feedbackId" AND r."userId" = ${access.userId}
      LEFT JOIN "SupportMessageHidden" h ON h."messageId" = m.id AND h."userId" = ${access.userId}
      LEFT JOIN "SupportMessageTombstone" t ON t."messageId" = m.id
      WHERE m."feedbackId" IN (${Prisma.join(ids)})
        AND m.internal = false
        AND (m."authorUserId" IS NULL OR m."authorUserId" <> ${access.userId})
        AND (r."readAt" IS NULL OR m."createdAt" > r."readAt")
        AND h."messageId" IS NULL AND t."messageId" IS NULL
      GROUP BY m."feedbackId"
    `;
    const byId = new Map(counts.map(x => [x.feedbackId, Number(x.count)]));
    const conversations = visible.map(x => ({ id: x.id, unreadCount: byId.get(x.id) || 0 }));
    return { total: conversations.reduce((sum, x) => sum + x.unreadCount, 0), conversations };
  }

  /** Hide for one account user across all their devices; does not delete others' messages. */
  async deleteForMe(actor: AuthUser, feedbackId: string, messageId: string) {
    const { access } = await this.accessibleConversation(actor, feedbackId);
    const message = await this.prisma.platformFeedbackMessage.findFirst({ where: { id: messageId, feedbackId, internal: false }, select: { id: true } });
    if (!message) throw new NotFoundException("Message not found.");
    await this.prisma.$executeRaw`
      INSERT INTO "SupportMessageHidden" ("messageId", "userId") VALUES (${messageId}, ${access.userId})
      ON CONFLICT ("messageId", "userId") DO NOTHING
    `;
    return { ok: true, messageId, scope: "me" };
  }

  /** Sender-only global deletion: clear ciphertext, attachment references and create tombstone. */
  async deleteForEveryone(actor: AuthUser, feedbackId: string, messageId: string) {
    const { access } = await this.accessibleConversation(actor, feedbackId);
    const message = await this.prisma.platformFeedbackMessage.findFirst({
      where: { id: messageId, feedbackId, internal: false },
    });
    if (!message) throw new NotFoundException("Message not found.");
    if (message.authorUserId !== access.userId) throw new ForbiddenException("Only the sender may delete this message for everyone.");
    const attachments = asAttachments(message.attachments);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO "SupportMessageTombstone" ("messageId", "feedbackId", "deletedByUserId")
        VALUES (${messageId}, ${feedbackId}, ${access.userId})
        ON CONFLICT ("messageId") DO NOTHING
      `;
      await tx.platformFeedbackMessage.update({ where: { id: messageId }, data: { body: "", attachments: [] } });
    });
    // Storage deletion is best-effort; a scheduled orphan cleanup should retry failures.
    await Promise.allSettled(attachments.map(a => this.storage.remove(a.storageKey)));
    return { ok: true, messageId, scope: "everyone" };
  }
}
