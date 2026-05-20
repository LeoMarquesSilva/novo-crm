import type { NewLeadPayload } from "./new-lead-payload";

export const LEAD_EMAIL_COLORS = {
  dark: "#101F2E",
  gold: "#D5B170",
  bg: "#fcf9f5",
  white: "#fff",
  text: "#333",
  green: "#4CAF50",
  red: "#ff6b6b",
} as const;

export function leadEmailNowSaoPaulo(): { date: string; time: string } {
  const now = new Date();
  const spOffset = -3 * 60;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const spDate = new Date(utc + spOffset * 60000);
  return {
    date: spDate.toLocaleDateString("pt-BR"),
    time: spDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function joinLeadEmailEmpresas(empresas: NewLeadPayload["empresas"]): {
  razaoSocial: string;
  cnpj: string;
  razaoSocialPrimeira: string;
} {
  return {
    razaoSocial: empresas.map((e) => e.razao_social).join(", "),
    cnpj: empresas.map((e) => e.documento).join(", "),
    razaoSocialPrimeira: empresas[0]?.razao_social ?? "",
  };
}

export function leadEmailField(label: string, value: string): string {
  const { dark, text } = LEAD_EMAIL_COLORS;
  return `<p style="margin:8px 0;color:${text};line-height:1.5;"><strong style="color:${dark};">${label}:</strong> ${value}</p>`;
}
