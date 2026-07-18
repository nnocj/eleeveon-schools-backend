/**
 * src/media/media-storage.service.ts
 * --------------------------------------------------------------------------
 * Local filesystem media storage.
 *
 * Files are stored outside src/ so recompilation does not remove uploads:
 *
 *   <MEDIA_UPLOAD_DIR or process.cwd()/uploads/media>/<accountId>/<filename>
 *
 * The returned URL is served through MediaController GET /media/files/:account/:file.
 *
 * For production at scale, replace this service with S3, Cloudflare R2,
 * Supabase Storage, Google Cloud Storage, or another object-storage provider.
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
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

import { randomUUID } from "crypto";

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
};

@Injectable()
export class MediaStorageService {
  constructor(
    private readonly config: ConfigService,
  ) {}

  get maxFileSizeBytes() {
    const configured = Number(
      this.config.get<string>(
        "MEDIA_MAX_FILE_SIZE_BYTES",
      ),
    );

    return Number.isFinite(configured) &&
      configured > 0
      ? configured
      : 8 * 1024 * 1024;
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
    const known =
      MIME_EXTENSION[
        mimeType.toLowerCase()
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
      ).toLowerCase();

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

    const directory =
      join(
        this.rootDirectory(),
        accountSegment,
      );

    await fs.mkdir(
      directory,
      {
        recursive: true,
      },
    );

    const absolutePath =
      join(
        directory,
        filename,
      );

    await fs.writeFile(
      absolutePath,
      file.buffer,
      {
        flag: "wx",
      },
    );

    return {
      storageKey:
        `${accountSegment}/${filename}`,
      filename,
      absolutePath,
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

    const absolutePath =
      join(
        this.rootDirectory(),
        accountSegment,
        safeFilename,
      );

    if (
      !existsSync(
        absolutePath,
      )
    ) {
      throw new NotFoundException(
        "Media file not found.",
      );
    }

    const stat =
      await fs.stat(
        absolutePath,
      );

    if (!stat.isFile()) {
      throw new NotFoundException(
        "Media file not found.",
      );
    }

    return {
      absolutePath,
      stream:
        createReadStream(
          absolutePath,
        ),
      sizeBytes:
        stat.size,
      mimeType:
        this.mimeFromFilename(
          safeFilename,
        ),
    };
  }

  private mimeFromFilename(
    filename: string,
  ) {
    const extension =
      extname(
        filename,
      ).toLowerCase();

    const match =
      Object.entries(
        MIME_EXTENSION,
      ).find(
        (
          [, value],
        ) =>
          value === extension,
      );

    return (
      match?.[0] ||
      "application/octet-stream"
    );
  }
}