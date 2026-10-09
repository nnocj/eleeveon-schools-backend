/**
 * src/media/media-storage.service.ts
 * --------------------------------------------------------------------------
 * Supabase-only media storage.
 *
 * New uploads:
 *   Supabase Storage -> <bucket>/<accountId>/<filename>
 *
 * Reads:
 *   Supabase Storage only
 *
 * The existing public API route remains unchanged:
 *   GET /media/files/:accountId/:filename
 *
 * This means existing mediaAssets.publicUrl / remoteUrl values such as:
 *
 *   https://eleeveon-schools-backend.onrender.com/media/files/...
 *
 * continue to work.
 *
 * Render is now only serving the API request.
 * Media binaries are stored exclusively in Supabase Storage.
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { ConfigService } from "@nestjs/config";

import {
  basename,
  extname,
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

  /**
   * Kept for compatibility with existing code.
   *
   * This is no longer a real filesystem path.
   * It is a logical Supabase storage location.
   */
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

const EXTENSION_MIME: Record<string, string> =
  Object.fromEntries(
    Object.entries(MIME_EXTENSION).map(
      ([mimeType, extension]) => [
        extension,
        mimeType,
      ],
    ),
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
        this.config.get<string>(
          "SUPABASE_URL",
        ) || "",
      ).trim();

    const supabaseSecretKey =
      String(
        this.config.get<string>(
          "SUPABASE_SECRET_KEY",
        ) || "",
      ).trim();

    this.bucket =
      String(
        this.config.get<string>(
          "SUPABASE_MEDIA_BUCKET",
        ) || "eleeveon-media",
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
    const configured =
      Number(
        this.config.get<string>(
          "MEDIA_MAX_FILE_SIZE_BYTES",
        ),
      );

    return (
      Number.isFinite(configured) &&
      configured > 0
        ? configured
        : 15 * 1024 * 1024
    );
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
          .map(
            (value) =>
              value
                .trim()
                .toLowerCase(),
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

  /**
   * Clean a path segment so account IDs cannot escape
   * their own Supabase Storage directory.
   */
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

  /**
   * Determine the extension to use for a newly uploaded file.
   *
   * Known MIME types receive their standard extension.
   * Unknown but valid original extensions are retained.
   */
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

  /**
   * Store a new media file.
   *
   * Supabase Storage is now the only backend storage provider.
   */
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
        `Unsupported media type: ${
          mimeType || "unknown"
        }.`,
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

    const {
      error,
    } =
      await this.supabase.storage
        .from(
          this.bucket,
        )
        .upload(
          storageKey,
          file.buffer,
          {
            contentType:
              mimeType ||
              "application/octet-stream",

            cacheControl:
              "31536000",

            upsert:
              false,
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

  /**
   * Open an existing media file.
   *
   * Supabase Storage is the ONLY source.
   *
   * There is intentionally no Render/local filesystem
   * fallback anymore.
   */
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
        .from(
          this.bucket,
        )
        .download(
          storageKey,
        );

    /**
     * Supabase genuinely does not contain this object.
     */
    if (
      supabaseError &&
      this.isStorageNotFoundError(
        supabaseError,
      )
    ) {
      throw new NotFoundException(
        "Media file not found.",
      );
    }

    /**
     * Supabase returned some other storage/network error.
     */
    if (supabaseError) {
      throw new ServiceUnavailableException(
        `Media storage is temporarily unavailable: ${supabaseError.message}`,
      );
    }

    /**
     * Defensive check in case Supabase returns no error
     * but also no file.
     */
    if (!supabaseFile) {
      throw new NotFoundException(
        "Media file not found.",
      );
    }

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

  /**
   * Supabase Storage SDK error objects can differ
   * slightly depending on the failure source.
   *
   * Treat recognized 404 / object-not-found errors as
   * ordinary missing-media responses.
   */
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

  /**
   * Fallback MIME detection for downloaded objects
   * whose response Blob does not contain a useful type.
   */
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
