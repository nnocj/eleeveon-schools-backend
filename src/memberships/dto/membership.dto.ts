import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { ALL_APP_ROLES } from "../../common/roles";

export class CreateMembershipDto {
  @IsString()
  userId!: string;

  @IsIn(ALL_APP_ROLES)
  role!: string;

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateMembershipDto {
  @IsOptional()
  @IsIn(ALL_APP_ROLES)
  role?: string;

  @IsOptional()
  @IsString()
  schoolId?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  studentId?: string | null;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}