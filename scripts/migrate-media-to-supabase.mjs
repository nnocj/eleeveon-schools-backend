/**
 * scripts/migrate-media-to-supabase.mjs
 *
 * One-time Eleeveon media migration.
 *
 * What it does:
 * 1. Reads active mediaAssets records from Supabase/Postgres SyncRecord.
 * 2. Finds records that still point to the old Render /media/files/... URL.
 * 3. Derives the existing storage key: <accountId>/<filename>.
 * 4. Skips objects already present in Supabase Storage.
 * 5. Downloads the old Render file.
 * 6. Uploads it to Supabase Storage using the SAME storage key.
 * 7. Does NOT modify SyncRecord payloads.
 * 8. Reports missing/dead source files separately.
 *
 * Existing URLs continue to work because the backend /media/files route now
 * checks Supabase first and then falls back to the legacy filesystem.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY || "",
).trim();
const BUCKET = String(
  process.env.SUPABASE_MEDIA_BUCKET || "eleeveon-media",
).trim();

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required.");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_SECRET_KEY is required.");
}

if (!BUCKET) {
  throw new Error("SUPABASE_MEDIA_BUCKET is required.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

function text(value) {
  return String(value ?? "").trim();
}

function firstRemoteUrl(payload) {
  return (
    text(payload?.publicUrl) ||
    text(payload?.remoteUrl) ||
    text(payload?.storageUrl) ||
    text(payload?.downloadUrl)
  );
}

function isLegacyRenderMediaUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);

    return (
      parsed.hostname ===
        "eleeveon-schools-backend.onrender.com" &&
      parsed.pathname.startsWith("/media/files/")
    );
  } catch {
    return false;
  }
}

function storageKeyFromLegacyUrl(url) {
  const parsed = new URL(url);
  const prefix = "/media/files/";

  if (!parsed.pathname.startsWith(prefix)) {
    return "";
  }

  const raw = parsed.pathname.slice(prefix.length);

  return raw
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

function mediaLabel(row) {
  const payload = row?.payload || {};

  return [
    text(payload.ownerTable) || "unknown-owner",
    text(payload.fieldKey) || "unknown-field",
    text(payload.originalFileName) ||
      text(payload.fileName) ||
      row.id,
  ].join(" / ");
}

async function objectAlreadyExists(storageKey) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storageKey);

  if (!error && data) {
    return true;
  }

  const status = Number(
    error?.statusCode ??
      error?.status ??
      0,
  );

  const message = text(error?.message).toLowerCase();

  if (
    status === 404 ||
    message.includes("not found") ||
    message.includes("object not found")
  ) {
    return false;
  }

  throw new Error(
    `Could not check Supabase object ${storageKey}: ${
      error?.message || "unknown storage error"
    }`,
  );
}

async function loadMediaAssets() {
  const { data, error } = await supabase
    .from("SyncRecord")
    .select(
      "id,accountId,tableName,isDeleted,payload",
    )
    .eq("tableName", "mediaAssets")
    .eq("isDeleted", false);

  if (error) {
    throw new Error(
      `Could not read SyncRecord mediaAssets: ${error.message}`,
    );
  }

  return Array.isArray(data) ? data : [];
}

async function main() {
  console.log(`Bucket: ${BUCKET}`);
  console.log("Loading active mediaAssets...");

  const rows = await loadMediaAssets();

  const legacyRows = [];
  const noRemoteRows = [];
  const otherRemoteRows = [];

  for (const row of rows) {
    const payload = row?.payload || {};
    const remoteUrl = firstRemoteUrl(payload);

    if (!remoteUrl) {
      noRemoteRows.push(row);
      continue;
    }

    if (isLegacyRenderMediaUrl(remoteUrl)) {
      legacyRows.push({
        ...row,
        sourceUrl: remoteUrl,
      });
      continue;
    }

    otherRemoteRows.push(row);
  }

  console.log("");
  console.log("Inventory");
  console.log(`  Active mediaAssets:       ${rows.length}`);
  console.log(`  Old Render candidates:    ${legacyRows.length}`);
  console.log(`  No remote URL:            ${noRemoteRows.length}`);
  console.log(`  Other remote URL:         ${otherRemoteRows.length}`);
  console.log("");

  const result = {
    migrated: [],
    alreadyPresent: [],
    sourceMissing: [],
    failed: [],
    noRemote: noRemoteRows.map((row) => ({
      id: row.id,
      label: mediaLabel(row),
    })),
  };

  for (let index = 0; index < legacyRows.length; index += 1) {
    const row = legacyRows[index];
    const label = mediaLabel(row);
    const storageKey =
      storageKeyFromLegacyUrl(row.sourceUrl);

    console.log(
      `[${index + 1}/${legacyRows.length}] ${label}`,
    );

    if (!storageKey) {
      console.log("  FAILED: could not derive storage key.");

      result.failed.push({
        id: row.id,
        label,
        sourceUrl: row.sourceUrl,
        reason: "Could not derive storage key.",
      });

      continue;
    }

    try {
      if (await objectAlreadyExists(storageKey)) {
        console.log(`  SKIP: already in Supabase (${storageKey})`);

        result.alreadyPresent.push({
          id: row.id,
          label,
          storageKey,
        });

        continue;
      }

      const response = await fetch(row.sourceUrl, {
        method: "GET",
        redirect: "follow",
      });

      if (!response.ok) {
        console.log(
          `  SOURCE MISSING: HTTP ${response.status}`,
        );

        result.sourceMissing.push({
          id: row.id,
          label,
          storageKey,
          sourceUrl: row.sourceUrl,
          status: response.status,
        });

        continue;
      }

      const bytes =
        new Uint8Array(
          await response.arrayBuffer(),
        );

      if (!bytes.byteLength) {
        console.log("  FAILED: source file was empty.");

        result.failed.push({
          id: row.id,
          label,
          storageKey,
          sourceUrl: row.sourceUrl,
          reason: "Source file was empty.",
        });

        continue;
      }

      const payload = row?.payload || {};

      const contentType =
        text(response.headers.get("content-type")) ||
        text(payload.mimeType) ||
        "application/octet-stream";

      const { error: uploadError } =
        await supabase.storage
          .from(BUCKET)
          .upload(
            storageKey,
            bytes,
            {
              contentType,
              cacheControl: "31536000",
              upsert: false,
            },
          );

      if (uploadError) {
        throw new Error(
          `Supabase upload failed: ${uploadError.message}`,
        );
      }

      console.log(
        `  MIGRATED: ${storageKey} (${bytes.byteLength} bytes)`,
      );

      result.migrated.push({
        id: row.id,
        label,
        storageKey,
        sourceUrl: row.sourceUrl,
        sizeBytes: bytes.byteLength,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.log(`  FAILED: ${message}`);

      result.failed.push({
        id: row.id,
        label,
        storageKey,
        sourceUrl: row.sourceUrl,
        reason: message,
      });
    }
  }

  console.log("");
  console.log("================ MIGRATION SUMMARY ================");
  console.log(`Migrated:            ${result.migrated.length}`);
  console.log(`Already in Supabase: ${result.alreadyPresent.length}`);
  console.log(`Source missing:      ${result.sourceMissing.length}`);
  console.log(`Failed:              ${result.failed.length}`);
  console.log(`No remote URL:       ${result.noRemote.length}`);
  console.log("===================================================");

  if (result.sourceMissing.length) {
    console.log("");
    console.log("Source files that returned an HTTP error:");
    for (const item of result.sourceMissing) {
      console.log(
        `- ${item.label} | HTTP ${item.status} | ${item.sourceUrl}`,
      );
    }
  }

  if (result.noRemote.length) {
    console.log("");
    console.log("Active media records with no remote URL:");
    for (const item of result.noRemote) {
      console.log(`- ${item.label} | SyncRecord ${item.id}`);
    }
  }

  if (result.failed.length) {
    console.log("");
    console.log("Migration failures:");
    for (const item of result.failed) {
      console.log(
        `- ${item.label} | ${item.reason}`,
      );
    }
  }

  if (
    result.failed.length ||
    result.sourceMissing.length
  ) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("");
  console.error("Fatal migration error:");
  console.error(error);
  process.exitCode = 1;
});