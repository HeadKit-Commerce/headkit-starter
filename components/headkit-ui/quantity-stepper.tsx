"use client";

import { MinusIcon, PlusIcon } from "@/components/icon";

export type QuantityStepperProps = {
  value: number;
  min?: number;
  max?: number | null;
  disabled?: boolean;
  onChange: (value: number) => void;
  onDecrement: () => void;
  onIncrement: () => void;
};

/**
 * Outline quantity control matching Product Detail (typable number input).
 */
export function QuantityStepper({
  value,
  min = 1,
  max = null,
  disabled = false,
  onChange,
  onDecrement,
  onIncrement,
}: QuantityStepperProps): React.ReactElement {
  const atMin = value <= min;
  const atMax = max != null && value >= max;

  return (
    <div className="flex items-center rounded-md border border-gray-300">
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled || atMin}
        className="cursor-pointer px-3 py-2.5 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Decrease quantity"
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <input
        type="number"
        min={min}
        max={max ?? 99}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const val = parseInt(e.target.value, 10);
          if (!Number.isNaN(val) && val >= min) {
            onChange(max != null ? Math.min(max, val) : val);
          }
        }}
        className="w-12 border-x border-gray-300 py-2 text-center text-sm font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="Quantity"
      />
      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled || atMax}
        className="cursor-pointer px-3 py-2.5 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase quantity"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
