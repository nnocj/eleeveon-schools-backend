/**
 * src/media/dto/media-upload.dto.ts
 * --------------------------------------------------------------------------
 * Multipart metadata sent together with a media file.
 *
 * Final media identity model:
 * - all record IDs are strings;
 * - ownerId is the permanent owner record ID;
 * - ownerTempKey supports media created before the owner record is finalized;
 * - ownerLocalId and ownerCloudId are not part of the schema.
 *
 * Security:
 * - accountId is accepted only for compatibility and is never authoritative;
 * - the controller and service always use req.user.accountId;
 * - owner and field metadata are validated and normalized before storage.
 */

import {
  IsOptional,
  IsString,
} from "class-validator";

export class MediaUploadDto {
  /**
   * Compatibility-only account identifier.
   *
   * The authenticated JWT accountId must always override this value.
   */
  @IsOptional()
  @IsString()
  accountId?: string;

  /**
   * Permanent string ID of the local-first mediaAssets record.
   */
  @IsOptional()
  @IsString()
  assetId?: string;

  /**
   * Dexie table that owns the media asset.
   *
   * Examples:
   * - students
   * - teachers
   * - schools
   * - branches
   */
  @IsString()
  ownerTable!: string;

  /**
   * Field on the owner record represented by this asset.
   *
   * Examples:
   * - photo
   * - logo
   * - signature
   * - coverImage
   */
  @IsString()
  fieldKey!: string;

  /**
   * Permanent string ID of the owner record.
   *
   * At least one of ownerId or ownerTempKey must be supplied. That
   * cross-field rule should be enforced by the media service.
   */
  @IsOptional()
  @IsString()
  ownerId?: string;

  /**
   * Temporary identity used when media is created before the owner record has
   * received or finalized its permanent ID.
   */
  @IsOptional()
  @IsString()
  ownerTempKey?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

