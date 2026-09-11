import {
  formatNumberPtBr2,
  parseBrlUserInput,
  valorReaisPorExtensoPtBr,
} from "@/lib/crm/proposta-valor-brl-extenso";

export function formatBrlComExtenso(valor: number): string {
  return `R$ ${formatNumberPtBr2(valor)} (${valorReaisPorExtensoPtBr(valor)})`;
}

export function parseAmount(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  return parseBrlUserInput(raw);
}

export function nearlyEqualMoney(a: number, b: number, tolerance = 0.02): boolean {
  return Math.abs(a - b) <= tolerance;
}
