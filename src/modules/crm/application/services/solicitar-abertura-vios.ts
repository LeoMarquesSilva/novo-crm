import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { findDueAreaResponsibleAppUserId } from "@/lib/crm/due-area-tasks";
import { saoPauloDateYmd } from "@/lib/format-datetime";
import { logServerError, publicErrorMessage } from "@/lib/http/api-errors";
import { getOrqestraiColaboradoresLocal } from "@/lib/orqestrai/client";
import {
  buildViosAberturaPedido,
  nomeNoVios,
  VIOS_ABERTURA_PADRAO,
  type ViosAberturaEmpresa,
  type ViosAberturaPedido,
} from "@/modules/crm/application/services/build-vios-abertura-payload";
import { buildLeadDetailUrl } from "@/modules/crm/application/services/send-lead-notification-email";
import {
  SamaRpaClient,
  type SamaRpaEnfileirado,
} from "@/modules/crm/infrastructure/integrations/sama-rpa-client";

/**
 * Chave da troca SharePoint → robô do SAMA (`VIOS_ABERTURA_MODO`):
 * - `desligado` (padrão): nada vai ao SAMA; o SharePoint segue como sempre;
 * - `simular`: o SharePoint segue e o SAMA recebe o mesmo lead em simulação (não grava no VIOS);
 * - `ativo`: só o SAMA, gravando no VIOS; o SharePoint para.
 */
export type ViosAberturaModo = "desligado" | "simular" | "ativo";

export function viosAberturaModo(env: Record<string, string | undefined> = process.env): ViosAberturaModo {
  const valor = env.VIOS_ABERTURA_MODO?.trim().toLowerCase();
  return valor === "simular" || valor === "ativo" ? valor : "desligado";
}

export type ResultadoAberturaVios =
  | { status: "desligado" }
  | { status: "sem_due" }
  | { status: "pulado"; motivo: string }
  | { status: "enviado" | "duplicado"; avisos: string[] }
  | { status: "erro"; mensagem: string };

type Dependencias = {
  modo?: ViosAberturaModo;
  hojeYmd?: string;
  enfileirar?: (pedido: ViosAberturaPedido) => Promise<SamaRpaEnfileirado>;
};

function empresasDoIntake(valor: unknown): ViosAberturaEmpresa[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      tipo_documento: typeof e.tipo_documento === "string" ? e.tipo_documento : null,
      razao_social: typeof e.razao_social === "string" ? e.razao_social : "",
      documento: typeof e.documento === "string" ? e.documento : "",
    }));
}

/** Responsável de cada área da DUE: o da tarefa da área (pode ter sido trocado) ou o padrão da área. */
async function responsaveisPorArea(
  supabase: SupabaseClient,
  oportunidadeId: string,
  areas: string[],
): Promise<{ area: string; nomeVios: string | null }[]> {
  const { data: tarefas } = await supabase
    .from("due_area_tasks")
    .select("area_key, responsavel_app_user_id")
    .eq("oportunidade_id", oportunidadeId);
  const daTarefa = new Map(
    (tarefas ?? []).map((t) => [String(t.area_key), (t.responsavel_app_user_id as string | null) ?? null]),
  );

  const idPorArea = await Promise.all(
    areas.map(async (area) => ({
      area,
      appUserId: daTarefa.get(area) ?? (await findDueAreaResponsibleAppUserId(supabase, area)),
    })),
  );
  const ids = [...new Set(idPorArea.map((a) => a.appUserId).filter((id): id is string => !!id))];
  if (ids.length === 0) return idPorArea.map(({ area }) => ({ area, nomeVios: null }));

  const [{ data: usuarios }, rh] = await Promise.all([
    supabase.from("app_users").select("id, auth_user_id, full_name").in("id", ids),
    getOrqestraiColaboradoresLocal(supabase),
  ]);
  const nomePorId = new Map<string, string>();
  await Promise.all(
    (usuarios ?? []).map(async (u) => {
      let email: string | null = null;
      if (u.auth_user_id) {
        const { data } = await supabase.auth.admin.getUserById(String(u.auth_user_id));
        email = data?.user?.email ?? null;
      }
      nomePorId.set(String(u.id), nomeNoVios({ fullName: String(u.full_name ?? ""), email }, rh));
    }),
  );
  return idPorArea.map(({ area, appUserId }) => ({
    area,
    nomeVios: appUserId ? (nomePorId.get(appUserId) ?? null) : null,
  }));
}

/**
 * Pede ao robô do SAMA a abertura no VIOS (pessoa, pasta e tarefas) do lead com DUE. O CRM só manda
 * o pedido: o resultado fica no SAMA e não volta para o lead. Nunca lança — o cadastro e a edição do
 * lead não dependem do robô. A chave é uma por oportunidade, então chamar de novo não duplica nada.
 */
export async function solicitarAberturaVios(
  supabase: SupabaseClient,
  oportunidadeId: string,
  deps: Dependencias = {},
): Promise<ResultadoAberturaVios> {
  const modo = deps.modo ?? viosAberturaModo();
  if (modo === "desligado") return { status: "desligado" };

  try {
    const [{ data: op, error: opErr }, { data: intake, error: intakeErr }] = await Promise.all([
      supabase.from("oportunidades").select("havera_due_diligence").eq("id", oportunidadeId).maybeSingle(),
      supabase
        .from("lead_intakes")
        .select(
          "due_diligence, empresas_json, areas_analise, data_entrega_due, horario_entrega_due, local_reuniao, data_reuniao, horario_reuniao, tipo_lead, tipo_indicacao, nome_indicacao, plataforma",
        )
        .eq("oportunidade_id", oportunidadeId)
        .maybeSingle(),
    ]);
    if (opErr) throw opErr;
    if (intakeErr) throw intakeErr;
    if (!intake) return { status: "pulado", motivo: "Lead sem cadastro inicial no CRM." };
    if (!op?.havera_due_diligence && !intake.due_diligence) return { status: "sem_due" };

    const areas = [
      ...new Set(
        (Array.isArray(intake.areas_analise) ? intake.areas_analise : [])
          .map((a) => normalizePracticeAreaKey(String(a)))
          .filter(Boolean),
      ),
    ];
    const montagem = buildViosAberturaPedido({
      oportunidadeId,
      crmUrl: buildLeadDetailUrl(oportunidadeId),
      modo,
      hojeYmd: deps.hojeYmd ?? saoPauloDateYmd(),
      responsavelPasta:
        process.env.VIOS_ABERTURA_RESPONSAVEL_PASTA?.trim() || VIOS_ABERTURA_PADRAO.responsavelPasta,
      intake: {
        empresas: empresasDoIntake(intake.empresas_json),
        areas_analise: areas,
        data_entrega_due: intake.data_entrega_due ?? null,
        horario_entrega_due: intake.horario_entrega_due ?? null,
        local_reuniao: intake.local_reuniao ?? null,
        data_reuniao: intake.data_reuniao ?? null,
        horario_reuniao: intake.horario_reuniao ?? null,
        tipo_lead: intake.tipo_lead ?? null,
        tipo_indicacao: intake.tipo_indicacao ?? null,
        nome_indicacao: intake.nome_indicacao ?? null,
        plataforma: intake.plataforma ?? null,
      },
      responsaveis: await responsaveisPorArea(supabase, oportunidadeId, areas),
    });
    if (!montagem.ok) {
      console.warn("[vios-abertura] pedido não enviado", { oportunidadeId, motivo: montagem.motivo });
      return { status: "pulado", motivo: montagem.motivo };
    }

    const enfileirar =
      deps.enfileirar ?? ((pedido: ViosAberturaPedido) => SamaRpaClient.fromEnv().enfileirar(pedido));
    const { duplicado } = await enfileirar(montagem.pedido);
    if (montagem.avisos.length > 0) {
      console.warn("[vios-abertura] pedido enviado com avisos", { oportunidadeId, avisos: montagem.avisos });
    }
    return { status: duplicado ? "duplicado" : "enviado", avisos: montagem.avisos };
  } catch (error) {
    const ref = logServerError("vios-abertura", error, { oportunidadeId, modo });
    return {
      status: "erro",
      mensagem: `${publicErrorMessage(error, "Falha ao pedir a abertura no VIOS.")} (ref ${ref})`,
    };
  }
}
