/**
 * backend/src/public-websites/public-websites.types.ts
 * --------------------------------------------------------------------------
 * Backend mirror of the frontend WebsiteDataset contract.
 */

export type PublicWebsiteStatus =
  | "draft"
  | "published"
  | "unpublished"
  | "archived";

export type PublicWebsiteMedia = {
  id?: string;
  url?: string;
  alt?: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
};

export type PublicWebsiteIdentity = {
  id?: string;
  slug: string;
  status: PublicWebsiteStatus;
  templateKey: string;
  templateVersion?: string;
  siteName?: string;
  tagline?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  publishedAt?: number | string | null;
};

export type PublicWebsiteSchool = {
  id?: string;
  name: string;
  motto?: string;
  description?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  location?: string;
  logo?: PublicWebsiteMedia;
  banner?: PublicWebsiteMedia;
};

export type PublicWebsiteBranch = {
  id?: string;
  name: string;
  code?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  location?: string;
  city?: string;
  logo?: PublicWebsiteMedia;
  banner?: PublicWebsiteMedia;
};

export type PublicWebsitePerson = {
  id?: string;
  name: string;
  title?: string;
  role?: string;
  bio?: string;
  email?: string;
  phone?: string;
  photo?: PublicWebsiteMedia;
};

export type PublicWebsiteItem = {
  id?: string;
  title: string;
  subtitle?: string;
  body?: string;
  slug?: string;
  startsAt?: number;
  endsAt?: number;
  media?: PublicWebsiteMedia;
};

export type PublicWebsiteNavigationLink = {
  id?: string;
  label: string;
  href: string;
  location?: string;
  openInNewTab?: boolean;
  children?: PublicWebsiteNavigationLink[];
};

export type PublicWebsiteSection = {
  id?: string;
  sectionKey: string;
  sectionType: string;
  variant?: string;
  heading?: string;
  subheading?: string;
  body?: string;
  sourceType?: string;
  sourceFilters?: Record<string, unknown>;
  content?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  items?: PublicWebsiteItem[];
  primaryMedia?: PublicWebsiteMedia;
  backgroundMedia?: PublicWebsiteMedia;
  media?: PublicWebsiteMedia[];
};

export type PublicWebsiteStatistics = {
  students: number;
  teachers: number;
  classes: number;
  subjects: number;
  programs: number;
  organizations: number;
  academicStructures: number;
  galleryImages: number;
  announcements: number;
  events: number;
};

export type PublicWebsiteDataset = {
  accountId?: string;
  schoolId?: string;
  branchId?: string;
  websiteSettingId?: string;

  website: PublicWebsiteIdentity;

  school: PublicWebsiteSchool;
  branch?: PublicWebsiteBranch;
  branches: PublicWebsiteBranch[];

  principal?: PublicWebsitePerson;
  teachers: PublicWebsitePerson[];

  academicStructures: PublicWebsiteItem[];
  classes: PublicWebsiteItem[];
  programs: PublicWebsiteItem[];
  subjects: PublicWebsiteItem[];
  organizations: PublicWebsiteItem[];

  highlights: PublicWebsiteItem[];
  announcements: PublicWebsiteItem[];
  events: PublicWebsiteItem[];
  gallery: PublicWebsiteMedia[];

  statistics: PublicWebsiteStatistics;

  navigation: PublicWebsiteNavigationLink[];
  headerNavigation: PublicWebsiteNavigationLink[];
  footerNavigation: PublicWebsiteNavigationLink[];

  sections: PublicWebsiteSection[];
  generatedAt: number;
};
