"use client";

import { useEffect, useState } from "react";
import { formatWooRichText } from "@/lib/utils";
import { shopifyRichTextToHtml } from "@/lib/shopify-rich-text";
import { getSizeGuidePageHtml } from "@/lib/size-guide-actions";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  html?: string;
  /** Theme `pdp.sizeGuideHref` — fetch CMS page HTML when `html` is empty. */
  pageHref?: string;
  label?: string;
}

/** Text control that opens the merchant size chart in a modal. */
export function SizeChartTrigger({
  html = "",
  pageHref,
  label = "Size Guide",
}: Props): React.JSX.Element | null {
  const [remoteHtml, setRemoteHtml] = useState("");

  useEffect(() => {
    if (html.trim() !== "" || !pageHref) {
      return;
    }
    let cancelled = false;
    void getSizeGuidePageHtml(pageHref).then((body) => {
      if (!cancelled) {
        setRemoteHtml(body);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [html, pageHref]);

  const source = html.trim() !== "" ? html : remoteHtml;
  const body = formatWooRichText(shopifyRichTextToHtml(source));
  if (!body && !pageHref) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="headkit-size-chart-link text-sm underline underline-offset-2 text-primary"
        >
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="headkit-size-chart-dialog max-h-[85vh] overflow-y-auto bg-brand-bg p-6 text-primary md:p-8">
        <DialogTitle className="mb-4 text-lg font-semibold text-primary">
          {label}
        </DialogTitle>
        {body ? (
          <div
            className="headkit-size-chart-body prose prose-sm max-w-none text-primary [&_table]:w-full [&_td]:border [&_td]:border-primary/20 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-primary/20 [&_th]:px-2 [&_th]:py-1"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : (
          <p className="text-sm text-gray-600">Loading size guide…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
