"use client";

import { formatWooRichText } from "@/lib/utils";
import { shopifyRichTextToHtml } from "@/lib/shopify-rich-text";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  html: string;
  label?: string;
}

/** Text link that opens the merchant size chart in a modal. */
export function SizeChartTrigger({
  html,
  label = "Size chart",
}: Props): React.JSX.Element | null {
  const body = formatWooRichText(shopifyRichTextToHtml(html));
  if (!body) return null;

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
        <div
          className="headkit-size-chart-body prose prose-sm max-w-none text-primary [&_table]:w-full [&_td]:border [&_td]:border-primary/20 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-primary/20 [&_th]:px-2 [&_th]:py-1"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      </DialogContent>
    </Dialog>
  );
}
