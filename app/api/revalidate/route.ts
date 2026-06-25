import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { env } from "@/lib/env";

/**
 * POST /api/revalidate
 *
 * WordPress webhook endpoint for on-demand cache invalidation.
 * Triggered by the HeadKit WooCommerce plugin after content changes.
 *
 * Supports both legacy (singular) and current (array) body formats:
 *   Legacy:  { secret, path?: string, tag?: string }
 *   Current: { secret, paths?: string[], tags?: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      path?: string;
      tag?: string;
      paths?: string[];
      tags?: string[];
      secret?: string;
    };
    const { path, tag, paths, tags, secret } = body;

    if (secret !== env.REVALIDATION_SECRET) {
      return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
    }

    const revalidatedPaths: string[] = [];
    const revalidatedTags: string[] = [];

    // Current format: arrays
    for (const p of paths ?? []) {
      revalidatePath(p);
      revalidatedPaths.push(p);
    }
    for (const t of tags ?? []) {
      revalidateTag(t, "default");
      revalidatedTags.push(t);
    }

    // Legacy format: singular values (backwards-compat with older plugin versions)
    if (path && !revalidatedPaths.includes(path)) {
      revalidatePath(path);
      revalidatedPaths.push(path);
    }
    if (tag && !revalidatedTags.includes(tag)) {
      revalidateTag(tag, "default");
      revalidatedTags.push(tag);
    }

    return NextResponse.json(
      {
        revalidated: true,
        paths: revalidatedPaths,
        tags: revalidatedTags,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[revalidate]", error);
    return NextResponse.json(
      { message: "Error revalidating" },
      { status: 500 },
    );
  }
}
