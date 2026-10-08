/**
 * src/media/media-storage.service.ts
 * --------------------------------------------------------------------------
 * Supabase-first media storage with temporary legacy filesystem fallback.
 *
 * New uploads:
 *   Supabase Storage -> <bucket>/<accountId>/<filename>
 *
 * Reads:
 *   1. Supabase Storage
 *   2. Legacy Render/local filesystem fallback
 *
 * This preserves the existing public API route:
 *   GET /media/files/:accountId/:filename
 *
 * so existing mediaAssets.publicUrl / remoteUrl values do not need to change
 * immediately during the migration.
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  createReadStream,
  existsSync,
  promises as fs,
} from "fs";

import {
  basename,
  extname,
  join,
  resolve,
} from "path";

import { Readable } from "stream";
import { randomUUID } from "crypto";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export type StoredMediaFile = {
  storageKey: string;
  filename: string;
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
};

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

const EXTENSION_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXTENSION).map(([mimeType, extension]) => [
    extension,
    mimeType,
  ]),
);

@Injectable()
export class MediaStorageService {
  private readonly supabase: SupabaseClient;
  private readonly bucket: string;

  constructor(
    private readonly config: ConfigService,
  ) {
    const supabaseUrl =
      String(
        this.config.get<string>("SUPABASE_URL") || "",
      ).trim();

    const supabaseSecretKey =
      String(
        this.config.get<string>("SUPABASE_SECRET_KEY") || "",
      ).trim();

    this.bucket =
      String(
        this.config.get<string>("SUPABASE_MEDIA_BUCKET") ||
          "eleeveon-media",
      ).trim();

    if (!supabaseUrl) {
      throw new Error(
        "SUPABASE_URL is required for media storage.",
      );
    }

    if (!supabaseSecretKey) {
      throw new Error(
        "SUPABASE_SECRET_KEY is required for media storage.",
      );
    }

    if (!this.bucket) {
      throw new Error(
        "SUPABASE_MEDIA_BUCKET is required for media storage.",
      );
    }

    this.supabase = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  get maxFileSizeBytes() {
    const configured = Number(
      this.config.get<string>(
        "MEDIA_MAX_FILE_SIZE_BYTES",
      ),
    );

    return Number.isFinite(configured) &&
      configured > 0
      ? configured
      : 15 * 1024 * 1024;
  }

  get allowedMimeTypes() {
    const configured =
      this.config.get<string>(
        "MEDIA_ALLOWED_MIME_TYPES",
      );

    if (configured) {
      return new Set(
        configured
          .split(",")
          .map((value) =>
            value.trim().toLowerCase(),
          )
          .filter(Boolean),
      );
    }

    return new Set(
      Object.keys(
        MIME_EXTENSION,
      ),
    );
  }

  private rootDirectory() {
    const configured =
      this.config.get<string>(
        "MEDIA_UPLOAD_DIR",
      );

    return resolve(
      configured ||
        join(
          process.cwd(),
          "uploads",
          "media",
        ),
    );
  }

  private cleanSegment(
    value: string,
    label: string,
  ) {
    const clean =
      String(value || "")
        .trim()
        .replace(
          /[^a-zA-Z0-9_-]/g,
          "_",
        );

    if (!clean) {
      throw new BadRequestException(
        `${label} is required.`,
      );
    }

    return clean;
  }

  private extensionFor(
    originalName: string,
    mimeType: string,
  ) {
    const normalizedMimeType =
      String(mimeType || "")
        .trim()
        .toLowerCase();

    const known =
      MIME_EXTENSION[
        normalizedMimeType
      ];

    if (known) {
      return known;
    }

    const original =
      extname(
        originalName || "",
      ).toLowerCase();

    if (
      original &&
      /^[.][a-z0-9]{1,8}$/.test(
        original,
      )
    ) {
      return original;
    }

    return ".bin";
  }

  async store(
    accountId: string,
    file: {
      originalname?: string;
      mimetype?: string;
      size?: number;
      buffer?: Buffer;
    },
  ): Promise<StoredMediaFile> {
    if (
      !file ||
      !Buffer.isBuffer(
        file.buffer,
      )
    ) {
      throw new BadRequestException(
        "A media file is required.",
      );
    }

    const mimeType =
      String(
        file.mimetype || "",
      )
        .trim()
        .toLowerCase();

    if (
      !this.allowedMimeTypes.has(
        mimeType,
      )
    ) {
      throw new BadRequestException(
        `Unsupported media type: ${mimeType || "unknown"}.`,
      );
    }

    const sizeBytes =
      Number(
        file.size ||
          file.buffer.length,
      );

    if (
      !Number.isFinite(
        sizeBytes,
      ) ||
      sizeBytes <= 0
    ) {
      throw new BadRequestException(
        "The uploaded media file is empty.",
      );
    }

    if (
      sizeBytes >
      this.maxFileSizeBytes
    ) {
      throw new BadRequestException(
        `The media file exceeds the ${this.maxFileSizeBytes} byte limit.`,
      );
    }

    const accountSegment =
      this.cleanSegment(
        accountId,
        "accountId",
      );

    const extension =
      this.extensionFor(
        file.originalname || "",
        mimeType,
      );

    const filename =
      `${Date.now()}-${randomUUID()}${extension}`;

    const storageKey =
      `${accountSegment}/${filename}`;

    const { error } =
      await this.supabase.storage
        .from(this.bucket)
        .upload(
          storageKey,
          file.buffer,
          {
            contentType:
              mimeType ||
              "application/octet-stream",
            cacheControl: "31536000",
            upsert: false,
          },
        );

    if (error) {
      throw new ServiceUnavailableException(
        `Media upload to Supabase failed: ${error.message}`,
      );
    }

    return {
      storageKey,
      filename,
      absolutePath:
        `supabase://${this.bucket}/${storageKey}`,
      mimeType,
      sizeBytes,
    };
  }

  async open(
    accountId: string,
    filename: string,
  ) {
    const accountSegment =
      this.cleanSegment(
        accountId,
        "accountId",
      );

    const safeFilename =
      basename(
        filename,
      );

    if (
      safeFilename !== filename ||
      !safeFilename
    ) {
      throw new NotFoundException(
        "Media file not found.",
      );
    }

    const storageKey =
      `${accountSegment}/${safeFilename}`;

    const {
      data: supabaseFile,
      error: supabaseError,
    } =
      await this.supabase.storage
        .from(this.bucket)
        .download(
          storageKey,
        );

    if (
      !supabaseError &&
      supabaseFile
    ) {
      const arrayBuffer =
        await supabaseFile.arrayBuffer();

      const buffer =
        Buffer.from(
          arrayBuffer,
        );

      return {
        absolutePath:
          `supabase://${this.bucket}/${storageKey}`,
        stream:
          Readable.from(
            buffer,
          ),
        sizeBytes:
          buffer.length,
        mimeType:
          supabaseFile.type ||
          this.mimeFromFilename(
            safeFilename,
          ),
      };
    }

    const legacyAbsolutePath =
      join(
        this.rootDirectory(),
        accountSegment,
        safeFilename,
      );

    if (
      existsSync(
        legacyAbsolutePath,
      )
    ) {
      const stat =
        await fs.stat(
          legacyAbsolutePath,
        );

      if (
        stat.isFile()
      ) {
        return {
          absolutePath:
            legacyAbsolutePath,
          stream:
            createReadStream(
              legacyAbsolutePath,
            ),
          sizeBytes:
            stat.size,
          mimeType:
            this.mimeFromFilename(
              safeFilename,
            ),
        };
      }
    }

    if (
      supabaseError &&
      !this.isStorageNotFoundError(
        supabaseError,
      )
    ) {
      throw new ServiceUnavailableException(
        `Media storage is temporarily unavailable: ${supabaseError.message}`,
      );
    }

    throw new NotFoundException(
      "Media file not found.",
    );
  }

  private isStorageNotFoundError(
    error: any,
  ) {
    const status =
      Number(
        error?.statusCode ??
        error?.status ??
        0,
      );

    if (
      status === 404
    ) {
      return true;
    }

    const message =
      String(
        error?.message || "",
      ).toLowerCase();

    return (
      message.includes(
        "not found",
      ) ||
      message.includes(
        "object not found",
      )
    );
  }

  private mimeFromFilename(
    filename: string,
  ) {
    const extension =
      extname(
        filename,
      ).toLowerCase();

    return (
      EXTENSION_MIME[
        extension
      ] ||
      "application/octet-stream"
    );
  }
}