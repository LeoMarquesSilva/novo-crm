import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrqestraiColaboradoresLocal } from "@/lib/orqestrai/client";

export const NEW_INDICATION_VALUE = "__new__";
export const NEW_INDICATION_LABEL = "Não encontrei na base (solicitar aprovação)";

export type IndicationNameMode = "existing" | "new" | "colaborador";

export type IndicationCollaboratorOption = {
  id: string;
  name: string;
};

export type IndicationNameOptions = {
  approvedIndicators: string[];
  collaborators: IndicationCollaboratorOption[];
};

export const EMPTY_INDICATION_NAME_OPTIONS: IndicationNameOptions = {
  approvedIndicators: [],
  collaborators: [],
};

export function isCollaboratorIndicationType(tipoIndicacao: string | null | undefined): boolean {
  return tipoIndicacao === "Colaborador";
}

export function resolveIndicationNameMode(input: {
  tipoIndicacao?: string | null;
  nome?: string | null;
  approvedIndicators: readonly string[];
}): IndicationNameMode {
  if (isCollaboratorIndicationType(input.tipoIndicacao)) return "colaborador";
  const nome = (input.nome ?? "").trim();
  if (!nome) return "existing";
  if (input.approvedIndicators.includes(nome)) return "existing";
  return "new";
}

export function indicationNameSelectItems(
  approvedIndicators: readonly string[],
): Record<string, string> {
  const items: Record<string, string> = { [NEW_INDICATION_VALUE]: NEW_INDICATION_LABEL };
  for (const name of approvedIndicators) {
    items[name] = name;
  }
  return items;
}

export function collaboratorSelectItems(
  collaborators: readonly IndicationCollaboratorOption[],
): Record<string, string> {
  return Object.fromEntries(collaborators.map((item) => [item.name, item.name]));
}

export function shouldRequestIndicatorApproval(input: {
  tipoLead: string;
  tipoIndicacao?: string | null;
  mode: IndicationNameMode;
}): boolean {
  return input.tipoLead === "Indicacao" && input.mode === "new";
}

export async function loadIndicationNameOptions(
  supabase: SupabaseClient,
): Promise<IndicationNameOptions> {
  const [{ data: indicators }, collaborators] = await Promise.all([
    supabase.from("indicadores").select("nome, status").order("nome", { ascending: true }),
    getOrqestraiColaboradoresLocal(supabase),
  ]);

  const approvedIndicators = Array.from(
    new Set(
      (indicators ?? [])
        .filter((item) => item.status === "aprovado")
        .map((item) => item.nome.trim())
        .filter(Boolean),
    ),
  );

  let collaboratorOptions: IndicationCollaboratorOption[] = (collaborators ?? [])
    .filter((item) => item.isActive)
    .map((item) => ({ id: item.id, name: item.fullName.trim() }))
    .filter((item) => item.name);

  if (collaboratorOptions.length === 0) {
    const { data: users } = await supabase
      .from("app_users")
      .select("id, full_name")
      .order("full_name", { ascending: true });
    collaboratorOptions = (users ?? [])
      .map((user) => ({ id: user.id, name: (user.full_name ?? "").trim() }))
      .filter((item) => item.name);
  }

  return { approvedIndicators, collaborators: collaboratorOptions };
}
