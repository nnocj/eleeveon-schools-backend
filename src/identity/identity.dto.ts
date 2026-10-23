import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";

export class IdentityPolicyQueryDto {
  @IsString() @IsNotEmpty() schoolId!: string;
  @IsString() @IsNotEmpty() branchId!: string;
}
export class IdentityPolicyDto extends IdentityPolicyQueryDto {
  @IsIn(["automatic", "manual", "disabled"]) studentMode!: "automatic"|"manual"|"disabled";
  @IsIn(["automatic", "manual", "disabled"]) teacherMode!: "automatic"|"manual"|"disabled";
  @IsOptional() @IsInt() @Min(1) @Max(120) expiryMonths?: number;
  @IsOptional() @IsBoolean() showClassPublicly?: boolean;
  @IsOptional() @IsBoolean() showNamePublicly?: boolean;
}
export class IdentityCardTargetDto extends IdentityPolicyQueryDto {
  @IsIn(["student", "teacher"]) subjectType!: "student"|"teacher";
  @IsString() @IsNotEmpty() subjectId!: string;
}
export class IdentityIssueDto extends IdentityCardTargetDto {
  @IsOptional() @IsBoolean() replace?: boolean;
}
