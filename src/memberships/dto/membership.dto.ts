import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";
import { ALL_APP_ROLES } from "../../common/roles";

export class CreateMembershipDto {
  @IsString()
  userId!: string;

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

export class UpdateMembershipDto {
  @IsOptional()
  @IsIn(ALL_APP_ROLES)
  role?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  schoolId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacherLocalId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentLocalId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentLocalId?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
