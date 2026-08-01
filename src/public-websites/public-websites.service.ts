import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type AnyRow = Record<string, any>;
const text = (value: unknown) => String(value ?? "").trim();
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

@Injectable()
export class PublicWebsitesService {
  constructor(private readonly prisma: PrismaService) {}

  private payload(record: AnyRow): AnyRow {
    const stored = record?.payload && typeof record.payload === "object" ? record.payload : {};
    return { ...stored, id: text(stored.id || record.localId || record.id) };
  }

  private usable(record: AnyRow) {
    const row = this.payload(record);
    return record && !record.isDeleted && row.isDeleted !== true && row.active !== false;
  }

  private async readTable(accountId: string, tableName: string): Promise<AnyRow[]> {
    const records = await this.prisma.syncRecord.findMany({
      where: { accountId, tableName, isDeleted: false },
      orderBy: { updatedAt: "desc" },
    });
    return records.filter((record) => this.usable(record)).map((record) => this.payload(record));
  }

  private publicMedia(row?: AnyRow) {
    if (!row) return undefined;
    let url = text(row.publicUrl || row.remoteUrl || row.storageUrl || row.cdnUrl);
    if (!url) return undefined;

    const publicApiUrl = text(
      process.env.PUBLIC_API_URL ||
        process.env.BACKEND_PUBLIC_URL ||
        process.env.RENDER_EXTERNAL_URL,
    ).replace(/\/$/, "");

    if (publicApiUrl && /^https?:\/\/localhost(?::\d+)?/i.test(url)) {
      url = url.replace(/^https?:\/\/localhost(?::\d+)?/i, publicApiUrl);
    }

    return {
      id: text(row.id) || undefined,
      url,
      alt: text(row.altText || row.fileName || row.originalFileName) || undefined,
      width: Number(row.width) || undefined,
      height: Number(row.height) || undefined,
    };
  }

  async findPublishedBySlug(input: string) {
    const slug = text(input).toLowerCase();
    if (!slugPattern.test(slug)) return null;

    const settingRecords = await this.prisma.syncRecord.findMany({
      where: { tableName: "websiteSettings", isDeleted: false },
      orderBy: { updatedAt: "desc" },
    });

    const settingRecord = settingRecords.find((record) => {
      if (!this.usable(record)) return false;
      const row = this.payload(record);
      return text(row.eleeveonSlug).toLowerCase() === slug && text(row.status).toLowerCase() === "published";
    });
    if (!settingRecord) return null;

    const setting = this.payload(settingRecord);
    const accountId = settingRecord.accountId;
    const schoolId = text(setting.schoolId);
    const branchId = text(setting.branchId);
    const websiteId = text(setting.id || settingRecord.localId || settingRecord.id);
    if (!accountId || !schoolId || !websiteId) return null;

    const names = ["schools", "branches", "teachers", "students", "classes", "academicStructures", "organizations", "programs", "subjects", "announcements", "calendarEvents", "portalHighlights", "mediaAssets", "websitePages", "websiteSections", "websiteNavigationItems"];
    const entries = await Promise.all(names.map(async (name) => [name, await this.readTable(accountId, name)] as const));
    const all = Object.fromEntries(entries) as Record<string, AnyRow[]>;

    const scoped = (name: string, strictBranch = false) => (all[name] || []).filter((row) => text(row.schoolId || (name === "schools" ? row.id : "")) === schoolId && (!branchId || !strictBranch || !text(row.branchId) || text(row.branchId) === branchId));
    const mediaRows = scoped("mediaAssets");
    const mediaById = (id: unknown) => this.publicMedia(mediaRows.find((row) => text(row.id) === text(id)));

    const school = scoped("schools").find((row) => text(row.id) === schoolId) || {};
    const branch = scoped("branches", true).find((row) => text(row.id) === branchId);
    const item = (row: AnyRow) => ({ id: text(row.id) || undefined, title: text(row.title || row.name || row.subjectName || row.programName) || "Untitled", subtitle: text(row.subtitle || row.code || row.category) || undefined, body: text(row.body || row.content || row.description || row.message || row.summary) || undefined, slug: text(row.slug) || undefined, startsAt: Number(row.startAt || row.startsAt || row.eventDate) || undefined, endsAt: Number(row.endAt || row.endsAt) || undefined, media: mediaById(row.mediaAssetId || row.imageMediaId) });
    const person = (row: AnyRow) => ({ id: text(row.id) || undefined, name: text(row.fullName || row.name || row.displayName) || "Staff member", title: text(row.jobTitle || row.title || row.designation || row.position) || undefined, role: text(row.role || row.staffType) || undefined, bio: text(row.bio || row.biography || row.description) || undefined, email: text(row.publicEmail) || undefined, phone: text(row.publicPhone) || undefined, photo: mediaById(row.photoMediaId || row.profilePhotoMediaId || row.imageMediaId) });

    const teachers = scoped("teachers", true).filter((row) => row.websiteVisible !== false).map(person);
    const principal = teachers.find((person) => /head|principal|director/i.test(`${person.title || ""} ${person.role || ""}`));
    const programs = scoped("programs").filter((row) => row.websiteVisible !== false).map(item);
    const subjects = scoped("subjects").filter((row) => row.websiteVisible !== false).map(item);
    const organizations = scoped("organizations", true)
      .filter((row) => row.websiteVisible !== false && row.active !== false)
      .map(item);
    const academicStructures = scoped("academicStructures", true)
      .filter((row) => row.websiteVisible !== false && row.active !== false)
      .map(item);
    const classes = scoped("classes", true)
      .filter((row) => row.websiteVisible !== false && row.active !== false)
      .map(item);
    const highlights = scoped("portalHighlights", true)
      .filter((row) => row.websiteVisible !== false && row.active !== false && !["draft", "archived", "expired"].includes(text(row.status).toLowerCase()))
      .map(item);
    const announcements = scoped("announcements", true).filter((row) => row.websiteVisible !== false && row.published !== false && row.status !== "draft").map(item);
    const events = scoped("calendarEvents", true).filter((row) => row.websiteVisible !== false && row.public !== false).map(item);

    const pages = scoped("websitePages", true).filter((row) => text(row.websiteSettingId) === websiteId && text(row.status).toLowerCase() === "published").sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
    const sectionRows = scoped("websiteSections", true).filter((row) => text(row.websiteSettingId) === websiteId && text(row.status).toLowerCase() === "published" && row.active !== false).sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
    const pools: Record<string, AnyRow[]> = { programs, programmes: programs, subjects, organizations, organisations: organizations, academic_structures: academicStructures, classes, portal_highlights: highlights, highlights, announcements, news: announcements, calendar_events: events, events };
    const sectionsFor = (pageId: string) => sectionRows.filter((row) => text(row.pageId) === pageId).map((row) => {
      const source = text(row.sourceType).toLowerCase();
      const sourceItems = pools[source] || [];
      const limit = Math.max(0, Number(row.sourceFilters?.limit || 0));
      return { id: text(row.id) || undefined, sectionKey: text(row.sectionKey || row.id), sectionType: text(row.sectionType || "content"), variant: text(row.variant) || undefined, heading: text(row.heading) || undefined, subheading: text(row.subheading) || undefined, body: text(row.body) || undefined, content: row.content || {}, settings: row.settings || {}, items: limit ? sourceItems.slice(0, limit) : sourceItems, primaryMedia: mediaById(row.primaryMediaAssetId), backgroundMedia: mediaById(row.backgroundMediaAssetId), media: Array.isArray(row.mediaAssetIds) ? row.mediaAssetIds.map(mediaById).filter(Boolean) : [] };
    });

    const pageById = new Map(pages.map((page) => [text(page.id), page]));
    const navigation = scoped("websiteNavigationItems", true).filter((row) => text(row.websiteSettingId) === websiteId && row.active !== false && text(row.location || "header") !== "footer").sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0)).map((row) => {
      const targetPage = pageById.get(text(row.pageId));
      let href = "/";
      if (row.targetType === "external_url") href = text(row.url) || "#";
      else if (row.targetType === "portal_login") href = text(row.url) || "https://schools.eleeveon.com";
      else if (row.targetType === "section") href = `#${text(row.sectionId)}`;
      else if (targetPage && !["", "home", "index"].includes(text(targetPage.slug).toLowerCase())) href = `/${text(targetPage.slug)}`;
      return { id: text(row.id) || undefined, label: text(row.label) || "Link", href, openInNewTab: Boolean(row.openInNewTab) };
    });

    const gallery = mediaRows.filter((row) => row.metadata?.websiteVisible !== false).map((row) => this.publicMedia(row)).filter(Boolean).slice(0, 30);

    return {
      website: { id: websiteId, slug, status: "published", templateKey: text(setting.templateKey) || "modern_academy", siteName: text(setting.siteName) || undefined, tagline: text(setting.tagline) || undefined, description: text(setting.description) || undefined, seoTitle: text(setting.seoTitle) || undefined, seoDescription: text(setting.seoDescription) || undefined, publishedAt: setting.publishedAt || null },
      school: { id: text(school.id) || undefined, name: text(school.name) || text(setting.siteName) || "School", motto: text(school.motto) || undefined, description: text(school.description || school.about) || undefined, email: text(school.email) || undefined, phone: text(school.phone) || undefined, address: text(school.address || school.formattedAddress) || undefined, location: text(school.location || school.locationLabel) || undefined, logo: mediaById(school.logoMediaId), banner: mediaById(school.bannerImageMediaId) },
      branch: branch ? { id: text(branch.id) || undefined, name: text(branch.name) || "Branch", code: text(branch.code) || undefined, email: text(branch.email) || undefined, phone: text(branch.phone) || undefined, address: text(branch.address || branch.formattedAddress) || undefined, location: text(branch.location || branch.locationLabel) || undefined, city: text(branch.city) || undefined, logo: mediaById(branch.logoMediaId), banner: mediaById(branch.bannerImageMediaId) } : undefined,
      principal,
      teachers,
      programs,
      subjects,
      organizations,
      academicStructures,
      classes,
      highlights,
      announcements,
      events,
      stats: {
        students: scoped("students", true).filter((row) => row.status !== "withdrawn" && row.status !== "transferred").length,
        teachers: teachers.length,
        classes: classes.length,
        subjects: subjects.length,
        programs: programs.length,
      },
      gallery,
      navigation,
      pages: pages.map((page) => ({ id: text(page.id), slug: text(page.slug) || "home", title: text(page.title || page.name) || "Page", description: text(page.description) || undefined, pageType: text(page.pageType) || undefined, sections: sectionsFor(text(page.id)) })),
      theme: { primaryColor: text(setting.primaryColor) || "#2f6fed", secondaryColor: text(setting.secondaryColor) || undefined, accentColor: text(setting.accentColor) || undefined, fontFamily: text(setting.fontFamily) || undefined },
      generatedAt: Date.now(),
    };
  }
}
