/**
 * src/media/dto/media-upload.dto.ts
 * --------------------------------------------------------------------------
 * Multipart metadata sent together with a media file.
 *
 * Security:
 * - accountId is accepted only for compatibility and is never authoritative;
 * - the controller/service always uses req.user.accountId;
 * - owner and field metadata are validated and normalized before storage.
 */

import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class MediaUploadDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  /**
   * Local Dexie mediaAssets ID.
   * Multipart form values arrive as strings, so class-transformer converts it.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assetId?: number;

  @IsString()
  ownerTable!: string;

  @IsString()
  fieldKey!: string;

  @IsOptional()
  @IsString()
  ownerCloudId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ownerLocalId?: number;

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