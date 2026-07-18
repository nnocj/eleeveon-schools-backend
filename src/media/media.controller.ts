/**
 * src/media/media.controller.ts
 * --------------------------------------------------------------------------
 * POST /media/upload
 * GET  /media/files/:accountId/:filename
 */

import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";

import {
  FileInterceptor,
} from "@nestjs/platform-express";

import {
  memoryStorage,
} from "multer";

import type {
  Response,
} from "express";

import {
  JwtAuthGuard,
} from "../auth/jwt-auth.guard";

import type {
  AuthUser,
} from "../common/auth-user";

import {
  MediaUploadDto,
} from "./dto/media-upload.dto";

import {
  MediaService,
} from "./media.service";

import {
  MediaStorageService,
} from "./media-storage.service";

type AuthenticatedRequest = {
  user: AuthUser;
  protocol?: string;
  headers?: {
    host?: string;
    "x-forwarded-proto"?: string;
    "x-forwarded-host"?: string;
  };
  get?: (name: string) => string | undefined;
};

@Controller("media")
export class MediaController {
  constructor(
    private readonly mediaService:
      MediaService,
    private readonly storage:
      MediaStorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post("upload")
  @UseInterceptors(
    FileInterceptor(
      "file",
      {
        storage:
          memoryStorage(),
        limits: {
          fileSize:
            8 * 1024 * 1024,
          files: 1,
        },
      },
    ),
  )
  upload(
    @Req()
    req: AuthenticatedRequest,
    @UploadedFile()
    file: any,
    @Body()
    dto: MediaUploadDto,
  ) {
    return this.mediaService.upload(
      req.user,
      dto,
      file,
      this.requestBaseUrl(
        req,
      ),
    );
  }

  /**
   * Browser-readable URL.
   *
   * The generated filename is an unguessable UUID. If you later require private
   * media, replace this with signed URLs from object storage.
   */
  @Get(
    "files/:accountId/:filename",
  )
  async file(
    @Param("accountId")
    accountId: string,
    @Param("filename")
    filename: string,
    @Res()
    response: Response,
  ) {
    const opened =
      await this.storage.open(
        accountId,
        filename,
      );

    response.setHeader(
      "Content-Type",
      opened.mimeType,
    );

    response.setHeader(
      "Content-Length",
      String(
        opened.sizeBytes,
      ),
    );

    response.setHeader(
      "Cache-Control",
      "public, max-age=31536000, immutable",
    );

    opened.stream.pipe(
      response,
    );
  }

  private requestBaseUrl(
    req: AuthenticatedRequest,
  ) {
    const forwardedProtocol =
      String(
        req.headers?.[
          "x-forwarded-proto"
        ] || "",
      )
        .split(",")[0]
        .trim();

    const forwardedHost =
      String(
        req.headers?.[
          "x-forwarded-host"
        ] || "",
      )
        .split(",")[0]
        .trim();

    const protocol =
      forwardedProtocol ||
      req.protocol ||
      "http";

    const host =
      forwardedHost ||
      req.get?.("host") ||
      req.headers?.host ||
      "localhost:4000";

    return `${protocol}://${host}`;
  }
}