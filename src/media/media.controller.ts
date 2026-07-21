/**
 * src/media/media.controller.ts
 * --------------------------------------------------------------------------
 * POST /media/upload
 * GET  /media/files/:accountId/:filename
 *
 * Notes:
 * - uploads require an authenticated account;
 * - req.user.accountId remains authoritative;
 * - uploaded files are held in memory before MediaStorageService persists them;
 * - generated media filenames are immutable and browser-cacheable;
 * - the configured upload limit is shared with MEDIA_MAX_FILE_SIZE_BYTES;
 * - the uploaded-file type is derived from MediaService.upload(), avoiding
 *   reliance on the global Express.Multer namespace during production builds.
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";

import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import type { Request, Response } from "express";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";

import type { AuthUser } from "../common/auth-user";

import { MediaUploadDto } from "./dto/media-upload.dto";
import { MediaService } from "./media.service";
import { MediaStorageService } from "./media-storage.service";

type AuthenticatedRequest = Request & {
  user: AuthUser;
};

/**
 * Keep the controller aligned with MediaService without importing or relying
 * on the global Express.Multer namespace.
 *
 * MediaService.upload arguments:
 * 0 → authenticated user
 * 1 → upload DTO
 * 2 → uploaded file
 * 3 → request base URL
 */
type UploadedMediaFile = Parameters<MediaService["upload"]>[2];

const DEFAULT_MEDIA_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function configuredUploadLimit(): number {
  const configured = Number(
    process.env.MEDIA_MAX_FILE_SIZE_BYTES,
  );

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MEDIA_MAX_FILE_SIZE_BYTES;
}

@Controller("media")
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly storage: MediaStorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: {
        fileSize: configuredUploadLimit(),
        files: 1,
      },
    }),
  )
  async upload(
    @Req()
    req: AuthenticatedRequest,

    @UploadedFile()
    file: UploadedMediaFile,

    @Body()
    dto: MediaUploadDto,
  ) {
    return this.mediaService.upload(
      req.user,
      dto,
      file,
      this.requestBaseUrl(req),
    );
  }

  /**
   * Browser-readable immutable media URL.
   *
   * The filename is generated using a UUID and cannot be chosen by the client.
   * This endpoint is suitable for public or browser-readable media such as:
   * - school logos;
   * - branch logos;
   * - profile photographs;
   * - report branding images.
   *
   * Private files should later be moved behind authenticated access or signed
   * object-storage URLs.
   */
  @Get("files/:accountId/:filename")
  async file(
    @Param("accountId")
    accountId: string,

    @Param("filename")
    filename: string,

    @Res()
    response: Response,
  ): Promise<void> {
    const opened = await this.storage.open(
      accountId,
      filename,
    );

    const safeDownloadName = filename.replace(
      /["\\\r\n]/g,
      "_",
    );

    response.setHeader(
      "Content-Type",
      opened.mimeType,
    );

    response.setHeader(
      "Content-Length",
      String(opened.sizeBytes),
    );

    response.setHeader(
      "X-Content-Type-Options",
      "nosniff",
    );

    response.setHeader(
      "Content-Disposition",
      `inline; filename="${safeDownloadName}"`,
    );

    response.setHeader(
      "Cache-Control",
      "public, max-age=31536000, immutable",
    );

    opened.stream.once("error", () => {
      if (!response.headersSent) {
        response.status(500).end();
        return;
      }

      response.destroy();
    });

    opened.stream.pipe(response);
  }

  private requestBaseUrl(
    req: AuthenticatedRequest,
  ): string {
    const forwardedProtocol = this.firstForwardedValue(
      req.headers["x-forwarded-proto"],
    );

    const forwardedHost = this.firstForwardedValue(
      req.headers["x-forwarded-host"],
    );

    const protocol =
      forwardedProtocol ||
      req.protocol ||
      "http";

    const host =
      forwardedHost ||
      req.get("host") ||
      req.headers.host ||
      "localhost:4000";

    return `${protocol}://${host}`;
  }

  private firstForwardedValue(
    value: string | string[] | undefined,
  ): string {
    const normalized = Array.isArray(value)
      ? value[0]
      : value;

    return String(normalized || "")
      .split(",")[0]
      .trim();
  }
}
