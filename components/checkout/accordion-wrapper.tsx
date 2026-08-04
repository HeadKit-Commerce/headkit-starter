"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  order: number;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
  clickable?: boolean;
  handleAccordionClick: () => void;
  children: React.ReactNode;
  briefValue?: string;
  rightMenu?: React.ReactNode;
  showButton?: boolean;
  buttonLabel?: string;
  buttonOnClick?: () => void;
  disabled?: boolean;
}

const AccordionWrapper = ({
  order,
  title,
  isActive,
  isCompleted,
  clickable = false,
  handleAccordionClick,
  children,
  briefValue,
  rightMenu,
  showButton = false,
  buttonLabel = "Continue",
  buttonOnClick,
  disabled = false,
}: Props) => {
  return (
    <div
      className={cn(
        "relative mb-2 px-5 py-5 md:px-10 md:py-5 rounded-md bg-white border transition-all",
        {
          "border-primary shadow-sm": isActive,
          "border-gray-200": !isActive,
          "cursor-pointer hover:border-gray-300":
            isCompleted && !isActive && clickable,
          "opacity-50": disabled,
        },
      )}
      onClick={disabled || !clickable ? undefined : handleAccordionClick}
    >
      {disabled && (
        <div className="absolute inset-0 rounded-md bg-white/50 cursor-not-allowed" />
      )}

      <div className="flex justify-between items-center">
        <div
          className={cn("flex items-center gap-3 text-2xl font-extrabold", {
            "text-primary": isActive,
            "text-gray-900": !isActive && isCompleted,
            "text-gray-400": !isActive && !isCompleted,
          })}
        >
          {isCompleted && !isActive ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={3}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </span>
          ) : (
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                {
                  "bg-primary text-white": isActive,
                  "bg-gray-200 text-gray-500": !isActive,
                },
              )}
            >
              {order}
            </span>
          )}
          <span>{title}</span>
        </div>
        {isActive && rightMenu ? (
          <div className="text-right">{rightMenu}</div>
        ) : (
          !isActive &&
          isCompleted &&
          briefValue && (
            <div
              className="text-sm text-gray-700 max-w-[50%] text-right line-clamp-2"
              dangerouslySetInnerHTML={{ __html: briefValue }}
            />
          )
        )}
      </div>

      {isActive && (
        <div className="mt-5">
          {children}
          {showButton && (
            <Button
              className="mt-4 w-full"
              onClick={(e) => {
                e.stopPropagation();
                if (buttonOnClick) buttonOnClick();
              }}
              rightIcon="arrowRight"
            >
              {buttonLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export { AccordionWrapper };
