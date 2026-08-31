"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  isBackorderStockStatus,
  isVariationOutOfStock,
} from "@/lib/variation-stock";

enum AvailabilityStatusEnum {
  IN_STOCK = "IN_STOCK",
  LOW_STOCK = "LOW_STOCK",
  OUT_OF_STOCK = "OUT_OF_STOCK",
  ON_BACKORDER = "ON_BACKORDER",
}

interface Props {
  stockStatus: string;
  stockQuantity?: number | null;
}

const AvailabilityStatus = ({ stockStatus, stockQuantity }: Props) => {
  const [status, setStatus] = useState<AvailabilityStatusEnum>(
    AvailabilityStatusEnum.IN_STOCK,
  );

  useEffect(() => {
    if (isVariationOutOfStock({ stockStatus, stockQuantity })) {
      setStatus(AvailabilityStatusEnum.OUT_OF_STOCK);
      return;
    }
    if (isBackorderStockStatus(stockStatus)) {
      setStatus(AvailabilityStatusEnum.ON_BACKORDER);
      return;
    }
    if (
      stockQuantity !== null &&
      stockQuantity !== undefined &&
      stockQuantity > 0 &&
      stockQuantity <= 3
    ) {
      setStatus(AvailabilityStatusEnum.LOW_STOCK);
      return;
    }
    setStatus(AvailabilityStatusEnum.IN_STOCK);
  }, [stockStatus, stockQuantity]);

  const dotColor = {
    [AvailabilityStatusEnum.IN_STOCK]: "bg-lime-800",
    [AvailabilityStatusEnum.LOW_STOCK]: "bg-orange-500",
    [AvailabilityStatusEnum.OUT_OF_STOCK]: "bg-pink-800",
    [AvailabilityStatusEnum.ON_BACKORDER]: "bg-orange-500",
  }[status];

  const textColor = {
    // lime-900: lime-800 text is 2.4:1 on white and fails WCAG AA (the dot
    // keeps lime-800 — non-text indicator next to its label).
    [AvailabilityStatusEnum.IN_STOCK]: "text-lime-900",
    [AvailabilityStatusEnum.LOW_STOCK]: "text-orange-500",
    [AvailabilityStatusEnum.OUT_OF_STOCK]: "text-pink-800",
    [AvailabilityStatusEnum.ON_BACKORDER]: "text-orange-500",
  }[status];

  const label = {
    [AvailabilityStatusEnum.IN_STOCK]: "In Stock",
    [AvailabilityStatusEnum.LOW_STOCK]: `Only ${stockQuantity} in Stock`,
    [AvailabilityStatusEnum.OUT_OF_STOCK]: "Out of Stock",
    [AvailabilityStatusEnum.ON_BACKORDER]: "Available on backorder",
  }[status];

  return (
    <div className={cn("flex items-baseline font-medium", textColor)}>
      <span className="relative mr-2 flex h-3 w-3">
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            dotColor,
          )}
        />
        <span
          className={cn("relative inline-flex h-3 w-3 rounded-full", dotColor)}
        />
      </span>
      {label}
    </div>
  );
};

export { AvailabilityStatus };
