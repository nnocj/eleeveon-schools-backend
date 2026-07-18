/**
 * src/media/media.service.ts
 * --------------------------------------------------------------------------
 * Authenticated media upload orchestration.
 *
 * This service stores the binary and returns a remote URL. The frontend then
 * writes the URL into its local mediaAssets record and normal synchronization
 * propagates that metadata to other devices.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import type {
  AuthUser,
} from "../common/auth-user";

import {
  MediaUploadDto,
} from "./dto/media-upload.dto";

import {
  MediaStorageService,
} from "./media-storage.service";

const ALLOWED_OWNER_TABLES =
  new Set([
    "schools",
    "branches",
    "schoolBranchSettings",
    "students",
    "teachers",
    "parents",
    "classes",
    "subjects",
    "organizations",
    "academicStructures",
    "assessmentStructures",
    "classSubjects",
    "announcements",
    "reportCards",
    "reportCardTemplates",
  ]);

const ALLOWED_FIELD_KEYS =
  new Set([
    "logo",
    "photo",
    "coverPhoto",
    "bannerImage",
    "signature",
    "dashboardHeroImage",
    "dashboardBannerImage",
    "studentPortalImage",
    "teacherPortalImage",
    "classroomPlaceholderImage",
    "subjectPlaceholderImage",
    "reportCardBackgroundImage",
    "reportCardWatermark",
    "reportCardSignatureImage",
    "schoolGalleryImages",
    "watermark",
    "background",
    "attachment",
    "receipt",
  ]);

@Injectable()
export class MediaService {
  constructor(
    private readonly storage:
      MediaStorageService,
  ) {}

  async upload(
    actor: AuthUser,
    dto: MediaUploadDto,
    file: any,
    requestBaseUrl: string,
  ) {
    const accountId =
      String(
        actor?.accountId || "",
      ).trim();

    if (!accountId) {
      throw new ForbiddenException(
        "The authenticated account is required.",
      );
    }

    if (
      dto.accountId &&
      String(
        dto.accountId,
      ).trim() !== accountId
    ) {
      throw new ForbiddenException(
        "The media upload account does not match the authenticated account.",
      );
    }

    const ownerTable =
      String(
        dto.ownerTable || "",
      ).trim();

    const fieldKey =
      String(
        dto.fieldKey || "",
      ).trim();

    if (
      !ALLOWED_OWNER_TABLES.has(
        ownerTable,
      )
    ) {
      throw new BadRequestException(
        `Media uploads are not allowed for owner table ${ownerTable || "unknown"}.`,
      );
    }

    if (
      !ALLOWED_FIELD_KEYS.has(
        fieldKey,
      )
    ) {
      throw new BadRequestException(
        `Media uploads are not allowed for field ${fieldKey || "unknown"}.`,
      );
    }

    if (
      !dto.ownerCloudId &&
      !dto.ownerLocalId &&
      !dto.ownerTempKey
    ) {
      throw new BadRequestException(
        "A media owner identity is required.",
      );
    }

    const stored =
      await this.storage.store(
        accountId,
        file,
      );

    const base =
      String(
        requestBaseUrl || "",
      ).replace(
        /\/+$/,
        "",
      );

    const encodedAccount =
      encodeURIComponent(
        accountId,
      );

    const encodedFilename =
      encodeURIComponent(
        stored.filename,
      );

    const publicUrl =
      `${base}/media/files/${encodedAccount}/${encodedFilename}`;

    return {
      ok: true,
      assetId:
        dto.assetId,
      accountId,
      ownerTable,
      fieldKey,
      ownerCloudId:
        dto.ownerCloudId ||
        null,
      ownerLocalId:
        dto.ownerLocalId ||
        null,
      ownerTempKey:
        dto.ownerTempKey ||
        null,
      deviceId:
        dto.deviceId ||
        null,
      publicUrl,
      remoteUrl:
        publicUrl,
      storageUrl:
        publicUrl,
      downloadUrl:
        publicUrl,
      storageKey:
        stored.storageKey,
      filename:
        stored.filename,
      mimeType:
        stored.mimeType,
      sizeBytes:
        stored.sizeBytes,
      uploadedAt:
        Date.now(),
    };
  }
}