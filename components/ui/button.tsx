"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ShoppingBagIcon,
  SpinnerIcon,
} from "@/components/icon";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-800 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-primary/70",
        destructive: "bg-red-500 text-white shadow-sm hover:bg-red-500/90",
        outline:
          "border border-gray-200 bg-white shadow-sm hover:bg-gray-100 hover:text-gray-900",
        secondary:
          "border-2 border-purple-800 bg-gradient-to-r hover:from-lime-400 hover:to-lime-100",
        ghost: "",
        link: "text-purple-800 underline-offset-4 hover:underline hover:text-purple-500",
      },
      size: {
        default: "h-10 px-4 py-2 text-base",
        sm: "h-8 rounded-md px-3 text-sm",
        lg: "h-11 rounded-md px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type RightIconType =
  | "arrowRight"
  | "chevronLeft"
  | "chevronRight"
  | "shoppingBag";

const RightIconMap: Record<RightIconType, React.ElementType> = {
  arrowRight: ArrowRightIcon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  shoppingBag: ShoppingBagIcon,
};

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  rightIcon?: RightIconType;
  fullWidth?: boolean;
  loading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      rightIcon,
      fullWidth,
      loading,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    // asChild merges the button styling/props onto the single child element
    // (e.g. <Button asChild><Link/></Button> renders ONE <a class="...">).
    // Previously the prop was silently dropped, producing a nested
    // <button><a/></button> — invalid nested interactive controls that also
    // failed the a11y target-size audit (the inner link obscured the button).
    if (asChild) {
      return (
        <Slot
          className={cn(
            buttonVariants({ variant, size, className }),
            fullWidth && "w-full",
          )}
          ref={ref as React.Ref<HTMLElement>}
          {...(props as React.HTMLAttributes<HTMLElement>)}
        >
          {children}
        </Slot>
      );
    }
    const IconComponent = rightIcon ? RightIconMap[rightIcon] : null;
    return (
      <button
        className={cn(
          buttonVariants({ variant, size, className }),
          fullWidth && "w-full",
        )}
        ref={ref}
        disabled={disabled ?? !!loading}
        {...props}
      >
        {loading ? (loadingText ?? "Processing...") : children}
        {loading ? (
          <SpinnerIcon className="h-4 w-4 animate-spin" />
        ) : IconComponent ? (
          <IconComponent className="h-4 w-4" />
        ) : null}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
