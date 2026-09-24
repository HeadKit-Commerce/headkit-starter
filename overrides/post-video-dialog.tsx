"use client";

import type { ReactElement } from "react";

export interface PostVideoEmbed {
  kind: "iframe" | "file";
  src: string;
}

/**
 * Replacement for the generic post-card video dialog. Null keeps the starter
 * dialog. Homepage journal layouts live in the customer override.
 */
export function renderPostVideoDialog(_props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  embed: PostVideoEmbed | null;
  excerpt: string;
  href: string;
  journal: boolean;
}): ReactElement | null {
  return null;
}
