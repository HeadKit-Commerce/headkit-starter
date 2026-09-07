import type { CopyTheme, SectionCopyFields } from "@/lib/store-theme";

/** SectionHeader call sites that can take customer copy from theme.json. */
export type SectionCopyKey = "homepageFeatured" | "pdpBundles" | "pdpRelated";

/** Starter hardcoded strings used when the matching theme.copy key is omitted. */
export interface SectionCopyFallback {
  title: string;
  eyebrow?: string;
  allButton?: string;
  allButtonPath?: string;
}

/** Values ready to pass to SectionHeader. */
export interface ResolvedSectionCopy {
  title: string;
  description: string;
  allButton: string;
  allButtonPath: string;
}

function pickTitle(override: string | undefined, fallback: string): string {
  if (override === undefined || override.trim() === "") {
    return fallback;
  }
  return override;
}

function pickOptional(
  override: string | undefined,
  fallback: string | undefined,
): string {
  if (override !== undefined) {
    return override;
  }
  return fallback ?? "";
}

function pickPath(
  override: string | undefined,
  fallback: string | undefined,
): string {
  if (override !== undefined && override.trim() !== "") {
    return override;
  }
  return fallback ?? "";
}

/**
 * Merge one theme.copy section onto starter defaults.
 * Omit / empty title keeps the fallback heading. Empty eyebrow or allButton
 * is an explicit hide. Empty allButtonPath falls back so a button never
 * links nowhere.
 */
export function resolveSectionCopy(
  copy: CopyTheme | undefined,
  key: SectionCopyKey,
  fallback: SectionCopyFallback,
): ResolvedSectionCopy {
  const override: SectionCopyFields | undefined = copy?.[key];
  return {
    title: pickTitle(override?.title, fallback.title),
    description: pickOptional(override?.eyebrow, fallback.eyebrow),
    allButton: pickOptional(override?.allButton, fallback.allButton),
    allButtonPath: pickPath(override?.allButtonPath, fallback.allButtonPath),
  };
}

/**
 * Homepage collection-card CTA. `null` means title only (starter default).
 */
export function collectionCardLinkText(
  copy: CopyTheme | undefined,
): string | null {
  const text = copy?.collectionCardLink?.trim();
  return text ? text : null;
}
