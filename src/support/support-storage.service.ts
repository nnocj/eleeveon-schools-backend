/** Private Supabase Storage for Eleeveon Center chat attachments. */
import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export type SupportAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  kind: "image" | "video" | "audio" | "document";
};

export type SupportFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

const ALLOWED = new Map<string, string>([
  ["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"],
  ["image/gif", ".gif"], ["image/avif", ".avif"],
  ["video/mp4", ".mp4"], ["video/webm", ".webm"], ["video/quicktime", ".mov"],
  ["audio/webm", ".webm"], ["audio/ogg", ".ogg"], ["audio/mpeg", ".mp3"],
  ["audio/mp4", ".m4a"], ["audio/x-m4a", ".m4a"], ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"], ["audio/aac", ".aac"],
  ["application/pdf", ".pdf"], ["text/plain", ".txt"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.ms-powerpoint", ".ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
  ["application/zip", ".zip"], ["application/x-zip-compressed", ".zip"],
]);

@Injectable()
export class SupportStorageService {
  private readonly storage: SupabaseClient;
  private readonly bucket: string;
  readonly maxBytes: number;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>("SUPABASE_URL")?.trim();
    const secret = config.get<string>("SUPABASE_SECRET_KEY")?.trim();
    this.bucket = config.get<string>("SUPABASE_SUPPORT_BUCKET")?.trim() || "eleeveon-support";
    const configured = Number(config.get<string>("SUPPORT_MAX_FILE_SIZE_BYTES") || 15 * 1024 * 1024);
    this.maxBytes = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 50 * 1024 * 1024) : 15 * 1024 * 1024;
    if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for support attachments.");
    this.storage = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async store(accountId: string, feedbackId: string, file: SupportFile): Promise<SupportAttachment> {
    if (!file?.buffer?.length || !Buffer.isBuffer(file.buffer)) throw new BadRequestException("Select a non-empty attachment.");
    const rawType = String(file.mimetype || "").toLowerCase().split(";")[0].trim();
    const mimeType = rawType === "video/mp4" && file.originalname?.toLowerCase().endsWith(".m4a") ? "audio/mp4" : rawType;
    const extension = ALLOWED.get(mimeType);
    if (!extension) throw new BadRequestException("This file type is not supported. Choose an image, audio, video, document or ZIP file.");
    if (file.buffer.length > this.maxBytes) throw new BadRequestException(`Attachment exceeds the ${Math.ceil(this.maxBytes / 1024 / 1024)} MB limit.`);
    const name = String(file.originalname || "attachment").replace(/[\\/\r\n\x00-\x1f]/g, "_").slice(0, 160);
    const cleanAccountId = accountId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanFeedbackId = feedbackId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const storageKey = `${cleanAccountId}/${cleanFeedbackId}/${randomUUID()}${extension}`;
    const { error } = await this.storage.storage.from(this.bucket).upload(storageKey, file.buffer, {
      contentType: mimeType, cacheControl: "3600", upsert: false,
    });
    if (error) throw new ServiceUnavailableException(`Private support attachment upload failed: ${error.message}`);
    const kind: SupportAttachment["kind"] = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : mimeType.startsWith("video/") ? "video" : "document";
    return { name, mimeType, sizeBytes: file.buffer.length, storageKey, kind };
  }

  async signedUrl(attachment: SupportAttachment): Promise<string | null> {
    const { data, error } = await this.storage.storage.from(this.bucket).createSignedUrl(
      attachment.storageKey, 600,
      attachment.kind === "document" ? { download: attachment.name } : undefined,
    );
    if (error) return null;
    return data?.signedUrl || null;
  }
}
