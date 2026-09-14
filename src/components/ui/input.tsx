import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Design System V2 (§17.1): altura 40px, raio 8px, borda sólida, sem sombra
        // interna; foco com borda + ring azul. --text-placeholder usa o valor de
        // --text-secondary/neutral-500 (mais escuro que --text-disabled/neutral-400) para
        // atingir WCAG AA (achado de QA na Fase 2, ver STATUS_REDESIGN.md); --text-disabled
        // pode ficar mais claro porque WCAG isenta componentes desabilitados do requisito.
        "h-10 w-full min-w-0 rounded-(--radius-v2-md) border border-input bg-white px-3 py-2 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-text-placeholder-v2 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-text-disabled-v2 disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
