import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { EntitlementUsage } from "./types/entitlement.types";

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async calculate(
    accountId: string,
    source:
      | "reconcile"
      | "mutation"
      | "sync"
      | "manual" = "reconcile",
  ): Promise<EntitlementUsage> {
    const [
      schools,
      branches,
      students,
      teachers,
      users,
      storage,
      entitlement,
      devices,
      activations,
    ] = await Promise.all([
      this.countActiveSyncRecords(accountId, "schools"),
      this.countActiveSyncRecords(accountId, "branches"),
      this.countActiveSyncRecords(accountId, "students"),
      this.countActiveSyncRecords(accountId, "teachers"),
      this.prisma.appUser.count({
        where: { accountId, active: true },
      }),
      this.prisma.storageUsage.findUnique({
        where: { accountId },
      }),
      this.prisma.accountEntitlement.findUnique({
        where: { accountId },
        select: { version: true },
      }),
      this.prisma.licenseDevice.count({
        where: {
          accountId,
          status: "active",
        },
      }),
      this.prisma.licenseActivation.count({
        where: {
          accountId,
          status: "active",
        },
      }),
    ]);

    const storageBytes =
      storage?.usedBytes ?? BigInt(0);

    const storageMb = Number(
      storageBytes / BigInt(1024 * 1024),
    );

    const snapshot =
      await this.prisma.accountUsageSnapshot.upsert({
        where: { accountId },
        update: {
          schools,
          branches,
          users,
          students,
          teachers,
          storageBytes,
          storageMb,
          entitlementVersion:
            entitlement?.version ?? 1,
          calculationSource: source,
          calculatedAt: new Date(),
        },
        create: {
          accountId,
          schools,
          branches,
          users,
          students,
          teachers,
          storageBytes,
          storageMb,
          entitlementVersion:
            entitlement?.version ?? 1,
          calculationSource: source,
        },
      });

    return {
      schools: snapshot.schools,
      branches: snapshot.branches,
      users: snapshot.users,
      students: snapshot.students,
      teachers: snapshot.teachers,
      storageMb: snapshot.storageMb,
      apiCallsPerMonth:
        snapshot.apiCallsThisMonth,
      devices,
      activations,
      calculatedAt: snapshot.calculatedAt,
    };
  }

  async get(
    accountId: string,
    refresh = false,
  ): Promise<EntitlementUsage> {
    if (refresh) {
      return this.calculate(accountId);
    }

    const [snapshot, devices, activations] =
      await Promise.all([
        this.prisma.accountUsageSnapshot.findUnique({
          where: { accountId },
        }),
        this.prisma.licenseDevice.count({
          where: {
            accountId,
            status: "active",
          },
        }),
        this.prisma.licenseActivation.count({
          where: {
            accountId,
            status: "active",
          },
        }),
      ]);

    if (!snapshot) {
      return this.calculate(accountId);
    }

    return {
      schools: snapshot.schools,
      branches: snapshot.branches,
      users: snapshot.users,
      students: snapshot.students,
      teachers: snapshot.teachers,
      storageMb: snapshot.storageMb,
      apiCallsPerMonth:
        snapshot.apiCallsThisMonth,
      devices,
      activations,
      calculatedAt: snapshot.calculatedAt,
    };
  }

  private async countActiveSyncRecords(
    accountId: string,
    tableName: string,
  ): Promise<number> {
    return this.prisma.syncRecord.count({
      where: {
        accountId,
        tableName,
        isDeleted: false,
      },
    });
  }
}
