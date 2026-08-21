"use client";

import Image from "next/image";
import type { MultiAddCompanion } from "@/lib/multi-add";
import { resolveCompanionLineId } from "@/lib/multi-add";
import { MinusIcon, PlusIcon } from "@/components/icon";
import { decodeHtmlEntities, formatPrice, getFloatVal } from "@/lib/utils";

interface Props {
  companions: MultiAddCompanion[];
  pinSlug: string | undefined;
  pinValue: string | undefined;
  quantities: Record<string, number>;
  onQuantityChange: (productId: string, quantity: number) => void;
  companionTotal: number;
  showTotal: boolean;
}

export function ProductMultiAdd({
  companions,
  pinSlug,
  pinValue,
  quantities,
  onQuantityChange,
  companionTotal,
  showTotal,
}: Props): React.JSX.Element | null {
  if (companions.length === 0) return null;

  return (
    <div className="mb-6 border-t border-gray-200 pt-5">
      <p className="mb-3 font-semibold text-primary">Complete the set</p>
      <ul className="flex flex-col gap-4">
        {companions.map((companion) => {
          const resolved = resolveCompanionLineId(companion, pinSlug, pinValue);
          const qty = quantities[companion.id] ?? 0;
          const unavailable = resolved === null;
          const unit = resolved?.unitPrice ?? getFloatVal(companion.price);
          const img = companion.image;

          return (
            <li key={companion.id} className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-button)] bg-gray-100">
                {img?.src ? (
                  <Image
                    src={img.src}
                    alt={img.alt || companion.name}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">
                  {decodeHtmlEntities(companion.name)}
                </p>
                <p className="text-sm text-gray-600">
                  {unavailable ? "Unavailable" : formatPrice(unit)}
                </p>
              </div>
              <div className="flex items-center rounded-md border border-gray-300">
                <button
                  type="button"
                  onClick={() =>
                    onQuantityChange(companion.id, Math.max(0, qty - 1))
                  }
                  disabled={qty <= 0 || unavailable}
                  className="cursor-pointer px-2.5 py-2 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Decrease ${companion.name} quantity`}
                >
                  <MinusIcon className="h-3.5 w-3.5" />
                </button>
                <span
                  className="w-8 text-center text-sm font-medium"
                  aria-live="polite"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => onQuantityChange(companion.id, qty + 1)}
                  disabled={unavailable}
                  className="cursor-pointer px-2.5 py-2 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Increase ${companion.name} quantity`}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {showTotal && (
        <p className="mt-4 text-sm text-gray-700">
          Companions{" "}
          <span className="font-semibold text-primary">
            {formatPrice(companionTotal)}
          </span>
        </p>
      )}
    </div>
  );
}
