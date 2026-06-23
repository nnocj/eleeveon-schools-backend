import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto, RegisterDto } from "./dto/auth.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  private jwtSecret() {
    return process.env.JWT_SECRET || "CHANGE_ME_DEV_SECRET";
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.appUser.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("This email is already registered.");

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(
      async (tx) => {
      const account = await tx.account.create({
        data: {
          name: dto.accountName.trim(),
          email,
          phone: dto.phone?.trim() || null,
          country: "GH",
          currency: "GHS",
          status: "active",
        },
      });

      const trialPlan = await tx.subscriptionPlan.findUnique({ where: { code: "trial" } });
      if (trialPlan) {
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        await tx.accountSubscription.create({
          data: {
            accountId: account.id,
            planId: trialPlan.id,
            status: "trial",
            billingCycle: "monthly",
            trialStartedAt: now,
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
            nextBillingDate: trialEndsAt,
          },
        });
      }

      const user = await tx.appUser.create({
        data: {
          accountId: account.id,
          fullName: dto.fullName.trim(),
          email,
          phone: dto.phone?.trim() || null,
          passwordHash,
          role: "super_admin",
          active: true,
        },
      });

      await tx.userMembership.create({
        data: {
          accountId: account.id,
          userId: user.id,
          role: "super_admin",
          active: true,
        },
      });

      await this.seedDefaultPermissionRules(tx, account.id);
      return { account, user };
    },
    {
      timeout: 20000,
      maxWait: 10000,
    }
  );

    return this.sessionForUser(result.user.id);
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.appUser.findUnique({
      where: { email },
      include: { memberships: { where: { active: true } }, account: true },
    });

    if (!user || !user.active) throw new UnauthorizedException("Invalid login credentials.");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid login credentials.");

    await this.prisma.appUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.sessionForUser(user.id);
  }

  async me(userId: string) {
    return this.sessionForUser(userId, false);
  }

  async sessionForUser(userId: string, includeToken = true) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      include: {
        account: { include: { subscription: { include: { plan: true } } } },
        memberships: { where: { active: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!user || !user.active) throw new UnauthorizedException("Your account is not active.");

    const payload = {
      sub: user.id,
      id: user.id,
      accountId: user.accountId,
      email: user.email,
      role: user.role,
      memberships: user.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        schoolId: m.schoolId,
        branchId: m.branchId,
        teacherLocalId: m.teacherLocalId,
        studentLocalId: m.studentLocalId,
        parentLocalId: m.parentLocalId,
        active: m.active,
      })),
    };

    const safeUser = {
      id: user.id,
      accountId: user.accountId,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      active: user.active,
      lastLoginAt: user.lastLoginAt,
      memberships: payload.memberships,
    };

    return {
      user: safeUser,
      account: {
        id: user.account.id,
        name: user.account.name,
        email: user.account.email,
        phone: user.account.phone,
        country: user.account.country,
        currency: user.account.currency,
        status: user.account.status,
        subscription: user.account.subscription,
      },
      ...(includeToken
        ? { accessToken: await this.jwt.signAsync(payload, { secret: this.jwtSecret(), expiresIn: "30d" }) }
        : {}),
    };
  }

  private async seedDefaultPermissionRules(tx: any, accountId: string) {
    const modules = [
      ["schools", "Schools", "yes", "yes", "no", "no", "no", "no", "no"],
      ["branches", "Branches", "yes", "yes", "yes", "no", "no", "no", "no"],
      ["users", "Users & Memberships", "yes", "yes", "yes", "no", "no", "no", "no"],
      ["academics", "Academic Setup", "yes", "yes", "yes", "no", "no", "no", "no"],
      ["attendance", "Attendance", "yes", "yes", "yes", "yes", "yes", "yes", "no"],
      ["assessment", "Assessment", "yes", "yes", "yes", "yes", "yes", "yes", "no"],
      ["reports", "Reports", "yes", "yes", "yes", "yes", "yes", "yes", "yes"],
      ["finance", "Finance", "yes", "yes", "yes", "no", "no", "yes", "yes"],
      ["settings", "Settings", "yes", "yes", "yes", "no", "no", "no", "no"],
      ["integrations", "API & Integrations", "yes", "yes", "no", "no", "no", "no", "no"],
      ["webhooks", "Webhooks", "yes", "yes", "no", "no", "no", "no", "no"],
      ["audit", "Audit Logs", "yes", "yes", "no", "no", "no", "no", "no"],
      ["sync", "Sync & Devices", "yes", "yes", "yes", "no", "no", "no", "no"],
    ];

    for (const [moduleKey, moduleLabel, owner, admin, branch, teacher, student, parent, accountant] of modules) {
      await tx.permissionRule.upsert({
        where: { accountId_moduleKey: { accountId, moduleKey } },
        update: {},
        create: { accountId, moduleKey, moduleLabel, owner, admin, branch, teacher, student, parent, accountant },
      });
    }
  }
}
