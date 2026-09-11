import type { LeadIntakeEmpresaRow } from "@/app/(crm)/crm/leads/[id]/lead-intake-types";
import { getSubtipoDef } from "@/data/proposta-tipos-catalog";
import { getPrimarySumKeyForSubtipo } from "@/lib/crm/proposta-investimento-consolidado";
import { parseEscopoJsonWithMeta } from "@/lib/crm/proposta-escopo-json";
import { formatBrlComExtenso, parseAmount } from "./money";
import { getScopeProfile } from "./scope-profiles";
import type {
  ContractingParty,
  ContractingPartyAddress,
  ContractInvestment,
  ContractInvestmentItem,
  ContractScope,
  ContractScopeAdjustment,
  ProposalScopeRef,
} from "./types";

export type ProposalContractSnapshot = {
  opportunityId: string;
  snapshotId: string;
  capturedAt: string;
  empresasIntake: LeadIntakeEmpresaRow[];
  propostaEmpresasJson: string;
  areasObjeto: string;
  escopoJson: string;
  address: ContractingPartyAddress;
  tributacao: string;
  ccTipoPagamento: string;
};

export function createProposalContractSnapshot(input: {
  opportunityId: string;
  fieldByCode: Record<string, string>;
  empresasIntake: LeadIntakeEmpresaRow[];
  capturedAt?: string;
}): ProposalContractSnapshot {
  const f = (code: string) => String(input.fieldByCode[code] ?? "").trim();
  return {
    opportunityId: input.opportunityId,
    snapshotId: `pcs_${input.opportunityId}_${(input.capturedAt ?? new Date().toISOString()).replace(/[:.]/g, "")}`,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    empresasIntake: input.empresasIntake,
    propostaEmpresasJson: f("cp_proposta_empresas_json"),
    areasObjeto: f("cp_areas_objeto"),
    escopoJson: f("cp_escopo_detalhe_json"),
    address: {
      logradouro: f("cp_cliente_logradouro"),
      numero: f("cp_cliente_numero"),
      complemento: f("cp_cliente_complemento"),
      bairro: f("cp_cliente_bairro"),
      cidade: f("cp_cliente_cidade"),
      uf: f("cp_cliente_uf"),
      cep: f("cp_cliente_cep"),
    },
    tributacao: f("cp_tributacao"),
    ccTipoPagamento: f("cc_tipo_pagamento"),
  };
}

export function extractProposalScopes(escopoJson: string): ProposalScopeRef[] {
  const { escopo } = parseEscopoJsonWithMeta(escopoJson);
  const out: ProposalScopeRef[] = [];
  for (const [areaLabel, entries] of Object.entries(escopo)) {
    for (const entry of entries) {
      if (!entry.subtipoId?.trim()) continue;
      const profile = getScopeProfile(entry.subtipoId);
      const catalogLabel = getSubtipoDef(areaLabel, entry.tipoId, entry.subtipoId)?.label;
      out.push({
        entryId: entry.id,
        areaLabel,
        typeId: entry.tipoId,
        subtypeId: entry.subtipoId,
        label: profile?.label ?? catalogLabel ?? humanizeScopeKey(entry.subtipoId),
        placeholders: entry.placeholders ?? {},
      });
    }
  }
  return out;
}

function humanizeScopeKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const small = new Set(["de", "da", "do", "das", "dos", "e"]);
  return trimmed
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function resolveContractScopes(escopoJson: string): ContractScope[] {
  return extractProposalScopes(escopoJson).map((ref) => {
    const profile = getScopeProfile(ref.subtypeId) ?? null;
    return {
      ...ref,
      label: profile?.label ?? ref.label,
      profile,
      missingProfile: !profile,
    };
  });
}

export function applyScopeAdjustments(
  scopes: ContractScope[],
  adjustment: ContractScopeAdjustment | null | undefined,
): ContractScope[] {
  if (!adjustment) return scopes;
  const removed = new Set(adjustment.removedEntryIds);
  const kept = scopes.filter((scope) => !removed.has(scope.entryId));
  const existingIds = new Set(kept.map((s) => s.entryId));
  const added = adjustment.addedScopes
    .filter((ref) => !existingIds.has(ref.entryId))
    .map((ref) => {
      const profile = getScopeProfile(ref.subtypeId) ?? null;
      return {
        ...ref,
        placeholders: ref.placeholders ?? {},
        label: profile?.label ?? ref.label,
        profile,
        missingProfile: !profile,
      } satisfies ContractScope;
    });
  return [...kept, ...added];
}

export function resolveContractInvestment(escopoJson: string): ContractInvestment {
  const { escopo, investimentoDocumento } = parseEscopoJsonWithMeta(escopoJson);
  const items: ContractInvestmentItem[] = [];

  const docItems = investimentoDocumento?.items?.length
    ? investimentoDocumento.items
    : investimentoDocumento
      ? [investimentoDocumento]
      : [];

  for (const raw of docItems) {
    const tipoId = "tipoId" in raw ? raw.tipoId : "";
    const subtipoId = "subtipoId" in raw ? raw.subtipoId : "";
    const placeholders = raw.placeholders ?? {};
    const sumKey = getPrimarySumKeyForSubtipo(subtipoId);
    items.push({
      id: "id" in raw && raw.id ? raw.id : `${tipoId}:${subtipoId}`,
      tipoId,
      subtipoId,
      placeholders,
      amount: sumKey ? parseAmount(placeholders[sumKey] ?? "") : parseAmount(placeholders.VALORSPOT ?? ""),
    });
  }

  if (items.length === 0) {
    for (const entries of Object.values(escopo)) {
      for (const entry of entries) {
        const inv = entry.investimento;
        if (!inv?.subtipoId) continue;
        const sumKey = getPrimarySumKeyForSubtipo(inv.subtipoId);
        items.push({
          id: `${entry.id}:inv`,
          tipoId: inv.tipoId,
          subtipoId: inv.subtipoId,
          placeholders: inv.placeholders ?? {},
          amount: sumKey ? parseAmount(inv.placeholders?.[sumKey] ?? "") : null,
        });
      }
    }
  }

  const totalAmount = items.reduce<number | null>((acc, item) => {
    if (item.amount == null) return acc;
    return (acc ?? 0) + item.amount;
  }, null);

  return {
    items,
    totalAmount,
    totalExtenso: totalAmount != null ? formatBrlComExtenso(totalAmount) : "",
    tributacao: "",
  };
}

export function resolveContractingParties(params: {
  empresasIntake: LeadIntakeEmpresaRow[];
  propostaEmpresasJson: string;
  address: ContractingPartyAddress;
}): ContractingParty[] {
  const payload = parseEmpresasPayload(params.propostaEmpresasJson);
  let primaryIndex = payload.primaryIndex;
  if (primaryIndex <= 0 && params.empresasIntake.length > 0) {
    primaryIndex = params.empresasIntake[0].index;
  }

  const extraDocs = new Set(
    payload.extras.map((e) => e.documento.replace(/\D/g, "")).filter(Boolean),
  );
  const extraNames = new Set(
    payload.extras.map((e) => e.razao_social.trim().toLowerCase()).filter(Boolean),
  );

  const parties: ContractingParty[] = [];
  const usedDocs = new Set<string>();

  for (const empresa of params.empresasIntake) {
    const isPrimary = empresa.index === primaryIndex;
    const doc = empresa.documento.replace(/\D/g, "");
    const listedAsExtra =
      (doc && extraDocs.has(doc)) || extraNames.has(empresa.razao_social.trim().toLowerCase());
    parties.push({
      id: `intake-${empresa.index}`,
      razaoSocial: empresa.razao_social,
      documento: empresa.documento,
      documentoTipo: empresa.tipo_documento,
      endereco: params.address,
      role: isPrimary || listedAsExtra ? "contratante" : "relacionada",
      source: "intake",
    });
    if (doc) usedDocs.add(doc);
  }

  for (const extra of payload.extras) {
    const doc = extra.documento.replace(/\D/g, "");
    if (doc && usedDocs.has(doc)) continue;
    if (!extra.razao_social.trim() && !doc) continue;
    parties.push({
      id: `extra-${doc || extra.razao_social}`,
      razaoSocial: extra.razao_social,
      documento: extra.documento,
      documentoTipo: extra.documento.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF",
      endereco: emptyAddress(),
      role: "contratante",
      source: "proposta_extra",
    });
  }

  return parties;
}

function parseEmpresasPayload(raw: string): {
  primaryIndex: number;
  extras: Array<{ razao_social: string; documento: string }>;
} {
  if (!raw.trim()) return { primaryIndex: 0, extras: [] };
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const primaryIndex =
      typeof o.primaryIndex === "number" && o.primaryIndex >= 0 ? Math.floor(o.primaryIndex) : 0;
    const extras: Array<{ razao_social: string; documento: string }> = [];
    if (Array.isArray(o.extras)) {
      for (const row of o.extras) {
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

function emptyAddress(): ContractingPartyAddress {
  return {
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    cep: "",
  };
}
