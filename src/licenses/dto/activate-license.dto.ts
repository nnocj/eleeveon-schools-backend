import {
  IsOptional,
  IsString,
} from "class-validator";

export class ActivateLicenseDto {
  @IsString()
  licenseKey!: string;

  @IsString()
  deviceId!: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  machineFingerprint?: string;
}
