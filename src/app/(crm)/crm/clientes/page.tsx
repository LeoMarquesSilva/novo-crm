import Link from "next/link";
import { Building2 } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { CarteiraSyncButton } from "@/components/crm/carteira-sync-button";
import { CarteiraGruposTable, type CarteiraGrupoRow } from "@/components/crm/carteira-grupos-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/server";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { fetchOrqestraiClientGroups } from "@/lib/orqestrai/client-groups";
import { fetchGruposEconomicosCarteira } from "@/lib/crm/fetch-grupos-economicos";
import {
  classifyCarteiraGrupoMembro,
  type CarteiraGrupoMembro,
} from "@/lib/crm/carteira-grupo-membros";
import {
  buildClienteResponsibleAreaIndex,
  legacyCategoriaAsResponsibleArea,
  lookupClienteResponsibleArea,
  origemLinhaFromGrupoCategoria,
} from "@/lib/crm/grupo-categoria";
import {
  buildClienteAtividadeIndex,
  lookupClienteAtividade,
} from "@/lib/orqestrai/gestor-atividade";

export const dynamic = "force-dynamic";

function formatSyncedAt(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function fetchAllClientes(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const pageSize = 1000;
  const rows: Array<{
    id: string;
    razao_social: string;
    documento: string;
    email_principal: string | null;
    telefone_principal: string | null;
    grupo_id: string | null;
    tipo: string | null;
    orqestrai_company_id: string | null;
    orqestrai_person_id: string | null;
  }> = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("clientes")
      .select(
        "id, razao_social, documento, email_principal, telefone_principal, grupo_id, tipo, orqestrai_company_id, orqestrai_person_id",
      )
      .order("razao_social")
      .range(from, to);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }
  return { data: rows, error: null };
}

export default async function ClientesPage() {
  const { profile } = await requireAuth("/crm/clientes");
  const supabase = createSupabaseAdminClient();
  const [
    { data: grupos, error: gruposError },
    { data: clientes, error: clientesError },
    { data: titulos },
    orqestraiGroups,
  ] = await Promise.all([
    fetchGruposEconomicosCarteira(supabase),
    fetchAllClientes(supabase),
    supabase.from("grupo_titulos_resumo").select("grupo_id, titulos_abertos, titulos_pagos, valor_aberto"),
    fetchOrqestraiClientGroups().catch(() => null),
  ]);

  const titleByGroup = new Map((titulos ?? []).map((row) => [row.grupo_id, row]));
  const peopleByGroup = new Map<string, number>();
  const membrosByGroup = new Map<string, CarteiraGrupoMembro[]>();
  let fromOrqestrai = 0;
  for (const cliente of clientes ?? []) {
    if (cliente.orqestrai_company_id || cliente.orqestrai_person_id) fromOrqestrai += 1;
    const grupoId = cliente.grupo_id ?? "__sem_grupo__";
    peopleByGroup.set(grupoId, (peopleByGroup.get(grupoId) ?? 0) + 1);
    if (!cliente.grupo_id) continue;
    const membros = membrosByGroup.get(cliente.grupo_id) ?? [];
    membros.push({
      id: cliente.id,
      nome: cliente.razao_social,
      documento: cliente.documento,
      email: cliente.email_principal,
      telefone: cliente.telefone_principal,
      kind: classifyCarteiraGrupoMembro({
        tipo: cliente.tipo,
        documento: cliente.documento,
        orqestraiCompanyId: cliente.orqestrai_company_id,
        orqestraiPersonId: cliente.orqestrai_person_id,
      }),
    });
    membrosByGroup.set(cliente.grupo_id, membros);
  }

  const error = gruposError?.message ?? clientesError?.message ?? null;
  const groups = grupos ?? [];
  const atividadeIndex = buildClienteAtividadeIndex(orqestraiGroups ?? []);
  const responsibleAreaIndex = buildClienteResponsibleAreaIndex(orqestraiGroups ?? []);
  const groupStatus = groups.map((grupo) =>
    lookupClienteAtividade(atividadeIndex, {
      orqestraiId: grupo.orqestrai_id ?? grupo.id,
      groupKey: grupo.chave_estavel,
    }),
  );
  const ativos = groupStatus.filter((status) => status === "ativo").length;
  const inativos = groupStatus.filter((status) => status === "inativo").length;
  const lastSyncedAt = formatSyncedAt(
    groups.reduce<string | null>((latest, grupo) => {
      if (!grupo.last_synced_at) return latest;
      if (!latest || grupo.last_synced_at > latest) return grupo.last_synced_at;
      return latest;
    }, null),
  );
  const canConfigure = canAccessContractCapability({ role: profile.role, capability: "configure" });
  const canIssueLinks = canConfigure || profile.role === "comercial";
  const tableRows: CarteiraGrupoRow[] = groups.map((grupo, index) => {
    const summary = titleByGroup.get(grupo.id);
    return {
      id: grupo.id,
      nome: grupo.nome,
      clienteStatus: groupStatus[index],
      origemLinha: origemLinhaFromGrupoCategoria(grupo.categoria),
      responsibleArea:
        lookupClienteResponsibleArea(responsibleAreaIndex, {
          orqestraiId: grupo.orqestrai_id ?? grupo.id,
          groupKey: grupo.chave_estavel,
        }) ?? legacyCategoriaAsResponsibleArea(grupo.categoria),
      pessoas: peopleByGroup.get(grupo.id) ?? 0,
      titulosAbertos: summary?.titulos_abertos ?? 0,
      titulosPagos: summary?.titulos_pagos ?? 0,
      valorAberto: summary?.valor_aberto != null ? Number(summary.valor_aberto) : null,
      tipoLead: grupo.tipo_lead,
      tipoIndicacao: grupo.tipo_indicacao,
      nomeIndicacao: grupo.nome_indicacao,
      areasAtuacao: grupo.areas_atuacao,
      membros: membrosByGroup.get(grupo.id) ?? [],
    };
  });

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Base comercial"
        title="Cadastro único de clientes"
        description={
          lastSyncedAt
            ? `Última sync do OrquestrAI em ${lastSyncedAt}. Categoria é Cliente ou Lead (hoje só Cliente). Status Ativo/Inativo vem de gestor_atividade. Áreas são a atuação jurídica (OrquestrAI responsible_area ∪ SIOE). Títulos ABERTO/PAGO vêm do SIOE. Indicação vem do preenchimento público ou da edição no modal.`
            : "Grupos econômicos do OrquestrAI. Categoria é Cliente ou Lead (hoje só Cliente). Status é Cliente ativo ou inativo (gestor_atividade). Áreas são a atuação jurídica (responsible_area ∪ SIOE). Títulos ABERTO/PAGO vêm do SIOE. Indicação vem do preenchimento público ou da edição no modal."
        }
        icon={Building2}
        stats={[
          { label: "Grupos no CRM", value: groups.length, detail: "email_client_groups" },
          { label: "Pessoas/CNPJs", value: fromOrqestrai, detail: "vieram do OrquestrAI" },
          { label: "Clientes ativos", value: ativos, detail: "gestor_atividade no OrquestrAI" },
          { label: "Clientes inativos", value: inativos, detail: "gestor_atividade no OrquestrAI" },
        ]}
        actions={
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {canConfigure ? <CarteiraSyncButton /> : null}
            {canConfigure ? (
              <Link
                href="/crm/contratos/importacao"
                className="text-sm font-medium text-interactive-700 underline-offset-4 hover:underline"
              >
                Importar contratos
              </Link>
            ) : null}
          </div>
        }
      />

      <Card className="p-6">
        <CardHeader>
          <CardTitle className="text-v2-heading-lg">
            {groups.length} grupos econômicos no CRM
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">Não foi possível carregar a carteira: {error}</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum grupo sincronizado. Use “Sincronizar OrquestrAI” no topo da página.
            </p>
          ) : (
            <CarteiraGruposTable
              groups={tableRows}
              canIssueLinks={canIssueLinks}
              canEdit={canConfigure}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
