"use client";

import { cn } from "@/lib/utils";
import { addAlphaToHex } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  color1?: string;
  color2?: string;
  selectedOptionValue: string;
  onClick: () => void;
  isUnavailable?: boolean;
  /** Exists in some variation but not compatible with current other selections.
   *  The button remains clickable and triggers an auto-cascade. */
  isIncompatible?: boolean;
  size?: "small" | "default";
}

const VariantSwatch = ({
  label,
  value,
  color1,
  color2,
  selectedOptionValue,
  onClick,
  isUnavailable = false,
  isIncompatible = false,
  size = "default",
}: Props) => {
  const isSelected = selectedOptionValue === value;
  const hasColor = !!color1;

  if (hasColor) {
    const color1Formatted = isUnavailable ? addAlphaToHex(color1, 0.5) : color1;
    const color2Formatted = color2
      ? isUnavailable
        ? addAlphaToHex(color2, 0.5)
        : color2
      : null;
    const colorStyle = color2Formatted
      ? {
          background: `linear-gradient(90deg, ${color1Formatted}, ${color1Formatted} 50%, ${color2Formatted} 51%)`,
        }
      : { backgroundColor: color1Formatted };

    return (
      <button
        type="button"
        title={label}
        onClick={onClick}
        className={cn(
          "relative cursor-pointer rounded-full border outline transition-all hover:outline-purple-500",
          size === "default"
            ? "h-6 w-6 outline-2 outline-offset-1"
            : "h-4 w-4 outline-1 outline-offset-1",
          isUnavailable ? "border-gray-500" : "border-gray-700",
          isSelected ? "outline-purple-800" : "outline-transparent",
          isIncompatible && !isSelected && "opacity-50",
        )}
        style={colorStyle}
      >
        <span className="sr-only">{label}</span>
        {isUnavailable && (
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45 transform bg-gray-500" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative h-8 cursor-pointer rounded-md border px-[10px] py-1 text-center outline-2 outline-solid -outline-offset-1 transition-all hover:outline-purple-500",
        isUnavailable ? "border-gray-500 text-gray-500" : "border-gray-700",
        isSelected ? "font-semibold outline-purple-800" : "outline-transparent",
        isIncompatible && !isSelected && "opacity-50",
      )}
    >
      {label}
      {isUnavailable && (
        <svg className="absolute left-1/2 top-1/2 h-[95%] w-[95%] -translate-x-1/2 -translate-y-1/2 transform">
          <line
            x1="0"
            y1="100%"
            x2="100%"
            y2="0"
            className="stroke-gray-500 stroke-1"
          />
        </svg>
      )}
    </button>
  );
};

export { VariantSwatch };
