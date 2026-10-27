/**
 * src/admissions/admission-number.service.ts
 * Server-authoritative admission allocation.
 * Call inside the same SERIALIZABLE transaction as the student syncRecord upsert.
 * Retry P2034 at transaction owner. Do not trust provisionalAutomatic based only
 * on a browser-supplied boolean: authenticate the origin and validate against the
 * stored student record and branch settings in the sync layer.
 */
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
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
  /** MUST be derived/verified by trusted sync handler, not accepted from untrusted client blindly. */
  provisionalAutomatic?: boolean;
  config: AdmissionConfiguration;
};

@Injectable()
export class AdmissionNumberService {
  normalizeNumber(value: unknown): string {
    return String(value ?? "").trim().toUpperCase();
  }

  normalizeConfig(value: unknown): AdmissionConfiguration {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const mode = raw.mode ?? "manual";
    if (mode !== "manual" && mode !== "automatic" && mode !== "automatic_or_manual")
      throw new BadRequestException("Invalid admission-number mode.");
    if (raw.scope != null && raw.scope !== "branch")
      throw new BadRequestException("Only branch-scoped admission numbering is supported.");
    const prefix = this.normalizeNumber(raw.prefix);
    const separator = String(raw.separator ?? "-");
    const padding = Number(raw.padding ?? 3);
    const nextSequence = Number(raw.nextSequence ?? 1);
    if (prefix.length > 32 || separator.length > 5)
      throw new BadRequestException("Admission prefix or separator is too long.");
    if (!Number.isInteger(padding) || padding < 1 || padding > 12)
      throw new BadRequestException("Admission number padding must be between 1 and 12.");
    if (!Number.isSafeInteger(nextSequence) || nextSequence < 1)
      throw new BadRequestException("Admission nextSequence must be a positive integer.");
    return { mode: mode as AdmissionMode, prefix, separator, padding, nextSequence, scope: "branch" };
  }

  async assignInTransaction(tx: Prisma.TransactionClient, args: AdmissionAllocationArgs): Promise<AdmissionAssignment | null> {
    const accountId = args.accountId?.trim();
    const schoolId = args.schoolId?.trim();
    const branchId = args.branchId?.trim();
    const studentId = args.studentId?.trim();
    if (!accountId || !schoolId || !branchId || !studentId)
      throw new BadRequestException("Account, school, branch and student ID are required.");
    const config = this.normalizeConfig(args.config);
    const supplied = String(args.supplied ?? "").trim();
    const normalizedSupplied = this.normalizeNumber(supplied);

    const existing = await tx.studentAdmissionIdentity.findUnique({
      where: { accountId_studentId: { accountId, studentId } },
    });
    if (existing) {
      if (existing.schoolId !== schoolId || existing.branchId !== branchId)
        throw new ConflictException("Student belongs to another admission-number scope; use an authorized transfer workflow.");
      // A confirmed number ALWAYS wins. A stale/offline client candidate is
      // reconciled to this number, never treated as an authorized correction.
      // The sync caller MUST store the returned number in its authoritative
      // student payload and send that payload back to the browser.
      return { admissionNumber: existing.admissionNumber, normalizedNumber: existing.normalizedNumber, assignedAutomatically: false };
    }

    if (normalizedSupplied && !args.provisionalAutomatic) {
      if (config.mode === "automatic")
        throw new BadRequestException("This branch generates admission numbers automatically.");
      try {
        const created = await tx.studentAdmissionIdentity.create({
          data: { accountId, schoolId, branchId, studentId, admissionNumber: supplied, normalizedNumber: normalizedSupplied },
        });
        return { admissionNumber: created.admissionNumber, normalizedNumber: created.normalizedNumber, assignedAutomatically: false };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
          throw new ConflictException("This admission number already belongs to a student in the branch.");
        throw error;
      }
    }
    if (config.mode === "manual") {
      if (args.provisionalAutomatic) throw new BadRequestException("This branch uses manual admission numbers.");
      return null;
    }

    const sequence = await tx.admissionNumberSequence.upsert({
      where: { accountId_schoolId_branchId: { accountId, schoolId, branchId } },
      create: { accountId, schoolId, branchId, nextSequence: config.nextSequence },
      update: {},
    });
    let candidate = Math.max(sequence.nextSequence, config.nextSequence);
    for (let attempts = 0; attempts < 100_000; attempts++, candidate++) {
      if (!Number.isSafeInteger(candidate)) throw new ConflictException("Admission sequence exceeds the safe integer limit.");
      const separator = config.prefix ? config.separator : "";
      const admissionNumber = `${config.prefix}${separator}${String(candidate).padStart(config.padding, "0")}`;
      const normalizedNumber = this.normalizeNumber(admissionNumber);
      if (!normalizedNumber) throw new BadRequestException("Generated admission number is empty.");
      const used = await tx.studentAdmissionIdentity.findUnique({
        where: { accountId_schoolId_branchId_normalizedNumber: { accountId, schoolId, branchId, normalizedNumber } },
        select: { id: true },
      });
      if (used) continue;
      await tx.studentAdmissionIdentity.create({
        data: { accountId, schoolId, branchId, studentId, admissionNumber, normalizedNumber },
      });
      await tx.admissionNumberSequence.update({ where: { id: sequence.id }, data: { nextSequence: candidate + 1 } });
      return { admissionNumber, normalizedNumber, assignedAutomatically: true };
    }
    throw new ConflictException("Unable to find an available admission number in this branch.");
  }
}
