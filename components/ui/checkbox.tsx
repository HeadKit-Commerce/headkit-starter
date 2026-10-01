"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "@/components/icon";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  HTMLButtonElement,
  CheckboxPrimitive.Root.Props
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-neutral-200 border-neutral-900 ring-offset-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-neutral-900 data-[checked]:text-neutral-50 dark:border-neutral-800 dark:border-neutral-50 dark:ring-offset-neutral-950 dark:focus-visible:ring-neutral-300 dark:data-[checked]:bg-neutral-50 dark:data-[checked]:text-neutral-900",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <CheckIcon className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
