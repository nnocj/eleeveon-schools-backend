import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  DeveloperSqlRisk,
  ExecuteDeveloperSqlDto,
  SaveDeveloperSqlHistoryDto,
} from "./dto/developer-sql.dto";

type SqlHistoryItem = {
  id: string;
  sql: string;
  risk: DeveloperSqlRisk;
  mode: "read_only" | "write_enabled";
  ok: boolean;
  rowCount: number;
  executionMs: number;
  error?: string | null;
  auditId?: string | null;
  createdAt: number;
};

@Injectable()
export class DeveloperSqlService {
  private readonly history: SqlHistoryItem[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async status() {
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1 as ok");

      return {
        ok: true,
        service: "Developer SQL Service",
        provider: "PostgreSQL via Prisma",
        database: "DATABASE_URL from backend .env",
        readOnlyDefault: true,
        writesEnabled: process.env.DEVELOPER_SQL_ALLOW_WRITES === "true",
        serverTime: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        ok: false,
        service: "Developer SQL Service",
        provider: "PostgreSQL via Prisma",
        database: "DATABASE_URL from backend .env",
        error: error?.message || "Database connection failed.",
        serverTime: new Date().toISOString(),
      };
    }
  }

  async historyList() {
    return {
      ok: true,
      history: this.history.slice(0, 100),
    };
  }

  async saveHistory(dto: SaveDeveloperSqlHistoryDto) {
    const item: SqlHistoryItem = {
      id: dto.id || `query-${Date.now()}`,
      sql: dto.sql,
      risk: dto.risk,
      mode: dto.mode,
      ok: Boolean(dto.ok),
      rowCount: Number(dto.rowCount || 0),
      executionMs: Number(dto.executionMs || 0),
      error: dto.error || null,
      auditId: dto.auditId || null,
      createdAt: Number(dto.createdAt || Date.now()),
    };

    this.history.unshift(item);
    if (this.history.length > 100) this.history.length = 100;

    return {
      ok: true,
      item,
    };
  }

  async execute(dto: ExecuteDeveloperSqlDto, user?: any) {
    const started = Date.now();
    const sql = this.cleanSql(dto.sql || dto.rawSql || "");

    if (!sql) {
      throw new BadRequestException("SQL query is required.");
    }

    this.assertSingleStatement(sql);

    const detectedRisk = this.detectRisk(sql);
    const readOnly = dto.readOnly !== false;

    if (readOnly && detectedRisk !== "safe") {
      throw new ForbiddenException(
        "Read-only mode is enabled. Only SELECT, WITH, SHOW, EXPLAIN and DESCRIBE queries are allowed.",
      );
    }

    if (detectedRisk !== "safe") {
      this.assertWriteAccess(dto, detectedRisk);
    }

    try {
      if (detectedRisk === "safe") {
        const rows = await this.prisma.$queryRawUnsafe<any[]>(sql);
        const safeRows = this.serializeRows(Array.isArray(rows) ? rows : [rows].filter(Boolean));
        const columns = this.getColumns(safeRows);
        const auditId = this.makeAuditId();

        this.pushHistory({
          id: `query-${Date.now()}`,
          sql,
          risk: detectedRisk,
          mode: "read_only",
          ok: true,
          rowCount: safeRows.length,
          executionMs: Date.now() - started,
          auditId,
          error: null,
          createdAt: Date.now(),
        });

        return {
          ok: true,
          columns,
          rows: safeRows,
          rowCount: safeRows.length,
          executionMs: Date.now() - started,
          auditId,
        };
      }

      const affected = await this.prisma.$executeRawUnsafe(sql);
      const auditId = this.makeAuditId();

      this.pushHistory({
        id: `query-${Date.now()}`,
        sql,
        risk: detectedRisk,
        mode: "write_enabled",
        ok: true,
        rowCount: Number(affected || 0),
        executionMs: Date.now() - started,
        auditId,
        error: null,
        createdAt: Date.now(),
      });

      return {
        ok: true,
        columns: ["affectedRows"],
        rows: [{ affectedRows: Number(affected || 0) }],
        rowCount: Number(affected || 0),
        executionMs: Date.now() - started,
        auditId,
      };
    } catch (error: any) {
      const auditId = this.makeAuditId();

      this.pushHistory({
        id: `query-${Date.now()}`,
        sql,
        risk: detectedRisk,
        mode: readOnly ? "read_only" : "write_enabled",
        ok: false,
        rowCount: 0,
        executionMs: Date.now() - started,
        auditId,
        error: error?.message || "SQL execution failed.",
        createdAt: Date.now(),
      });

      throw new BadRequestException({
        ok: false,
        message: error?.message || "SQL execution failed.",
        auditId,
        executionMs: Date.now() - started,
      });
    }
  }

  private cleanSql(sql: string) {
    return String(sql || "")
      .replace(/^\uFEFF/, "")
      .trim();
  }

  private assertSingleStatement(sql: string) {
    const withoutComments = sql
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();

    const semicolonCount = (withoutComments.match(/;/g) || []).length;

    if (semicolonCount > 1) {
      throw new BadRequestException("Only one SQL statement is allowed at a time.");
    }

    const withoutTrailingSemicolon = withoutComments.replace(/;\s*$/, "");

    if (withoutTrailingSemicolon.includes(";")) {
      throw new BadRequestException("Multiple SQL statements are not allowed.");
    }
  }

  private detectRisk(sql: string): DeveloperSqlRisk {
    const clean = sql
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim()
      .toUpperCase();

    if (!clean) return "unknown";
    if (/^(SELECT|WITH|SHOW|EXPLAIN|DESCRIBE)\b/.test(clean)) return "safe";
    if (/\b(DROP|TRUNCATE|ALTER|CREATE|REINDEX|VACUUM)\b/.test(clean)) return "schema";
    if (/\b(DELETE|UPDATE)\b/.test(clean)) return "destructive";
    if (/\b(INSERT|UPSERT|MERGE|REPLACE)\b/.test(clean)) return "write";

    return "unknown";
  }

  private assertWriteAccess(dto: ExecuteDeveloperSqlDto, risk: DeveloperSqlRisk) {
    const allowWrites = process.env.DEVELOPER_SQL_ALLOW_WRITES === "true";

    if (!allowWrites) {
      throw new ForbiddenException(
        "Write/schema SQL is disabled on the backend. Set DEVELOPER_SQL_ALLOW_WRITES=true only when you are ready.",
      );
    }

    if (dto.confirmText !== "I UNDERSTAND") {
      throw new ForbiddenException(
        `This ${risk} SQL requires confirmation text: I UNDERSTAND`,
      );
    }
  }

  private getColumns(rows: any[]) {
    const columns = new Set<string>();

    for (const row of rows) {
      if (row && typeof row === "object") {
        Object.keys(row).forEach((key) => columns.add(key));
      }
    }

    return Array.from(columns);
  }

  private serializeRows(rows: any[]) {
    return rows.map((row) => this.serializeValue(row));
  }

  private serializeValue(value: any): any {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => this.serializeValue(item));

    if (value && typeof value === "object") {
      const output: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        output[key] = this.serializeValue(val);
      }
      return output;
    }

    return value;
  }

  private pushHistory(item: SqlHistoryItem) {
    this.history.unshift(item);
    if (this.history.length > 100) this.history.length = 100;
  }

  private makeAuditId() {
    return `sql-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
