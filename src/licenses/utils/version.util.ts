function numericParts(version: string): number[] {
  const core = version
    .trim()
    .replace(/^v/i, "")
    .split("-")[0];

  return core.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

export function compareVersions(
  left: string,
  right: string,
): number {
  const a = numericParts(left);
  const b = numericParts(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;

    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
}

export function majorVersion(
  version: string,
): number {
  return numericParts(version)[0] ?? 0;
}

export function versionWithinRange(
  appVersion: string,
  minimum?: string | null,
  maximum?: string | null,
): boolean {
  if (
    minimum &&
    compareVersions(appVersion, minimum) < 0
  ) {
    return false;
  }

  if (
    maximum &&
    compareVersions(appVersion, maximum) > 0
  ) {
    return false;
  }

  return true;
}
