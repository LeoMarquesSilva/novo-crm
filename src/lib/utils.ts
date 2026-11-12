import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * Escala tipográfica do Design System V2 (`text-v2-*`, em `globals.css`). Sem registrar como tamanho
 * de fonte, o tailwind-merge tratava `text-v2-caption` como cor e o descartava ao lado de outra cor
 * (`cn("text-v2-caption-medium", "text-success-text")` virava só a cor e o texto perdia o tamanho).
 */
export const V2_TEXT_SIZES = [
  "v2-display-sm",
  "v2-heading-xl",
  "v2-heading-lg",
  "v2-heading-md",
  "v2-body-md",
  "v2-body-md-medium",
  "v2-body-sm",
  "v2-body-sm-medium",
  "v2-caption",
  "v2-caption-medium",
] as const

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...V2_TEXT_SIZES] }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
