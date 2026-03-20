import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { env } from "@/lib/env";

/**
 * POST /api/revalidate
 *
 * WordPress webhook endpoint for on-demand cache invalidation.
 * Triggered by the HeadKit WooCommerce plugin after content changes.
 *
 * Body: { secret: string, path?: string, tag?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      path?: string;
      tag?: string;
      secret?: string;
    };
    const { path, tag, secret } = body;

    if (secret !== env.REVALIDATION_SECRET) {
      return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
    }

    if (path) {
      revalidatePath(path);
    }

    if (tag) {
      revalidateTag(tag, "default");
    }

    return NextResponse.json(
      {
        revalidated: true,
        message: `Revalidated ${path ? `path: ${path}` : ""} ${tag ? `tag: ${tag}` : ""}`.trim(),
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
