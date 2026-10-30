import { IsArray, IsIn, IsOptional, IsString } from "class-validator";

export class CreateAnnouncementDto {
  @IsString() schoolId!: string;
  @IsString() branchId!: string;
  @IsString() title!: string;
  @IsString() body!: string;
  @IsIn(["all", "staff", "teachers", "parents", "students", "class", "organization", "custom"])
  audience!: string;
  @IsArray() channels!: string[];
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() publishAt?: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsString() photo?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsOptional() metadata?: any;
}

export class CreateAnnouncementRecipientDto {
  @IsString() schoolId!: string;
  @IsString() branchId!: string;
  @IsString() announcementId!: string;
  @IsString() recipientType!: string;
  @IsOptional() @IsString() recipientLocalId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() recipientName?: string;
  @IsOptional() @IsString() recipientPhone?: string;
  @IsOptional() @IsString() recipientEmail?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
  @IsArray() channels!: string[];
}

export class CreateMessageThreadDto {
  @IsString() schoolId!: string;
  @IsString() branchId!: string;
  @IsOptional() @IsString() title?: string;
  @IsString() threadType!: string;
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() studentId?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() parentId?: string;
}

export class CreateMessageDto {
  @IsString() schoolId!: string;
  @IsString() branchId!: string;
  @IsString() threadId!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsOptional() @IsString() photo?: string;
}

export class CreateNotificationTemplateDto {
  @IsString() schoolId!: string;
  @IsString() branchId!: string;
  @IsString() name!: string;
  @IsString() purpose!: string;
  @IsString() channel!: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() body!: string;
  @IsOptional() variables?: string[];
}
