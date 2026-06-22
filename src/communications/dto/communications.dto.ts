import { IsArray, IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";

export class CreateAnnouncementDto {
  @Type(() => Number) @IsNumber() schoolId!: number;
  @Type(() => Number) @IsNumber() branchId!: number;
  @IsString() title!: string;
  @IsString() body!: string;
  @IsIn(["all", "staff", "teachers", "parents", "students", "class", "organization", "custom"])
  audience!: string;
  @IsArray() channels!: string[];
  @IsOptional() @Type(() => Number) @IsNumber() classId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() organizationId?: number;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() publishAt?: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsString() photo?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsOptional() metadata?: any;
}

export class CreateAnnouncementRecipientDto {
  @Type(() => Number) @IsNumber() schoolId!: number;
  @Type(() => Number) @IsNumber() branchId!: number;
  @Type(() => Number) @IsNumber() announcementId!: number;
  @IsString() recipientType!: string;
  @IsOptional() @Type(() => Number) @IsNumber() recipientLocalId?: number;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() recipientName?: string;
  @IsOptional() @IsString() recipientPhone?: string;
  @IsOptional() @IsString() recipientEmail?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
  @IsArray() channels!: string[];
}

export class CreateMessageThreadDto {
  @Type(() => Number) @IsNumber() schoolId!: number;
  @Type(() => Number) @IsNumber() branchId!: number;
  @IsOptional() @IsString() title?: string;
  @IsString() threadType!: string;
  @IsOptional() @Type(() => Number) @IsNumber() classId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() organizationId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() studentId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() teacherId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() parentId?: number;
}

export class CreateMessageDto {
  @Type(() => Number) @IsNumber() schoolId!: number;
  @Type(() => Number) @IsNumber() branchId!: number;
  @Type(() => Number) @IsNumber() threadId!: number;
  @IsString() body!: string;
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsOptional() @IsString() photo?: string;
}

export class CreateNotificationTemplateDto {
  @Type(() => Number) @IsNumber() schoolId!: number;
  @Type(() => Number) @IsNumber() branchId!: number;
  @IsString() name!: string;
  @IsString() purpose!: string;
  @IsString() channel!: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() body!: string;
  @IsOptional() variables?: string[];
}
