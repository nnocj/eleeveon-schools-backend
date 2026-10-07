import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { AuthUser } from "../common/auth-user";
import { assertSameAccountOrDeveloper } from "../common/scope";
import { isDeveloper, normalizeRole } from "../common/roles";
import {
  ChangeMyEmailDto,
  ChangeMyPasswordDto,
  CreateAccountDto,
  CreateAccountUserDto,
  UpdateAccountDto,
  UpdateAccountSettingsDto,
  TransferOwnershipDto,
  UpdateAccountUserDto,
  UpdateAccountUserStatusDto,
  UpdateMyProfileDto,
} from "./dto/account-users.dto";

const USER_CREATION_ROLES = new Set([
  "developer",
  "platform_team",
  "owner",
  "super_admin",
  "school_admin",
  "admin",
  "branch_admin",
]);

const ACCOUNT_USER_MANAGEMENT_ROLES = new Set([
  "developer",
  "platform_team",
  "owner",
  "super_admin",
  "school_admin",
  "admin",
]);

const OWNER_ONLY_ROLES = new Set([
  "developer",
  "platform_team",
  "owner",
  "super_admin",
]);

// Customer-account ownership roles. developer/platform_team can manage the
// platform but are not treated as the transferable owner identity.
const ACCOUNT_OWNER_ROLES = new Set(["owner", "super_admin"]);

// Used only when removing owner authority from a former owner. If the person
// already has lower active memberships, keep them active under the strongest
// remaining membership. If none remain, their AppUser is deactivated.
const NON_OWNER_ROLE_PRIORITY = [
  "school_admin",
  "admin",
  "branch_admin",
  "accountant",
  "teacher",
  "parent",
  "student",
];

const BRANCH_ASSIGNABLE_ROLES = new Set([
  "accountant",
  "teacher",
  "student",
  "parent",
]);

/**
 * Produces a stable identity for a membership scope.
 *
 * The key includes the role and every applicable permanent backend ID so that:
 * - account-wide roles remain unique per account;
 * - school/branch roles remain unique per assigned scope;
 * - teacher/student/parent profiles do not collide.
 */
function buildMembershipScopeKey(input: {
  accountId: string;
  role: string;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
}): string {
  return [
    input.role,
    `account:${input.accountId}`,
    input.schoolId ? `school:${input.schoolId}` : null,
    input.branchId ? `branch:${input.branchId}` : null,
    input.teacherId ? `teacher:${input.teacherId}` : null,
    input.studentId ? `student:${input.studentId}` : null,
    input.parentId ? `parent:${input.parentId}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("|");
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  private normalizedActorRole(role: string): string {
    const normalized = normalizeRole(role);

    if (!normalized) {
      throw new ForbiddenException(
        "Invalid or unsupported user role.",
      );
    }

    return normalized === "admin"
      ? "school_admin"
      : normalized;
  }

  private assertCanCreateUsers(role: string) {
    const normalizedRole = this.normalizedActorRole(role);
    if (!USER_CREATION_ROLES.has(normalizedRole)) {
      throw new ForbiddenException(
        "You do not have permission to create account users.",
      );
    }
  }

  private assertCanManageAccountUsers(role: string) {
    const normalizedRole = this.normalizedActorRole(role);
    if (!ACCOUNT_USER_MANAGEMENT_ROLES.has(normalizedRole)) {
      throw new ForbiddenException(
        "You do not have permission to manage account users.",
      );
    }
  }

  private isOwnerLevelRole(role: string): boolean {
    return OWNER_ONLY_ROLES.has(this.normalizedActorRole(role));
  }

  private assertCanManageOwnerOnly(role: string) {
    if (!this.isOwnerLevelRole(role)) {
      throw new ForbiddenException("Only the owner can perform this action.");
    }
  }


  private isTransferableAccountOwnerRole(role: string): boolean {
    const normalized = normalizeRole(role);
    if (!normalized) return false;
    const canonical = normalized === "admin" ? "school_admin" : normalized;
    return ACCOUNT_OWNER_ROLES.has(canonical);
  }

  private assertCanTransferOwnership(role: string) {
    if (!this.isTransferableAccountOwnerRole(role)) {
      throw new ForbiddenException(
        "Only the current account owner can transfer ownership.",
      );
    }
  }

  private getHighestRemainingNonOwnerRole(
    memberships: Array<{ role: string; active?: boolean; status?: string }>,
  ): string | null {
    const activeRoles = new Set<string>(
      memberships
        .filter(
          (membership) =>
            membership.active !== false &&
            (!membership.status || membership.status === "active"),
        )
        .map((membership) => {
          const normalized = normalizeRole(membership.role);
          if (!normalized) return "";
          return normalized === "admin" ? "school_admin" : normalized;
        })
        .filter(
          (role) =>
            Boolean(role) &&
            !ACCOUNT_OWNER_ROLES.has(role) &&
            role !== "developer" &&
            role !== "platform_team",
        ),
    );

    for (const role of NON_OWNER_ROLE_PRIORITY) {
      const canonical = role === "admin" ? "school_admin" : role;
      if (activeRoles.has(canonical)) return canonical;
    }

    return null;
  }

  // ======================================================
  // CURRENT LOGGED-IN USER / OWNER SELF-SERVICE
  //
  // Eleeveon owner identity intentionally spans two records:
  // - Account = owner/customer/tenant record
  // - AppUser = authenticated owner login
  //
  // Account.name remains the account/business name while AppUser.fullName is
  // the human owner's name. For owner-level users, email and phone are kept in
  // sync across Account and AppUser. Password remains AppUser-only.
  // ======================================================

  private async getSafeUser(userId: string) {
    return this.prisma.appUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountId: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        preferredLocale: true,
        active: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        passwordChangedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  private async getOwnerAccount(accountId: string) {
    return this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        website: true,
        address: true,
        description: true,
        logoMediaId: true,
        photoMediaId: true,
        bannerMediaId: true,
        country: true,
        currency: true,
        defaultLocale: true,
        timeZone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getMyProfile(actor: AuthUser) {
    const user = await this.getSafeUser(actor.id);
    if (!user) throw new NotFoundException("Current user not found.");

    assertSameAccountOrDeveloper(actor, user.accountId);

    const account = await this.getOwnerAccount(user.accountId);
    if (!account) throw new NotFoundException("Account not found.");

    const ownerLevel = this.isOwnerLevelRole(actor.role);
    const accountEmail = account.email?.toLowerCase().trim() || "";
    const userEmail = user.email?.toLowerCase().trim() || "";
    const accountPhone = account.phone?.trim() || "";
    const userPhone = user.phone?.trim() || "";

    return {
      user,
      account,
      ownerIdentity: {
        ownerLevel,
        emailSynchronized:
          !ownerLevel || (!accountEmail && !userEmail) || accountEmail === userEmail,
        phoneSynchronized:
          !ownerLevel || (!accountPhone && !userPhone) || accountPhone === userPhone,
      },
    };
  }

  async updateMyProfile(actor: AuthUser, dto: UpdateMyProfileDto) {
    const existing = await this.prisma.appUser.findUnique({
      where: { id: actor.id },
      select: {
        id: true,
        accountId: true,
        role: true,
        active: true,
      },
    });

    if (!existing) throw new NotFoundException("Current user not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);

    const ownerLevel = this.isOwnerLevelRole(actor.role);
    const normalizedPhone =
      dto.phone !== undefined ? dto.phone.trim() || null : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({
        where: { id: existing.id },
        data: {
          fullName:
            dto.fullName !== undefined
              ? dto.fullName.trim()
              : undefined,
          phone: normalizedPhone,
          preferredLocale:
            dto.preferredLocale !== undefined
              ? dto.preferredLocale.trim() || null
              : undefined,
        },
      });

      // For the owner, Account.phone and owner AppUser.phone describe the same
      // owner/customer identity, so keep them synchronized.
      if (ownerLevel && dto.phone !== undefined) {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { phone: normalizedPhone },
        });
      }
    });

    const [user, account] = await Promise.all([
      this.getSafeUser(existing.id),
      this.getOwnerAccount(existing.accountId),
    ]);

    if (!user || !account) {
      throw new NotFoundException("Owner profile could not be reloaded.");
    }

    this.realtime.emitMembershipsChanged({
      accountId: existing.accountId,
      userId: user.id,
      action: "updated",
      active: user.active !== false,
      metadata: {
        operation: ownerLevel
          ? "owner-profile-updated"
          : "self-profile-updated",
      },
    });

    if (ownerLevel && dto.phone !== undefined) {
      this.realtime.emitAccountDataChanged({
        accountId: existing.accountId,
        changedTables: ["accounts"],
        metadata: { action: "owner-contact-updated" },
      });
    }

    return { user, account };
  }

  async changeMyEmail(actor: AuthUser, dto: ChangeMyEmailDto) {
    const existing = await this.prisma.appUser.findUnique({
      where: { id: actor.id },
    });

    if (!existing) throw new NotFoundException("Current user not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);

    const passwordMatches = await bcrypt.compare(
      dto.currentPassword,
      existing.passwordHash,
    );

    if (!passwordMatches) {
      throw new BadRequestException("Current password is incorrect.");
    }

    const newEmail = dto.newEmail.toLowerCase().trim();
    if (!newEmail) throw new BadRequestException("New email is required.");

    const ownerLevel = this.isOwnerLevelRole(actor.role);
    const account = await this.prisma.account.findUnique({
      where: { id: existing.accountId },
      select: { id: true, email: true },
    });

    if (!account) throw new NotFoundException("Account not found.");

    // For an owner email, Account is the first owner/customer identity boundary.
    // A school/branch SyncRecord email is intentionally NOT checked here because
    // contact data inside school/branch records is not a registered login identity.
    if (ownerLevel) {
      const accountWithEmail = await this.prisma.account.findUnique({
        where: { email: newEmail },
        select: { id: true },
      });

      if (accountWithEmail && accountWithEmail.id !== existing.accountId) {
        throw new ConflictException({
          code: "OWNER_EMAIL_IN_USE_BY_ANOTHER_ACCOUNT",
          message: "This email already belongs to another owner account.",
        });
      }
    }

    const userWithEmail = await this.prisma.appUser.findUnique({
      where: { email: newEmail },
      select: {
        id: true,
        accountId: true,
        fullName: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (userWithEmail && userWithEmail.id !== existing.id) {
      if (ownerLevel && userWithEmail.accountId === existing.accountId) {
        throw new ConflictException({
          code: "OWNER_EMAIL_BELONGS_TO_EXISTING_ACCOUNT_USER",
          message:
            "This email already belongs to another user in this account. If that user is actually the owner, ownership must be transferred to that existing user instead of creating a duplicate login identity.",
          existingUser: {
            id: userWithEmail.id,
            fullName: userWithEmail.fullName,
            email: userWithEmail.email,
            role: userWithEmail.role,
            active: userWithEmail.active,
          },
        });
      }

      throw new ConflictException({
        code: "EMAIL_ALREADY_REGISTERED_TO_ANOTHER_USER",
        message: "This email is already registered to another login user.",
      });
    }

    const appUserAlreadyMatches =
      existing.email.toLowerCase().trim() === newEmail;
    const accountAlreadyMatches =
      (account.email || "").toLowerCase().trim() === newEmail;

    if (ownerLevel) {
      if (!appUserAlreadyMatches || !accountAlreadyMatches) {
        await this.prisma.$transaction(async (tx) => {
          if (!appUserAlreadyMatches) {
            await tx.appUser.update({
              where: { id: existing.id },
              data: {
                email: newEmail,
                emailVerifiedAt: null,
              },
            });
          }

          if (!accountAlreadyMatches) {
            await tx.account.update({
              where: { id: existing.accountId },
              data: { email: newEmail },
            });
          }
        });
      }
    } else if (!appUserAlreadyMatches) {
      await this.prisma.appUser.update({
        where: { id: existing.id },
        data: {
          email: newEmail,
          emailVerifiedAt: null,
        },
      });
    }

    const [user, updatedAccount] = await Promise.all([
      this.getSafeUser(existing.id),
      this.getOwnerAccount(existing.accountId),
    ]);

    if (!user || !updatedAccount) {
      throw new NotFoundException("Updated owner profile could not be reloaded.");
    }

    this.realtime.emitMembershipsChanged({
      accountId: existing.accountId,
      userId: user.id,
      action: "updated",
      active: user.active !== false,
      metadata: {
        operation: ownerLevel
          ? "owner-email-synchronized"
          : "self-email-changed",
      },
    });

    if (ownerLevel) {
      this.realtime.emitAccountDataChanged({
        accountId: existing.accountId,
        changedTables: ["accounts"],
        metadata: { action: "owner-email-synchronized" },
      });
    }

    return {
      user,
      account: updatedAccount,
      ownerIdentity: {
        ownerLevel,
        emailSynchronized:
          updatedAccount.email?.toLowerCase().trim() ===
          user.email?.toLowerCase().trim(),
      },
    };
  }

  async changeMyPassword(actor: AuthUser, dto: ChangeMyPasswordDto) {
    const existing = await this.prisma.appUser.findUnique({
      where: { id: actor.id },
    });

    if (!existing) throw new NotFoundException("Current user not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);

    const passwordMatches = await bcrypt.compare(
      dto.currentPassword,
      existing.passwordHash,
    );

    if (!passwordMatches) {
      throw new BadRequestException("Current password is incorrect.");
    }

    const sameAsCurrent = await bcrypt.compare(
      dto.newPassword,
      existing.passwordHash,
    );

    if (sameAsCurrent) {
      throw new BadRequestException(
        "New password must be different from the current password.",
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    const user = await this.prisma.appUser.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
      select: {
        id: true,
        accountId: true,
        email: true,
        role: true,
        active: true,
        passwordChangedAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      userId: user.id,
      email: user.email,
      passwordChangedAt: user.passwordChangedAt,
      updatedAt: user.updatedAt,
    };
  }


  // ======================================================
  // COMPLETE OWNERSHIP TRANSFER
  //
  // Ownership moves to an EXISTING AppUser in this same Account.
  // The target user's email/passwordHash are not copied or changed: the new
  // owner keeps signing in with the exact same email/password they already had.
  // Account.email/phone are synchronized to the target user's identity.
  //
  // All existing lower memberships on the target remain intact. Owner and
  // super_admin authority is revoked from every other owner-level identity in
  // this Account so the transfer leaves one canonical customer owner.
  // ======================================================

  async transferOwnership(actor: AuthUser, dto: TransferOwnershipDto) {
    this.assertCanTransferOwnership(actor.role);

    const currentOwner = await this.prisma.appUser.findUnique({
      where: { id: actor.id },
      include: { memberships: true },
    });

    if (!currentOwner) {
      throw new NotFoundException("Current owner login was not found.");
    }

    assertSameAccountOrDeveloper(actor, currentOwner.accountId);

    if (!currentOwner.active) {
      throw new ForbiddenException("The current owner login is inactive.");
    }

    if (!this.isTransferableAccountOwnerRole(currentOwner.role)) {
      throw new ForbiddenException(
        "The current login is not the transferable account owner.",
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.currentPassword,
      currentOwner.passwordHash,
    );

    if (!passwordMatches) {
      throw new BadRequestException("Current password is incorrect.");
    }

    const targetUserId = String(dto.targetUserId || "").trim();
    if (!targetUserId) {
      throw new BadRequestException("Select the user who should become owner.");
    }

    if (targetUserId === currentOwner.id) {
      throw new BadRequestException("You are already the current owner.");
    }

    const target = await this.prisma.appUser.findUnique({
      where: { id: targetUserId },
      include: { memberships: true },
    });

    if (!target) {
      throw new NotFoundException("The selected new owner was not found.");
    }

    if (target.accountId !== currentOwner.accountId) {
      throw new ForbiddenException(
        "Ownership can only be transferred to a user in this same account.",
      );
    }

    if (!target.active) {
      throw new BadRequestException(
        "The selected user is inactive. Activate the user before transferring ownership.",
      );
    }

    const targetRole = normalizeRole(target.role);
    if (targetRole === "developer" || targetRole === "platform_team") {
      throw new BadRequestException(
        "Platform developer/team identities cannot become the customer account owner.",
      );
    }

    // Account.email is unique across owner/customer Accounts. The target AppUser
    // already owns target.email in AppUser, which is exactly what we want to keep.
    const otherAccountUsingTargetEmail = await this.prisma.account.findUnique({
      where: { email: target.email.toLowerCase().trim() },
      select: { id: true },
    });

    if (
      otherAccountUsingTargetEmail &&
      otherAccountUsingTargetEmail.id !== currentOwner.accountId
    ) {
      throw new ConflictException({
        code: "TARGET_EMAIL_BELONGS_TO_ANOTHER_ACCOUNT",
        message:
          "The selected user's email is already the owner email of another account.",
      });
    }

    const now = new Date();
    const ownerScopeKey = buildMembershipScopeKey({
      accountId: currentOwner.accountId,
      role: "owner",
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { id: currentOwner.accountId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
        },
      });

      if (!account) {
        throw new NotFoundException("Account not found.");
      }

      // Load every account user so any legacy duplicate owner/super_admin
      // authority can be removed. Lower memberships are never removed.
      const allUsers = await tx.appUser.findMany({
        where: { accountId: currentOwner.accountId },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          active: true,
          memberships: {
            select: {
              id: true,
              role: true,
              active: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });

      const displacedOwnerIds: string[] = [];

      for (const user of allUsers) {
        if (user.id === target.id) continue;

        const hasOwnerRole = this.isTransferableAccountOwnerRole(user.role);
        const hasOwnerMembership = user.memberships.some(
          (membership) =>
            membership.active !== false &&
            (!membership.status || membership.status === "active") &&
            this.isTransferableAccountOwnerRole(membership.role),
        );

        if (!hasOwnerRole && !hasOwnerMembership) continue;

        displacedOwnerIds.push(user.id);

        await tx.userMembership.updateMany({
          where: {
            accountId: currentOwner.accountId,
            userId: user.id,
            role: { in: ["owner", "super_admin"] },
            active: true,
          },
          data: {
            active: false,
            status: "revoked",
            endedAt: now,
            isDefault: false,
          },
        });

        const remainingMemberships = await tx.userMembership.findMany({
          where: {
            accountId: currentOwner.accountId,
            userId: user.id,
            active: true,
            status: "active",
          },
          select: {
            role: true,
            active: true,
            status: true,
          },
        });

        const fallbackRole =
          this.getHighestRemainingNonOwnerRole(remainingMemberships);

        await tx.appUser.update({
          where: { id: user.id },
          data: fallbackRole
            ? {
                role: fallbackRole,
                active: true,
              }
            : {
                // No lower access remains. Keep the historical fallback role
                // value untouched for compatibility, but deactivate the login.
                // Owner authority is already removed by memberships + sessions.
                active: false,
              },
        });
      }

      // Canonicalize the target's owner authority. Existing lower memberships
      // remain intact and their profile passwordHash is never touched.
      await tx.userMembership.updateMany({
        where: {
          accountId: currentOwner.accountId,
          userId: target.id,
          role: { in: ["owner", "super_admin"] },
        },
        data: {
          active: false,
          status: "revoked",
          endedAt: now,
          isDefault: false,
        },
      });

      await tx.userMembership.updateMany({
        where: {
          accountId: currentOwner.accountId,
          userId: target.id,
        },
        data: { isDefault: false },
      });

      await tx.userMembership.upsert({
        where: {
          accountId_userId_scopeKey: {
            accountId: currentOwner.accountId,
            userId: target.id,
            scopeKey: ownerScopeKey,
          },
        },
        update: {
          role: "owner",
          schoolId: null,
          branchId: null,
          teacherId: null,
          studentId: null,
          parentId: null,
          active: true,
          status: "active",
          isDefault: true,
          acceptedAt: now,
          suspendedAt: null,
          endedAt: null,
        },
        create: {
          accountId: currentOwner.accountId,
          userId: target.id,
          role: "owner",
          scopeKey: ownerScopeKey,
          active: true,
          status: "active",
          isDefault: true,
          acceptedAt: now,
          createdByUserId: currentOwner.id,
        },
      });

      const newOwner = await tx.appUser.update({
        where: { id: target.id },
        data: {
          role: "owner",
          active: true,
          failedLoginCount: 0,
          lockedUntil: null,
          // passwordHash intentionally unchanged.
        },
        select: {
          id: true,
          accountId: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          preferredLocale: true,
          active: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          passwordChangedAt: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          memberships: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      const updatedAccount = await tx.account.update({
        where: { id: currentOwner.accountId },
        data: {
          email: target.email.toLowerCase().trim(),
          phone: target.phone?.trim() || null,
        },
      });

      // Revoke both former-owner and new-owner sessions. Former owner must lose
      // stale owner claims; new owner must log in again to receive owner claims.
      const sessionUserIds = Array.from(
        new Set([...displacedOwnerIds, target.id]),
      );

      const revokedSessions = await tx.userSession.updateMany({
        where: {
          accountId: currentOwner.accountId,
          userId: { in: sessionUserIds },
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          lastSeenAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          accountId: currentOwner.accountId,
          actorUserId: currentOwner.id,
          actorEmail: currentOwner.email,
          actorRole: currentOwner.role,
          action: "update",
          moduleKey: "accounts",
          entityType: "ownership_transfer",
          entityId: currentOwner.accountId,
          before: {
            ownerUserId: currentOwner.id,
            ownerEmail: account.email,
            ownerPhone: account.phone,
          },
          after: {
            ownerUserId: target.id,
            ownerEmail: target.email,
            ownerPhone: target.phone || null,
          },
          metadata: {
            targetUserId: target.id,
            displacedOwnerUserIds: displacedOwnerIds,
            targetPasswordPreserved: true,
            targetExistingMembershipsPreserved: true,
          },
        },
      });

      return {
        account: updatedAccount,
        newOwner,
        displacedOwnerIds,
        revokedSessionCount: revokedSessions.count,
      };
    });

    const displacedUsers = await Promise.all(
      result.displacedOwnerIds.map((userId) => this.getSafeUser(userId)),
    );

    for (const displacedUser of displacedUsers) {
      if (!displacedUser) continue;
      this.realtime.emitMembershipsChanged({
        accountId: currentOwner.accountId,
        userId: displacedUser.id,
        action: "updated",
        active: displacedUser.active !== false,
        metadata: {
          operation: "ownership-transferred-away",
          newOwnerUserId: target.id,
        },
      });
    }

    this.realtime.emitMembershipsChanged({
      accountId: currentOwner.accountId,
      userId: target.id,
      action: "updated",
      active: true,
      metadata: {
        operation: "ownership-transferred-in",
        previousOwnerUserId: currentOwner.id,
      },
    });

    this.realtime.emitAccountDataChanged({
      accountId: currentOwner.accountId,
      changedTables: ["accounts", "users", "memberships", "sessions"],
      metadata: {
        action: "ownership-transferred",
        previousOwnerUserId: currentOwner.id,
        newOwnerUserId: target.id,
      },
    });

    const previousOwner = await this.getSafeUser(currentOwner.id);

    return {
      success: true,
      message:
        "Ownership transferred successfully. The new owner can sign in with their existing email and existing password.",
      account: result.account,
      newOwner: result.newOwner,
      previousOwner,
      revokedSessionCount: result.revokedSessionCount,
      requiresReauthentication: true,
      targetPasswordPreserved: true,
    };
  }

  // ======================================================
  // ACCOUNT SYSTEM SETTINGS
  // ======================================================

  async getAccountSettings(actor: AuthUser) {
    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { id: true },
    });

    if (!account) throw new NotFoundException("Account not found.");

    return this.prisma.accountSystemSetting.findMany({
      where: { accountId: actor.accountId },
      orderBy: { key: "asc" },
    });
  }

  async updateAccountSettings(
    actor: AuthUser,
    dto: UpdateAccountSettingsDto,
  ) {
    this.assertCanManageOwnerOnly(actor.role);

    const entries = Object.entries(dto).filter(
      ([, value]) => value !== undefined,
    );

    if (!entries.length) return this.getAccountSettings(actor);

    const keys = entries.map(([key]) => key);

    const locked = await this.prisma.accountSystemSetting.findMany({
      where: {
        accountId: actor.accountId,
        key: { in: keys },
        locked: true,
      },
      select: { key: true },
    });

    if (locked.length) {
      throw new BadRequestException(
        `These account settings are locked: ${locked
          .map((row) => row.key)
          .join(", ")}.`,
      );
    }

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.accountSystemSetting.upsert({
          where: {
            accountId_key: {
              accountId: actor.accountId,
              key,
            },
          },
          update: { value: value as any },
          create: {
            accountId: actor.accountId,
            key,
            value: value as any,
          },
        }),
      ),
    );

    this.realtime.emitAccountDataChanged({
      accountId: actor.accountId,
      changedTables: ["accountSystemSettings"],
      metadata: {
        action: "account-settings-updated",
        keys,
      },
    });

    return this.getAccountSettings(actor);
  }

  async listAccounts(actor: AuthUser, q?: string) {
    if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can list platform accounts.");
    return this.prisma.account.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
      include: { subscription: { include: { plan: true } }, _count: { select: { users: true, memberships: true, records: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createAccount(actor: AuthUser, dto: CreateAccountDto) {
    if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can create platform accounts directly.");
    const account = await this.prisma.account.create({
      data: {
        name: dto.name.trim(),
        email: dto.email?.toLowerCase().trim() || null,
        phone: dto.phone?.trim() || null,
        country: dto.country || "GH",
        currency: dto.currency || "GHS",
      },
    });

    this.realtime.emitAccountDataChanged({
      accountId: account.id,
      changedTables: ["accounts"],
      metadata: { action: "account-created" },
    });

    return account;
  }

  async getAccount(actor: AuthUser, accountId?: string) {
    const id = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, id);
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        users: { select: { id: true, fullName: true, email: true, phone: true, role: true, active: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        invoices: { orderBy: { createdAt: "desc" }, take: 10 },
        payments: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!account) throw new NotFoundException("Account not found");
    return account;
  }

  async updateAccount(actor: AuthUser, accountId: string, dto: UpdateAccountDto) {
    assertSameAccountOrDeveloper(actor, accountId);
    if (dto.status && !isDeveloper(actor.role)) {
      throw new ForbiddenException("Only developer can change account status.");
    }
    const account = await this.prisma.account.update({ where: { id: accountId }, data: dto });
    this.realtime.emitAccountDataChanged({
      accountId,
      changedTables: ["accounts"],
      metadata: { action: "account-updated" },
    });
    return account;
  }

  async closeAccount(actor: AuthUser, accountId: string) {
    if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can close platform accounts.");
    const account = await this.prisma.account.update({ where: { id: accountId }, data: { status: "closed" } });
    this.realtime.emitAccountDataChanged({
      accountId,
      changedTables: ["accounts"],
      metadata: { action: "account-closed" },
    });
    return account;
  }

  async getUsers(
    actor: AuthUser,
    accountId?: string,
    filters?: {
      schoolId?: string;
      branchId?: string;
    },
  ) {
    const id = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, id);

    const schoolId = filters?.schoolId?.trim() || undefined;
    const branchId = filters?.branchId?.trim() || undefined;
    const actorRole = this.normalizedActorRole(actor.role);

    /*
     * Branch administrators must always be constrained to one of their active
     * branch-admin memberships. Query parameters are treated as requested
     * scope, never as authority.
     */
    if (actorRole === "branch_admin") {
      if (!schoolId || !branchId) {
        throw new BadRequestException(
          "schoolId and branchId are required for branch-scoped user listing.",
        );
      }

      const branchAccess = await this.prisma.userMembership.findFirst({
        where: {
          accountId: id,
          userId: actor.id,
          role: "branch_admin",
          schoolId,
          branchId,
          active: true,
          status: "active",
        },
        select: { id: true },
      });

      if (!branchAccess) {
        throw new ForbiddenException(
          "You cannot view users for this branch.",
        );
      }
    }

    const membershipWhere = {
      accountId: id,
      ...(schoolId ? { schoolId } : {}),
      ...(branchId ? { branchId } : {}),
    };

    return this.prisma.appUser.findMany({
      where: {
        accountId: id,
        ...(schoolId || branchId
          ? {
              memberships: {
                some: membershipWhere,
              },
            }
          : {}),
      },
      select: {
        id: true,
        accountId: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: membershipWhere,
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createUser(actor: AuthUser, dto: CreateAccountUserDto, accountId?: string) {
    this.assertCanCreateUsers(actor.role);
    const targetAccountId = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, targetAccountId);

    const role = normalizeRole(dto.role);
    if (!role) throw new BadRequestException("Invalid role.");

    const actorRole = this.normalizedActorRole(actor.role);

    if (actorRole === "branch_admin") {
      if (!BRANCH_ASSIGNABLE_ROLES.has(role)) {
        throw new ForbiddenException(
          "Branch administrators can only create accountant, teacher, student, and parent users.",
        );
      }

      if (!dto.schoolId || !dto.branchId) {
        throw new BadRequestException(
          "School and branch are required for branch-created users.",
        );
      }

      const branchAccess = await this.prisma.userMembership.findFirst({
        where: {
          accountId: targetAccountId,
          userId: actor.id,
          role: "branch_admin",
          schoolId: dto.schoolId,
          branchId: dto.branchId,
          active: true,
          status: "active",
        },
        select: { id: true },
      });

      if (!branchAccess) {
        throw new ForbiddenException(
          "You cannot create users for this branch.",
        );
      }
    }
    if ((role === "developer" || role === "platform_team") && !isDeveloper(actor.role)) throw new ForbiddenException("Only developer can create developer users.");
    if (role === "super_admin" || role === "owner") this.assertCanManageOwnerOnly(actor.role);
    const canonicalRole = role === "admin" ? "school_admin" : role;

    if (
      !["developer", "platform_team", "owner", "super_admin"].includes(
        canonicalRole,
      ) &&
      (!dto.schoolId || !dto.branchId)
    ) {
      throw new BadRequestException(
        "School and branch are required for this role.",
      );
    }

    if (canonicalRole === "teacher" && !dto.teacherId) {
      throw new BadRequestException(
        "teacherId is required for a teacher user.",
      );
    }

    if (canonicalRole === "student" && !dto.studentId) {
      throw new BadRequestException(
        "studentId is required for a student user.",
      );
    }

    if (canonicalRole === "parent" && !dto.parentId) {
      throw new BadRequestException(
        "parentId is required for a parent user.",
      );
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.appUser.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("This email is already registered.");
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: { accountId: targetAccountId, fullName: dto.fullName.trim(), email, phone: dto.phone?.trim() || null, passwordHash, role: canonicalRole, active: true },
      });
      await tx.userMembership.create({
        data: {
          accountId: targetAccountId,
          userId: user.id,
          role: canonicalRole,
          schoolId: dto.schoolId ?? null,
          branchId: dto.branchId ?? null,
          teacherId: dto.teacherId ?? null,
          studentId: dto.studentId ?? null,
          parentId: dto.parentId ?? null,
          scopeKey: buildMembershipScopeKey({
            accountId: targetAccountId,
            role: canonicalRole,
            schoolId: dto.schoolId,
            branchId: dto.branchId,
            teacherId: dto.teacherId,
            studentId: dto.studentId,
            parentId: dto.parentId,
          }),
          active: true,
        },
      });
      return tx.appUser.findUnique({ where: { id: user.id }, select: { id: true, accountId: true, fullName: true, email: true, phone: true, role: true, active: true, createdAt: true, updatedAt: true, memberships: true } });
    });

    if (created?.id) {
      this.realtime.emitMembershipsChanged({
        accountId: targetAccountId,
        userId: created.id,
        action: "created",
        active: created.active !== false,
        metadata: {
          operation: "user-created",
        },
      });
    }

    return created;
  }

  async updateUser(actor: AuthUser, userId: string, dto: UpdateAccountUserDto) {
    this.assertCanManageAccountUsers(actor.role);
    const existing = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);
    if ([dto.role, existing.role].includes("developer") || [dto.role, existing.role].includes("platform_team")) { if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can manage platform users."); }
    if ([dto.role, existing.role].includes("super_admin") || [dto.role, existing.role].includes("owner")) this.assertCanManageOwnerOnly(actor.role);
    const user = await this.prisma.appUser.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName?.trim(),
        phone: dto.phone?.trim(),
        role:
          dto.role !== undefined
            ? this.normalizedActorRole(dto.role)
            : undefined,
      },
      select: { id: true, accountId: true, fullName: true, email: true, phone: true, role: true, active: true, lastLoginAt: true, createdAt: true, updatedAt: true, memberships: true },
    });

    this.realtime.emitMembershipsChanged({
      accountId: existing.accountId,
      userId: user.id,
      action: "updated",
      active: user.active !== false,
      metadata: {
        operation: "user-updated",
      },
    });

    return user;
  }

  async updateUserStatus(actor: AuthUser, userId: string, dto: UpdateAccountUserStatusDto) {
    this.assertCanManageAccountUsers(actor.role);
    const existing = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);
    if ((existing.role === "developer" || existing.role === "platform_team") && !isDeveloper(actor.role)) throw new ForbiddenException("Only developer can manage platform users.");
    if (existing.role === "super_admin" || existing.role === "owner") this.assertCanManageOwnerOnly(actor.role);
    if (existing.id === actor.id && dto.active === false) throw new BadRequestException("You cannot deactivate your own login.");
    const user = await this.prisma.appUser.update({ where: { id: userId }, data: { active: dto.active }, select: { id: true, active: true, role: true, email: true } });
    this.realtime.emitMembershipsChanged({
      accountId: existing.accountId,
      userId: user.id,
      action: dto.active ? "activated" : "deactivated",
      active: user.active !== false,
      metadata: {
        operation: dto.active
          ? "user-activated"
          : "user-deactivated",
      },
    });
    return user;
  }

  async deleteUser(actor: AuthUser, userId: string) {
    return this.updateUserStatus(actor, userId, { active: false });
  }

  async getOwnerRecords(accountId: string, tableName: "schools" | "branches") {
  const records = await this.prisma.syncRecord.findMany({
    where: {
      accountId,
      tableName,
      isDeleted: false,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return records.map((record) => ({
    id: record.id,
    localId: record.localId,
    cloudId: record.cloudId,
    ...((record.payload as any) || {}),
  }));
}

async createOwnerRecord(
  accountId: string,
  tableName: "schools" | "branches",
  body: any
) {
  const now = Date.now();

  const record = await this.prisma.syncRecord.create({
    data: {
      accountId,
      tableName,
      localId:
        body.id !== undefined && body.id !== null
          ? String(body.id)
          : undefined,
      cloudId: body.cloudId,
      deviceId: body.deviceId || "owner-web",
      version: 1,
      updatedAt: BigInt(now),
      isDeleted: false,
      payload: {
        ...body,
        accountId,
        updatedAt: now,
        version: 1,
        isDeleted: false,
      },
    },
  });

  this.realtime.emitAccountDataChanged({
    accountId,
    changedTables: [tableName],
    sourceDeviceId: body.deviceId || "owner-web",
    metadata: { action: "owner-record-created", recordId: record.id },
  });

  return record;
}

async updateOwnerRecord(accountId: string, id: string, body: any) {
  const existing = await this.prisma.syncRecord.findFirst({
    where: { id, accountId },
  });

  if (!existing) {
    throw new NotFoundException("Record not found.");
  }

  const now = Date.now();

  const record = await this.prisma.syncRecord.update({
    where: { id },
    data: {
      version: existing.version + 1,
      updatedAt: BigInt(now),
      payload: {
        ...((existing.payload as any) || {}),
        ...body,
        accountId,
        updatedAt: now,
        version: existing.version + 1,
      },
    },
  });

  this.realtime.emitAccountDataChanged({
    accountId,
    changedTables: [existing.tableName],
    sourceDeviceId: body.deviceId,
    metadata: { action: "owner-record-updated", recordId: id },
  });

  return record;
}

async deleteOwnerRecord(accountId: string, id: string) {
  const existing = await this.prisma.syncRecord.findFirst({
    where: { id, accountId },
  });

  if (!existing) {
    throw new NotFoundException("Record not found.");
  }

  const record = await this.prisma.syncRecord.update({
    where: { id },
    data: {
      isDeleted: true,
      version: existing.version + 1,
      updatedAt: BigInt(Date.now()),
    },
  });

  this.realtime.emitAccountDataChanged({
    accountId,
    changedTables: [existing.tableName],
    metadata: { action: "owner-record-deleted", recordId: id },
  });

  return record;
}
}
