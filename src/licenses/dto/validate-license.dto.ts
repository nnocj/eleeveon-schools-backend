import {
  IsOptional,
  IsString,
} from "class-validator";

export class ValidateLicenseDto {
  @IsString()
  licenseKey!: string;

  @IsString()
  deviceId!: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  machineFingerprint?: string;
}
