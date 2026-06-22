import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";
import { Type } from "class-transformer";
import { ALL_APP_ROLES } from "../../common/roles";

export class CreateAccountDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(["active", "suspended", "closed"])
  status?: string;
}

export class CreateAccountUserDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(ALL_APP_ROLES)
  role!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  schoolId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacherLocalId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentLocalId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentLocalId?: number;
}

export class UpdateAccountUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(ALL_APP_ROLES)
  role?: string;
}

export class UpdateAccountUserStatusDto {
  @IsBoolean()
  active!: boolean;
}
