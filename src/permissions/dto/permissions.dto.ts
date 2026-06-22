import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

const YES_NO = ["yes", "no"] as const;

export class CreatePermissionRuleDto {
  @IsString()
  moduleKey!: string;

  @IsString()
  moduleLabel!: string;

  @IsOptional() @IsIn(YES_NO) owner?: string;
  @IsOptional() @IsIn(YES_NO) admin?: string;
  @IsOptional() @IsIn(YES_NO) branch?: string;
  @IsOptional() @IsIn(YES_NO) teacher?: string;
  @IsOptional() @IsIn(YES_NO) student?: string;
  @IsOptional() @IsIn(YES_NO) parent?: string;
  @IsOptional() @IsIn(YES_NO) accountant?: string;

  @IsOptional()
  @IsBoolean()
  locked?: boolean;
}

export class UpdatePermissionRuleDto {
  @IsOptional() @IsString() moduleLabel?: string;
  @IsOptional() @IsIn(YES_NO) owner?: string;
  @IsOptional() @IsIn(YES_NO) admin?: string;
  @IsOptional() @IsIn(YES_NO) branch?: string;
  @IsOptional() @IsIn(YES_NO) teacher?: string;
  @IsOptional() @IsIn(YES_NO) student?: string;
  @IsOptional() @IsIn(YES_NO) parent?: string;
  @IsOptional() @IsIn(YES_NO) accountant?: string;
  @IsOptional() @IsBoolean() locked?: boolean;
}
