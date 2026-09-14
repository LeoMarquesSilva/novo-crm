import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        // Design System V2 (§17.2): mesmas regras do Input; altura mínima 96px, padding
        // vertical 10px.
        "flex field-sizing-content min-h-24 w-full rounded-(--radius-v2-md) border border-input bg-white px-3 py-2.5 text-base transition-colors outline-none placeholder:text-text-placeholder-v2 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-text-disabled-v2 disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
