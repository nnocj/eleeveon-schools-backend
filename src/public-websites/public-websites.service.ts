import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import type {
  PublicWebsiteBranch,
  PublicWebsiteDataset,
  PublicWebsiteItem,
  PublicWebsiteMedia,
  PublicWebsiteNavigationLink,
  PublicWebsitePerson,
  PublicWebsiteSection,
} from "./public-websites.types";

type AnyRow = Record<string, any>;

const text = (value: unknown) =>
  String(value ?? "").trim();

const slugPattern =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

@Injectable()
export class PublicWebsitesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private payload(record: AnyRow): AnyRow {
    const stored =
      record?.payload &&
      typeof record.payload === "object"
        ? record.payload
        : {};

    return {
      ...stored,
      id: text(
        stored.id ||
          record.localId ||
          record.id,
      ),
    };
  }

  private usable(record: AnyRow) {
    const row = this.payload(record);

    return (
      record &&
      !record.isDeleted &&
      row.isDeleted !== true &&
      row.active !== false
    );
  }

  private async readTable(
    accountId: string,
    tableName: string,
  ): Promise<AnyRow[]> {
    const records =
      await this.prisma.syncRecord.findMany({
        where: {
          accountId,
          tableName,
          isDeleted: false,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

    return records
      .filter((record) =>
        this.usable(record),
      )
      .map((record) =>
        this.payload(record),
      );
  }

  private publicMedia(
    row?: AnyRow,
  ): PublicWebsiteMedia | undefined {
    if (!row) return undefined;

    let url = text(
      row.publicUrl ||
        row.remoteUrl ||
        row.storageUrl ||
        row.cdnUrl,
    );

    if (!url) return undefined;

    const publicApiUrl = text(
      process.env.PUBLIC_API_URL ||
        process.env.BACKEND_PUBLIC_URL ||
        process.env.RENDER_EXTERNAL_URL,
    ).replace(/\/$/, "");

    if (
      publicApiUrl &&
      /^https?:\/\/localhost(?::\d+)?/i.test(
        url,
      )
    ) {
      url = url.replace(
        /^https?:\/\/localhost(?::\d+)?/i,
        publicApiUrl,
      );
    }

    return {
      id: text(row.id) || undefined,
      url,
      alt:
        text(
          row.altText ||
            row.fileName ||
            row.originalFileName,
        ) || undefined,
      width: Number(row.width) || undefined,
      height:
        Number(row.height) || undefined,
      metadata:
        row.metadata &&
        typeof row.metadata === "object"
          ? row.metadata
          : undefined,
    };
  }

  async findPublishedBySlug(
    input: string,
  ): Promise<PublicWebsiteDataset | null> {
    const slug = text(input).toLowerCase();

    if (!slugPattern.test(slug)) {
      return null;
    }

    const settingRecords =
      await this.prisma.syncRecord.findMany({
        where: {
          tableName: "websiteSettings",
          isDeleted: false,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

    const settingRecord =
      settingRecords.find((record) => {
        if (!this.usable(record)) {
          return false;
        }

        const row = this.payload(record);

        return (
          text(row.eleeveonSlug).toLowerCase() ===
            slug &&
          text(row.status).toLowerCase() ===
            "published"
        );
      });

    if (!settingRecord) {
      return null;
    }

    const setting =
      this.payload(settingRecord);

    const accountId =
      settingRecord.accountId;

    const schoolId = text(
      setting.schoolId,
    );

    const branchId = text(
      setting.branchId,
    );

    const websiteId = text(
      setting.id ||
        settingRecord.localId ||
        settingRecord.id,
    );

    if (
      !accountId ||
      !schoolId ||
      !websiteId
    ) {
      return null;
    }

    const tableNames = [
      "schools",
      "branches",
      "teachers",
      "students",
      "classes",
      "academicStructures",
      "organizations",
      "programs",
      "subjects",
      "announcements",
      "calendarEvents",
      "portalHighlights",
      "mediaAssets",
      "websitePages",
      "websiteSections",
      "websiteNavigationItems",
    ];

    const entries = await Promise.all(
      tableNames.map(
        async (tableName) =>
          [
            tableName,
            await this.readTable(
              accountId,
              tableName,
            ),
          ] as const,
      ),
    );

    const all = Object.fromEntries(
      entries,
    ) as Record<string, AnyRow[]>;

    const scoped = (
      tableName: string,
      strictBranch = false,
    ) =>
      (all[tableName] || []).filter(
        (row) => {
          const rowSchoolId = text(
            row.schoolId ||
              (tableName === "schools"
                ? row.id
                : ""),
          );

          if (rowSchoolId !== schoolId) {
            return false;
          }

          if (
            strictBranch &&
            branchId &&
            text(row.branchId) &&
            text(row.branchId) !== branchId
          ) {
            return false;
          }

          return true;
        },
      );

    const mediaRows =
      scoped("mediaAssets", true);

    const mediaById = (id: unknown) =>
      this.publicMedia(
        mediaRows.find(
          (row) =>
            text(row.id) === text(id),
        ),
      );

    const school =
      scoped("schools").find(
        (row) =>
          text(row.id) === schoolId,
      ) || {};

    const branchRows =
      scoped("branches", false);

    const branch =
      branchRows.find(
        (row) =>
          text(row.id) === branchId,
      );

    const mapBranch = (
      row: AnyRow,
    ): PublicWebsiteBranch => ({
      id: text(row.id) || undefined,
      name: text(row.name) || "Branch",
      code: text(row.code) || undefined,
      email: text(row.email) || undefined,
      phone: text(row.phone) || undefined,
      website:
        text(row.website) || undefined,
      address:
        text(
          row.address ||
            row.formattedAddress,
        ) || undefined,
      location:
        text(
          row.location ||
            row.locationLabel,
        ) || undefined,
      city: text(row.city) || undefined,
      logo: mediaById(row.logoMediaId),
      banner: mediaById(
        row.bannerImageMediaId,
      ),
    });

    const mapItem = (
      row: AnyRow,
    ): PublicWebsiteItem => ({
      id: text(row.id) || undefined,
      title:
        text(
          row.title ||
            row.name ||
            row.subjectName ||
            row.programName,
        ) || "Untitled",
      subtitle:
        text(
          row.subtitle ||
            row.code ||
            row.category,
        ) || undefined,
      body:
        text(
          row.body ||
            row.content ||
            row.description ||
            row.message ||
            row.summary,
        ) || undefined,
      slug: text(row.slug) || undefined,
      startsAt:
        Number(
          row.startAt ||
            row.startsAt ||
            row.eventDate,
        ) || undefined,
      endsAt:
        Number(
          row.endAt || row.endsAt,
        ) || undefined,
      media: mediaById(
        row.mediaAssetId ||
          row.imageMediaId ||
          row.photoMediaId,
      ),
    });

    const mapPerson = (
      row: AnyRow,
    ): PublicWebsitePerson => ({
      id: text(row.id) || undefined,
      name:
        text(
          row.fullName ||
            row.name ||
            row.displayName,
        ) || "Staff member",
      title:
        text(
          row.jobTitle ||
            row.title ||
            row.designation ||
            row.position,
        ) || undefined,
      role:
        text(
          row.role || row.staffType,
        ) || undefined,
      bio:
        text(
          row.bio ||
            row.biography ||
            row.description,
        ) || undefined,
      email:
        text(
          row.publicEmail || row.email,
        ) || undefined,
      phone:
        text(
          row.publicPhone || row.phone,
        ) || undefined,
      photo: mediaById(
        row.photoMediaId ||
          row.profilePhotoMediaId ||
          row.imageMediaId,
      ),
    });

    const teachers = scoped(
      "teachers",
      true,
    )
      .filter(
        (row) =>
          row.websiteVisible !== false,
      )
      .map(mapPerson);

    const principal =
      teachers.find((person) =>
        /head|principal|director/i.test(
          `${person.title || ""} ${
            person.role || ""
          }`,
        ),
      );

    const programs = scoped(
      "programs",
      true,
    )
      .filter(
        (row) =>
          row.websiteVisible !== false,
      )
      .map(mapItem);

    const subjects = scoped(
      "subjects",
      true,
    )
      .filter(
        (row) =>
          row.websiteVisible !== false,
      )
      .map(mapItem);

    const organizations = scoped(
      "organizations",
      true,
    )
      .filter(
        (row) =>
          row.websiteVisible !== false,
      )
      .map(mapItem);

    const academicStructures = scoped(
      "academicStructures",
      true,
    )
      .filter(
        (row) =>
          row.websiteVisible !== false,
      )
      .map(mapItem);

    const classes = scoped(
      "classes",
      true,
    )
      .filter(
        (row) =>
          row.websiteVisible !== false,
      )
      .map(mapItem);

    const highlights = scoped(
      "portalHighlights",
      true,
    )
      .filter(
        (row) =>
          row.websiteVisible !== false &&
          ![
            "draft",
            "archived",
            "expired",
          ].includes(
            text(row.status).toLowerCase(),
          ),
      )
      .map(mapItem);

    const announcements = scoped(
      "announcements",
      true,
    )
      .filter(
        (row) =>
          row.websiteVisible !== false &&
          row.published !== false &&
          text(row.status).toLowerCase() !==
            "draft",
      )
      .map(mapItem);

    const events = scoped(
      "calendarEvents",
      true,
    )
      .filter(
        (row) =>
          row.websiteVisible !== false &&
          row.public !== false,
      )
      .map(mapItem);

    const pages = scoped(
      "websitePages",
      true,
    )
      .filter(
        (row) =>
          text(row.websiteSettingId) ===
            websiteId &&
          text(row.status).toLowerCase() ===
            "published",
      )
      .sort(
        (a, b) =>
          Number(a.displayOrder || 0) -
          Number(b.displayOrder || 0),
      );

    const sectionRows = scoped(
      "websiteSections",
      true,
    )
      .filter(
        (row) =>
          text(row.websiteSettingId) ===
            websiteId &&
          text(row.status).toLowerCase() ===
            "published" &&
          row.active !== false,
      )
      .sort(
        (a, b) =>
          Number(a.displayOrder || 0) -
          Number(b.displayOrder || 0),
      );

    const pools: Record<
      string,
      PublicWebsiteItem[]
    > = {
      programs,
      programmes: programs,
      subjects,
      organizations,
      organisations: organizations,
      academic_structures:
        academicStructures,
      classes,
      portal_highlights: highlights,
      highlights,
      announcements,
      news: announcements,
      calendar_events: events,
      events,
    };

    const sectionsFor = (
      pageId: string,
    ): PublicWebsiteSection[] =>
      sectionRows
        .filter(
          (row) =>
            text(row.pageId) === pageId,
        )
        .map((row) => {
          const source = text(
            row.sourceType,
          ).toLowerCase();

          const sourceItems =
            pools[source] || [];

          const limit = Math.max(
            0,
            Number(
              row.sourceFilters?.limit || 0,
            ),
          );

          return {
            id: text(row.id) || undefined,
            sectionKey:
              text(
                row.sectionKey || row.id,
              ) || "content",
            sectionType:
              text(row.sectionType) ||
              "content",
            variant:
              text(row.variant) || undefined,
            heading:
              text(row.heading) || undefined,
            subheading:
              text(row.subheading) ||
              undefined,
            body:
              text(row.body) || undefined,
            sourceType:
              text(row.sourceType) ||
              undefined,
            sourceFilters:
              row.sourceFilters || undefined,
            content:
              row.content || undefined,
            settings:
              row.settings || undefined,
            items: limit
              ? sourceItems.slice(0, limit)
              : sourceItems,
            primaryMedia: mediaById(
              row.primaryMediaAssetId,
            ),
            backgroundMedia: mediaById(
              row.backgroundMediaAssetId,
            ),
            media: Array.isArray(
              row.mediaAssetIds,
            )
              ? row.mediaAssetIds
                  .map(mediaById)
                  .filter(
                    (
                      value,
                    ): value is PublicWebsiteMedia =>
                      Boolean(value),
                  )
              : [],
          };
        });

    const sections = pages.flatMap(
      (page) =>
        sectionsFor(text(page.id)),
    );

    const pageById = new Map(
      pages.map((page) => [
        text(page.id),
        page,
      ]),
    );

    const navigationHref = (
      row: AnyRow,
    ) => {
      if (
        row.targetType ===
        "external_url"
      ) {
        return text(row.url) || "#";
      }

      if (
        row.targetType ===
        "portal_login"
      ) {
        return (
          text(row.url) ||
          "https://schools.eleeveon.com"
        );
      }

      if (
        row.targetType === "section"
      ) {
        const target =
          sectionRows.find(
            (section) =>
              text(section.id) ===
              text(row.sectionId),
          );

        return `#${text(
          target?.sectionKey ||
            row.sectionId,
        )}`;
      }

      const targetPage =
        pageById.get(
          text(row.pageId),
        );

      if (
        targetPage &&
        !["", "home", "index"].includes(
          text(
            targetPage.slug,
          ).toLowerCase(),
        )
      ) {
        return `/${text(
          targetPage.slug,
        )}`;
      }

      return "/";
    };

    const navigationRows = scoped(
      "websiteNavigationItems",
      true,
    )
      .filter(
        (row) =>
          text(row.websiteSettingId) ===
            websiteId &&
          row.active !== false,
      )
      .sort(
        (a, b) =>
          Number(a.displayOrder || 0) -
          Number(b.displayOrder || 0),
      );

    const navigation =
      navigationRows.map(
        (
          row,
        ): PublicWebsiteNavigationLink => ({
          id: text(row.id) || undefined,
          label:
            text(row.label) || "Link",
          href: navigationHref(row),
          location:
            text(row.location) || "header",
          openInNewTab: Boolean(
            row.openInNewTab,
          ),
        }),
      );

    const headerNavigation =
      navigation.filter(
        (row) =>
          row.location !== "footer",
      );

    const footerNavigation =
      navigation.filter(
        (row) =>
          row.location === "footer",
      );

    const gallery = mediaRows
      .filter(
        (row) =>
          row.websiteVisible === true ||
          row.metadata?.websiteVisible ===
            true ||
          /gallery/i.test(
            `${row.ownerTable || ""} ${
              row.fieldKey || ""
            }`,
          ),
      )
      .map((row) =>
        this.publicMedia(row),
      )
      .filter(
        (
          value,
        ): value is PublicWebsiteMedia =>
          Boolean(value),
      )
      .slice(0, 30);

    const activeStudents = scoped(
      "students",
      true,
    ).filter(
      (row) =>
        ![
          "withdrawn",
          "transferred",
        ].includes(
          text(row.status).toLowerCase(),
        ),
    );

    return {
      accountId,
      schoolId,
      branchId:
        branchId || undefined,
      websiteSettingId: websiteId,

      website: {
        id: websiteId,
        slug,
        status: "published",
        templateKey:
          text(setting.templateKey) ||
          "modern_academy",
        templateVersion:
          text(setting.templateVersion) ||
          "2.0.0",
        siteName:
          text(setting.siteName) ||
          undefined,
        tagline:
          text(setting.tagline) ||
          undefined,
        description:
          text(setting.description) ||
          undefined,
        seoTitle:
          text(setting.seoTitle) ||
          undefined,
        seoDescription:
          text(setting.seoDescription) ||
          undefined,
        publishedAt:
          setting.publishedAt || null,
      },

      school: {
        id: text(school.id) || undefined,
        name:
          text(school.name) ||
          text(setting.siteName) ||
          "School",
        motto:
          text(school.motto) ||
          undefined,
        description:
          text(
            school.description ||
              school.about,
          ) || undefined,
        email:
          text(school.email) ||
          undefined,
        phone:
          text(school.phone) ||
          undefined,
        website:
          text(school.website) ||
          undefined,
        address:
          text(
            school.address ||
              school.formattedAddress,
          ) || undefined,
        location:
          text(
            school.location ||
              school.locationLabel,
          ) || undefined,
        logo: mediaById(
          school.logoMediaId,
        ),
        banner: mediaById(
          school.bannerImageMediaId,
        ),
      },

      branch: branch
        ? mapBranch(branch)
        : undefined,

      branches:
        branchRows.map(mapBranch),

      principal,
      teachers,

      academicStructures,
      classes,
      programs,
      subjects,
      organizations,

      highlights,
      announcements,
      events,
      gallery,

      statistics: {
        students:
          activeStudents.length,
        teachers: teachers.length,
        classes: classes.length,
        subjects: subjects.length,
        programs: programs.length,
        organizations:
          organizations.length,
        academicStructures:
          academicStructures.length,
        galleryImages:
          gallery.length,
        announcements:
          announcements.length,
        events: events.length,
      },

      navigation:
        headerNavigation,
      headerNavigation,
      footerNavigation,

      sections,
      generatedAt: Date.now(),
    };
  }
}
