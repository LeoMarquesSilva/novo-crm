/**
 * Rótulos dos status de contrato, versão e fechamento para a tela. O banco guarda o código do enum
 * ("em_revisao", "lancado_vios"); o Financeiro via o código cru nos chips e badges.
 */
export const CONTRACT_LIFECYCLE_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  ativo: "Ativo",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
};

export const CONTRACT_SIGNATURE_LABELS: Record<string, string> = {
  rascunho: "Assinatura pendente",
  enviado: "Enviado para assinatura",
  assinado: "Assinado",
};

export const CONTRACT_VERSION_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  ativa: "Ativa",
  substituida: "Substituída",
  cancelada: "Cancelada",
};

export const CONTRACT_CLOSING_STATUS_LABELS: Record<string, string> = {
  a_calcular: "A calcular",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  lancado_vios: "Lançado no VIOS",
  cancelado: "Cancelado",
};

export const CONTRACT_ADDENDUM_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  assinado: "Assinado",
  cancelado: "Cancelado",
};

/** Rótulo do mapa; código desconhecido sai legível ("novo_status" → "Novo status"), nunca com sublinhado. */
export function statusLabel(labels: Record<string, string>, value: string | null | undefined): string {
  const code = (value ?? "").trim();
  if (!code) return "—";
  if (labels[code]) return labels[code];
  const text = code.replaceAll("_", " ");
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}
