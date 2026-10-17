/**
 * src/admissions/admission-number.service.ts
 * Server-authoritative, branch-scoped student admission allocation.
 *
 * IMPORTANT:
 * - Register this service in SyncModule.providers before injecting it into SyncService.
 * - Invoke assignInTransaction() INSIDE the SAME serializable Prisma transaction
 *   as the students SyncRecord upsert. Retry Prisma P2034 at the transaction owner.
 * - The configuration MUST be read from server-stored schoolBranchSettings
 *   after validating the actor's workspace membership and scope.
 * - Backfill/audit pre-existing student admission numbers BEFORE activating
 *   new allocations; otherwise this registry cannot see legacy numbers.
 * - The caller must write the returned number back into the saved student JSON
 *   and return the authoritative payload to the client for reconciliation.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

export type AdmissionMode = "manual" | "automatic" | "automatic_or_manual";
export type AdmissionConfiguration = {
  mode: AdmissionMode;
  prefix: string;
  separator: string;
  padding: number;
  nextSequence: number;
  scope: "branch";
};

export type AdmissionAssignment = {
  admissionNumber: string;
  normalizedNumber: string;
  assignedAutomatically: boolean;
};

export type AdmissionAllocationArgs = {
  accountId: string;
  schoolId: string;
  branchId: string;
  studentId: string;
  supplied?: string | null;
  /** Explicit, server-verified intent, not a client-trusted flag. */
  provisionalAutomatic?: boolean;
  config: AdmissionConfiguration;
};

@Injectable()
export class AdmissionNumberService {
  normalizeNumber(value: unknown): string {
    return String(value ?? "").trim().toUpperCase();
  }

  /** A branch without saved settings behaves as manual-only. */
  normalizeConfig(value: unknown): AdmissionConfiguration {
    const raw = value && typeof value === "object"
      ? value as Record<string, unknown>
      : {};
    const mode = raw.mode ?? "manual";
    if (mode !== "manual" && mode !== "automatic" && mode !== "automatic_or_manual") {
      throw new BadRequestException("Invalid admission-number mode.");
    }
    if (raw.scope != null && raw.scope !== "branch") {
      throw new BadRequestException("Only branch-scoped admission numbering is currently supported.");
    }
    const prefix = this.normalizeNumber(raw.prefix);
    const separator = String(raw.separator ?? "-");
    const padding = Number(raw.padding ?? 3);
    const nextSequence = Number(raw.nextSequence ?? 1);
    if (prefix.length > 32 || separator.length > 5) {
      throw new BadRequestException("Admission prefix or separator is too long.");
    }
    if (!Number.isInteger(padding) || padding < 1 || padding > 12) {
      throw new BadRequestException("Admission number padding must be between 1 and 12.");
    }
    if (!Number.isSafeInteger(nextSequence) || nextSequence < 1) {
      throw new BadRequestException("Admission nextSequence must be a positive integer.");
    }
    return { mode, prefix, separator, padding, nextSequence, scope: "branch" };
  }

  /**
   * Transaction-only entry point. This method deliberately does not start a
   * transaction: the student SyncRecord write must be atomic with the assignment.
   */
  async assignInTransaction(
    tx: Prisma.TransactionClient,
    args: AdmissionAllocationArgs,
  ): Promise<AdmissionAssignment | null> {
    const accountId = args.accountId?.trim();
    const schoolId = args.schoolId?.trim();
    const branchId = args.branchId?.trim();
    const studentId = args.studentId?.trim();
    if (!accountId || !schoolId || !branchId || !studentId) {
      throw new BadRequestException("Account, school, branch and student ID are required.");
    }
    const config = this.normalizeConfig(args.config);
    const supplied = String(args.supplied ?? "").trim();
    const normalizedSupplied = this.normalizeNumber(supplied);

    // Confirmed identity wins on retries and updates. Never silently renumber it.
    const existing = await tx.studentAdmissionIdentity.findUnique({
      where: { accountId_studentId: { accountId, studentId } },
    });
    if (existing) {
      if (existing.schoolId !== schoolId || existing.branchId !== branchId) {
        throw new ConflictException("Student belongs to another admission-number scope; use an authorized transfer workflow.");
      }
      if (normalizedSupplied && normalizedSupplied !== existing.normalizedNumber && !args.provisionalAutomatic) {
        throw new ConflictException("Changing a confirmed admission number requires a separate authorized correction workflow.");
      }
      return {
        admissionNumber: existing.admissionNumber,
        normalizedNumber: existing.normalizedNumber,
        assignedAutomatically: false,
      };
    }

    // Explicit manual number: never silently replace conflicting values.
    if (normalizedSupplied && !args.provisionalAutomatic) {
      if (config.mode === "automatic") {
        throw new BadRequestException("This branch generates admission numbers automatically.");
      }
      try {
        const created = await tx.studentAdmissionIdentity.create({
          data: {
            accountId, schoolId, branchId, studentId,
            admissionNumber: supplied,
            normalizedNumber: normalizedSupplied,
          },
        });
        return {
          admissionNumber: created.admissionNumber,
          normalizedNumber: created.normalizedNumber,
          assignedAutomatically: false,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException("This admission number already belongs to a student in the branch.");
        }
        throw error;
      }
    }

    // Automatic client candidates are provisional; they are never authoritative.
    if (config.mode === "manual") {
      if (args.provisionalAutomatic) {
        throw new BadRequestException("This branch uses manual admission numbers.");
      }
      return null;
    }

    // The serializable transaction and unique indexes provide concurrency safety.
    // On P2034, the caller should retry the WHOLE transaction.
    const sequence = await tx.admissionNumberSequence.upsert({
      where: { accountId_schoolId_branchId: { accountId, schoolId, branchId } },
      create: { accountId, schoolId, branchId, nextSequence: config.nextSequence },
      update: {},
    });
    let candidate = Math.max(sequence.nextSequence, config.nextSequence);
    for (let attempts = 0; attempts < 100_000; attempts += 1, candidate += 1) {
      if (!Number.isSafeInteger(candidate)) {
        throw new ConflictException("Admission sequence has reached its safe limit.");
      }
      const admissionNumber = `${config.prefix}${config.separator}${String(candidate).padStart(config.padding, "0")}`;
      const normalizedNumber = this.normalizeNumber(admissionNumber);
      if (!normalizedNumber) throw new BadRequestException("Generated admission number is empty.");
      const used = await tx.studentAdmissionIdentity.findUnique({
        where: {
          accountId_schoolId_branchId_normalizedNumber: {
            accountId, schoolId, branchId, normalizedNumber,
          },
        },
        select: { id: true },
      });
      if (used) continue;

      await tx.studentAdmissionIdentity.create({
        data: { accountId, schoolId, branchId, studentId, admissionNumber, normalizedNumber },
      });
      await tx.admissionNumberSequence.update({
        where: { id: sequence.id },
        data: { nextSequence: candidate + 1 },
      });
      return { admissionNumber, normalizedNumber, assignedAutomatically: true };
    }
    throw new ConflictException("Unable to find an available admission number in this branch.");
  }
}
