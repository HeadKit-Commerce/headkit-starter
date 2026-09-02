"use client";

import Image from "next/image";
import type { MultiAddCompanion } from "@/lib/multi-add";
import { resolveCompanionLineId } from "@/lib/multi-add";
import { MinusIcon, PlusIcon } from "@/components/icon";
import { TitleEmphasis } from "@/components/headkit-ui/title-emphasis";
import { stripTitleMarkers } from "@/lib/title-emphasis";
import { decodeHtmlEntities, formatPrice, getFloatVal } from "@/lib/utils";

/** Hero (current PDP) row shown at the top of Complete the Set. */
export interface MultiAddHeroRow {
  id: string;
  name: string;
  unitPrice: number;
  image?: { src: string; alt: string } | null;
  /** When true, quantity cannot go below 1 (PDP product stays in the set). */
  minQuantity?: number;
  maxQuantity?: number | null;
  unavailable?: boolean;
}

interface Props {
  hero: MultiAddHeroRow;
  heroQuantity: number;
  onHeroQuantityChange: (quantity: number) => void;
  companions: MultiAddCompanion[];
  pinSlug: string | undefined;
  pinValue: string | undefined;
  quantities: Record<string, number>;
  onQuantityChange: (productId: string, quantity: number) => void;
  setTotal: number;
  pieceCount: number;
  showTotal: boolean;
}

function QtyStepper({
  name,
  qty,
  min,
  max,
  unavailable,
  onChange,
}: {
  name: string;
  qty: number;
  min: number;
  max: number | null;
  unavailable: boolean;
  onChange: (next: number) => void;
}): React.JSX.Element {
  const atMax = max !== null && qty >= max;
  const plainName = stripTitleMarkers(decodeHtmlEntities(name));
  return (
    <div className="flex items-center rounded-md border border-gray-300">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, qty - 1))}
        disabled={qty <= min || unavailable}
        className="cursor-pointer px-2.5 py-2 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Decrease ${plainName} quantity`}
      >
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-medium" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() =>
          onChange(max !== null ? Math.min(max, qty + 1) : qty + 1)
        }
        disabled={unavailable || atMax}
        className="cursor-pointer px-2.5 py-2 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Increase ${plainName} quantity`}
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ProductMultiAdd({
  hero,
  heroQuantity,
  onHeroQuantityChange,
  companions,
  pinSlug,
  pinValue,
  quantities,
  onQuantityChange,
  setTotal,
  pieceCount,
  showTotal,
}: Props): React.JSX.Element {
  const heroMin = hero.minQuantity ?? 1;

  return (
    <div className="mb-6 border-t border-gray-200 pt-5">
      <p className="mb-3 font-semibold text-primary">Complete the set</p>
      <ul className="flex flex-col gap-4">
        <li className="flex items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-button)] bg-gray-100">
            {hero.image?.src ? (
              <Image
                src={hero.image.src}
                alt={stripTitleMarkers(
                  decodeHtmlEntities(hero.image.alt || hero.name),
                )}
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-primary">
              <TitleEmphasis text={hero.name} />
            </p>
            <p className="text-sm text-gray-600">
              {hero.unavailable ? "Unavailable" : formatPrice(hero.unitPrice)}
            </p>
          </div>
          <QtyStepper
            name={hero.name}
            qty={heroQuantity}
            min={heroMin}
            max={hero.maxQuantity ?? null}
            unavailable={hero.unavailable === true}
            onChange={onHeroQuantityChange}
          />
        </li>

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
                    alt={stripTitleMarkers(
                      decodeHtmlEntities(img.alt || companion.name),
                    )}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">
                  <TitleEmphasis text={companion.name} />
                </p>
                <p className="text-sm text-gray-600">
                  {unavailable ? "Unavailable" : formatPrice(unit)}
                </p>
              </div>
              <QtyStepper
                name={companion.name}
                qty={qty}
                min={0}
                max={null}
                unavailable={unavailable}
                onChange={(next) => onQuantityChange(companion.id, next)}
              />
            </li>
          );
        })}
      </ul>
      {showTotal && (
        <div className="mt-4 flex items-baseline justify-between gap-3 text-sm text-gray-700">
          <span className="font-semibold uppercase tracking-wide text-primary">
            Total
          </span>
          <span className="font-semibold text-primary">
            {formatPrice(setTotal)}
          </span>
          <span className="tabular-nums text-gray-600">
            {pieceCount} {pieceCount === 1 ? "pc" : "pcs"}
          </span>
        </div>
      )}
    </div>
  );
}
