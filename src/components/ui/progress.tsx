"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

interface ProgressProps extends ProgressPrimitive.ProgressProps {
  indicatorClassName?: string;
}

function Progress({ className, value = 0, indicatorClassName, ...props }: ProgressProps) {
  const safeValue = value ?? 0;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={safeValue}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-white", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("h-full bg-crm-gradient-primary transition-all duration-500", indicatorClassName)}
        style={{ transform: `translateX(-${100 - safeValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
