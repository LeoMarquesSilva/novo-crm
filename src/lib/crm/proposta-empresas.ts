/**
 * Empresas da proposta (`cp_proposta_empresas_json`) e texto de qualificação (`cp_qualificacao`).
 * Sem React: usado pelo bloco Reunião → Elaboração da proposta (kanban e ficha) e pela
 * migração do RD no servidor.
 */

export type EmpresaIntakeRow = {
  index: number;
  razao_social: string;
  tipo_documento: "CPF" | "CNPJ";
  documento: string;
};

export type PropostaEmpresasPayload = {
  primaryIndex: number;
  extras: Array<{ razao_social: string; documento: string }>;
};

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export function formatCepDisplay(d: string): string {
  const x = digitsOnly(d).slice(0, 8);
  if (x.length <= 5) return x;
  return `${x.slice(0, 5)}-${x.slice(5)}`;
}

export function parsePropostaEmpresasJson(raw: string | undefined): PropostaEmpresasPayload {
  if (!raw || !raw.trim()) {
    return { primaryIndex: 0, extras: [] };
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const primaryIndex =
      typeof o.primaryIndex === "number" && o.primaryIndex >= 0
        ? Math.floor(o.primaryIndex)
        : 0;
    const extrasRaw = o.extras;
    const extras: Array<{ razao_social: string; documento: string }> = [];
    if (Array.isArray(extrasRaw)) {
      for (const row of extrasRaw) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        extras.push({
          razao_social: typeof r.razao_social === "string" ? r.razao_social.trim() : "",
          documento: typeof r.documento === "string" ? r.documento.trim() : "",
        });
      }
    }
    return { primaryIndex, extras };
  } catch {
    return { primaryIndex: 0, extras: [] };
  }
}

export function serializePropostaEmpresas(p: PropostaEmpresasPayload): string {
  return JSON.stringify(p);
}


/** Monta o texto de qualificação para `cp_qualificacao`. */
export function buildCpQualificacaoText(params: {
  empresasIntake: EmpresaIntakeRow[];
  empresasPayload: PropostaEmpresasPayload;
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
  };
}): string {
  const lines: string[] = ["Empresa(s) na proposta:"];
  const { empresasIntake, empresasPayload, endereco } = params;

  let primaryIdx = empresasPayload.primaryIndex;
  if (primaryIdx <= 0 && empresasIntake.length > 0) {
    primaryIdx = empresasIntake[0].index;
  }
  if (primaryIdx > 0) {
    const em = empresasIntake.find((e) => e.index === primaryIdx);
    if (em) {
      lines.push(
        `— Principal (cadastro): ${em.razao_social || "—"} (${em.tipo_documento} ${em.documento || "—"})`,
      );
    }
  }

  for (const ex of empresasPayload.extras) {
    if (ex.razao_social.trim() || ex.documento.trim()) {
      lines.push(`— Adicional: ${ex.razao_social.trim() || "—"} — ${ex.documento.trim() || "—"}`);
    }
  }

  if (lines.length === 1) {
    lines.push("— (não informado)");
  }

  const cepFmt = formatCepDisplay(endereco.cep);
  lines.push("");
  lines.push("Endereço do cliente:");
  lines.push(
    `${cepFmt} — ${endereco.logradouro.trim() || "—"}, Nº ${endereco.numero.trim() || "—"}` +
      (endereco.complemento.trim() ? `, ${endereco.complemento.trim()}` : ""),
  );
  lines.push(
    `${endereco.bairro.trim() || "—"} — ${endereco.cidade.trim() || "—"}/${(endereco.uf.trim() || "—").toUpperCase()}`,
  );

  return lines.join("\n");
}
