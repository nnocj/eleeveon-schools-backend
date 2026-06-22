import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export type DeveloperSqlRisk =
  | "safe"
  | "write"
  | "destructive"
  | "schema"
  | "unknown";

export class ExecuteDeveloperSqlDto {
  @IsString()
  @MaxLength(20000)
  sql!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  rawSql?: string;

  @IsOptional()
  @IsBoolean()
  readOnly?: boolean = true;

  @IsOptional()
  @IsIn(["safe", "write", "destructive", "schema", "unknown"])
  risk?: DeveloperSqlRisk = "unknown";

  @IsOptional()
  @IsString()
  confirmText?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class SaveDeveloperSqlHistoryDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(20000)
  sql!: string;

  @IsIn(["safe", "write", "destructive", "schema", "unknown"])
  risk!: DeveloperSqlRisk;

  @IsIn(["read_only", "write_enabled"])
  mode!: "read_only" | "write_enabled";

  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  rowCount?: number;

  @IsOptional()
  executionMs?: number;

  @IsOptional()
  @IsString()
  error?: string | null;

  @IsOptional()
  @IsString()
  auditId?: string | null;

  @IsOptional()
  createdAt?: number;
}
