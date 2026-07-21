/**
 * src/media/media.service.ts
 * --------------------------------------------------------------------------
 * Authenticated media upload orchestration.
 *
 * This service stores the binary and returns a remote URL. The frontend then
 * writes that URL into its local mediaAssets record, and normal synchronization
 * propagates the metadata to other devices.
 *
 * Final media identity model:
 * - assetId is an optional string ID;
 * - ownerId is the permanent string ID of the owner record;
 * - ownerTempKey supports uploads created before an owner is finalized;
 * - ownerCloudId and ownerLocalId are no longer supported.
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

type UploadedMediaFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

const ALLOWED_OWNER_TABLES =
  new Set<string>([
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
  new Set<string>([
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
    file: UploadedMediaFile,
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

    const suppliedAccountId =
      String(
        dto.accountId || "",
      ).trim();

    if (
      suppliedAccountId &&
      suppliedAccountId !== accountId
    ) {
      throw new ForbiddenException(
        "The media upload account does not match the authenticated account.",
      );
    }

    const assetId =
      this.optionalString(
        dto.assetId,
      );

    const ownerTable =
      String(
        dto.ownerTable || "",
      ).trim();

    const fieldKey =
      String(
        dto.fieldKey || "",
      ).trim();

    const ownerId =
      this.optionalString(
        dto.ownerId,
      );

    const ownerTempKey =
      this.optionalString(
        dto.ownerTempKey,
      );

    const deviceId =
      this.optionalString(
        dto.deviceId,
      );

    const schoolId =
      this.optionalString(
        dto.schoolId,
      );

    const branchId =
      this.optionalString(
        dto.branchId,
      );

    if (
      !ALLOWED_OWNER_TABLES.has(
        ownerTable,
      )
    ) {
      throw new BadRequestException(
        `Media uploads are not allowed for owner table ${
          ownerTable || "unknown"
        }.`,
      );
    }

    if (
      !ALLOWED_FIELD_KEYS.has(
        fieldKey,
      )
    ) {
      throw new BadRequestException(
        `Media uploads are not allowed for field ${
          fieldKey || "unknown"
        }.`,
      );
    }

    if (
      !ownerId &&
      !ownerTempKey
    ) {
      throw new BadRequestException(
        "A media owner identity is required. Provide ownerId or ownerTempKey.",
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
      )
        .trim()
        .replace(
          /\/+$/,
          "",
        );

    if (!base) {
      throw new BadRequestException(
        "The media request base URL is required.",
      );
    }

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
        assetId || null,

      accountId,
      ownerTable,
      fieldKey,

      ownerId:
        ownerId || null,

      ownerTempKey:
        ownerTempKey || null,

      deviceId:
        deviceId || null,

      schoolId:
        schoolId || null,

      branchId:
        branchId || null,

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

  private optionalString(
    value:
      | string
      | null
      | undefined,
  ) {
    const normalized =
      String(
        value || "",
      ).trim();

    return normalized || null;
  }
}
