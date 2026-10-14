/**
 * Sugestões de signatários do CLIENTE (CONTRATANTE) para o diálogo de envio. Ordem:
 * quem já assinou/foi convidado num envio anterior → ponto focal da proposta →
 * contatos do cliente cadastrado → e-mail principal do cliente. Sem e-mails dos sócios.
 */
export type ClientSignerSuggestion = {
  name: string;
  email: string;
  foreign: "0" | "1";
  source: "envio_anterior" | "ponto_focal" | "contato_cliente" | "cliente";
};

type PreviousSigner = { email?: unknown; name?: unknown; role?: unknown; foreign?: unknown };

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildClientSignerSuggestions(input: {
  previousSigners: unknown;
  focal: { name: string | null; email: string | null };
  contacts: { nome: string | null; email: string | null }[];
  cliente: { nome: string | null; email: string | null } | null;
  isFirmEmail: (email: string) => boolean;
}): ClientSignerSuggestion[] {
  const out: ClientSignerSuggestion[] = [];
  const seen = new Set<string>();

  const push = (name: string, rawEmail: unknown, source: ClientSignerSuggestion["source"], foreign: "0" | "1" = "0") => {
    const email = normalizeEmail(rawEmail);
    if (!email || seen.has(email) || input.isFirmEmail(email)) return;
    seen.add(email);
    out.push({ name, email, foreign, source });
  };

  if (Array.isArray(input.previousSigners)) {
    for (const raw of input.previousSigners as PreviousSigner[]) {
      if (!raw || typeof raw !== "object") continue;
      if (text(raw.role).toUpperCase() === "CONTRATADA") continue;
      push(text(raw.name), raw.email, "envio_anterior", raw.foreign === "1" ? "1" : "0");
    }
  }

  push(text(input.focal.name), input.focal.email, "ponto_focal");

  for (const contact of input.contacts) push(text(contact.nome), contact.email, "contato_cliente");

  if (input.cliente) push(text(input.cliente.nome), input.cliente.email, "cliente");

  return out;
}
