import Link from "next/link";
import { Building2 } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { CarteiraSyncButton } from "@/components/crm/carteira-sync-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/server";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { centsToMaskedBrl } from "@/components/crm/contracts/contract-setup-form-helpers";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Database["public"]["Enums"]["grupo_carteira_status"], string> = {
  ativo_aberto: "Títulos em aberto",
  ativo_pago: "Títulos pagos",
  inativo: "Sem título SIOE",
};

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
  const [{ data: grupos, error: gruposError }, { data: clientes, error: clientesError }, { data: titulos }] =
    await Promise.all([
      supabase.from("grupos_economicos").select("id, nome, status, last_synced_at").order("nome"),
      fetchAllClientes(supabase),
      supabase.from("grupo_titulos_resumo").select("grupo_id, titulos_abertos, titulos_pagos, valor_aberto"),
    ]);

  const titleByGroup = new Map((titulos ?? []).map((row) => [row.grupo_id, row]));
  const peopleByGroup = new Map<string, number>();
  let fromOrqestrai = 0;
  for (const cliente of clientes ?? []) {
    if (cliente.orqestrai_company_id || cliente.orqestrai_person_id) fromOrqestrai += 1;
    const grupoId = cliente.grupo_id ?? "__sem_grupo__";
    peopleByGroup.set(grupoId, (peopleByGroup.get(grupoId) ?? 0) + 1);
  }

  const error = gruposError?.message ?? clientesError?.message ?? null;
  const groups = grupos ?? [];
  const abertos = groups.filter((grupo) => grupo.status === "ativo_aberto").length;
  const pagos = groups.filter((grupo) => grupo.status === "ativo_pago").length;
  const inativos = groups.filter((grupo) => grupo.status === "inativo").length;
  const lastSyncedAt = formatSyncedAt(
    groups.reduce<string | null>((latest, grupo) => {
      if (!grupo.last_synced_at) return latest;
      if (!latest || grupo.last_synced_at > latest) return grupo.last_synced_at;
      return latest;
    }, null),
  );
  const canConfigure = canAccessContractCapability({ role: profile.role, capability: "configure" });

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Base comercial"
        title="Cadastro único de clientes"
        description={
          lastSyncedAt
            ? `Última sync do OrquestrAI em ${lastSyncedAt}. Títulos ABERTO/PAGO vêm do SIOE.`
            : "Grupos econômicos do OrquestrAI, pessoas/CNPJs e sinal de títulos em aberto ou pagos no SIOE."
        }
        icon={Building2}
        stats={[
          { label: "Grupos no CRM", value: groups.length, detail: "email_client_groups" },
          { label: "Pessoas/CNPJs", value: fromOrqestrai, detail: "vieram do OrquestrAI" },
          { label: "Em aberto", value: abertos, detail: "título SIOE ABERTO" },
          { label: "Pagos", value: pagos, detail: "só título PAGO" },
          { label: "Sem título", value: inativos, detail: "grupo inativo no SIOE" },
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Pessoas</TableHead>
                  <TableHead className="text-right">Abertos</TableHead>
                  <TableHead className="text-right">Pagos</TableHead>
                  <TableHead className="text-right">Valor aberto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((grupo) => {
                  const summary = titleByGroup.get(grupo.id);
                  return (
                    <TableRow key={grupo.id}>
                      <TableCell className="font-medium">{grupo.nome}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{statusLabel[grupo.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {peopleByGroup.get(grupo.id) ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {summary?.titulos_abertos ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{summary?.titulos_pagos ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {summary?.valor_aberto
                          ? centsToMaskedBrl(Math.round(Number(summary.valor_aberto) * 100))
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
