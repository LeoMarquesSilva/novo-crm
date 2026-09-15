import { NextRequest, NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import {
  fetchAppUsersByEmailLookup,
  resolveSolicitanteInternoDisplay,
} from "@/lib/crm/resolve-app-user-display";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const OPPORTUNITY_SELECT =
  "id, solicitante_nome, solicitante_email, etapa, tipo, havera_due_diligence, encerramento, updated_at";

type SearchOpportunityRow = {
  id: string;
  solicitante_nome: string;
  solicitante_email: string | null;
  etapa: string;
  tipo: string;
  havera_due_diligence: boolean;
  encerramento: string | null;
  updated_at: string;
};

function ilikeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 120) ?? "";
    if (query.length < 2) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const supabase = createSupabaseAdminClient();
    const pattern = ilikeContains(query);
    const [nameResult, emailResult, intakeResult, idResult] = await Promise.all([
      supabase
        .from("oportunidades")
        .select(OPPORTUNITY_SELECT)
        .ilike("solicitante_nome", pattern)
        .order("updated_at", { ascending: false })
        .limit(16),
      supabase
        .from("oportunidades")
        .select(OPPORTUNITY_SELECT)
        .ilike("solicitante_email", pattern)
        .order("updated_at", { ascending: false })
        .limit(16),
      supabase
        .from("lead_intakes")
        .select("oportunidade_id, solicitante_nome")
        .ilike("solicitante_nome", pattern)
        .limit(16),
      isUuid(query)
        ? supabase
            .from("oportunidades")
            .select(OPPORTUNITY_SELECT)
            .eq("id", query)
            .limit(1)
        : Promise.resolve({ data: [] as SearchOpportunityRow[], error: null }),
    ]);

    const firstError =
      nameResult.error ?? emailResult.error ?? intakeResult.error ?? idResult.error;
    if (firstError) throw firstError;

    const rowsById = new Map<string, SearchOpportunityRow>();
    for (const row of [
      ...(nameResult.data ?? []),
      ...(emailResult.data ?? []),
      ...(idResult.data ?? []),
    ]) {
      rowsById.set(row.id, row as SearchOpportunityRow);
    }

    const requesterNameByOpportunityId = new Map<string, string>();
    for (const row of intakeResult.data ?? []) {
      const opportunityId = String(row.oportunidade_id);
      const requesterName = row.solicitante_nome?.trim();
      if (requesterName) {
        requesterNameByOpportunityId.set(opportunityId, requesterName);
      }
    }

    const missingIds = [...requesterNameByOpportunityId.keys()].filter(
      (id) => !rowsById.has(id),
    );
    if (missingIds.length > 0) {
      const { data: missingRows, error: missingError } = await supabase
        .from("oportunidades")
        .select(OPPORTUNITY_SELECT)
        .in("id", missingIds);
      if (missingError) throw missingError;
      for (const row of missingRows ?? []) {
        rowsById.set(row.id, row as SearchOpportunityRow);
      }
    }

    const matchedRows = [...rowsById.values()]
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
      .slice(0, 12);

    if (matchedRows.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const [{ data: requesterRows, error: requesterError }, usersByEmail] =
      await Promise.all([
        supabase
          .from("lead_intakes")
          .select("oportunidade_id, solicitante_nome")
          .in(
            "oportunidade_id",
            matchedRows.map((row) => row.id),
          ),
        fetchAppUsersByEmailLookup(supabase),
      ]);
    if (requesterError) throw requesterError;

    for (const row of requesterRows ?? []) {
      const requesterName = row.solicitante_nome?.trim();
      if (requesterName) {
        requesterNameByOpportunityId.set(String(row.oportunidade_id), requesterName);
      }
    }

    const data = matchedRows.map((row) => {
      const requester = resolveSolicitanteInternoDisplay({
        nomeCadastro: requesterNameByOpportunityId.get(row.id),
        solicitanteEmail: row.solicitante_email,
        usersByEmail,
      });

      return {
        id: row.id,
        title: row.solicitante_nome,
        requesterEmail: row.solicitante_email,
        requesterName: requester.nome === "—" ? null : requester.nome,
        requesterAvatarUrl: requester.avatarUrl,
        stage: row.etapa,
        type: row.tipo,
        hasDueDiligence: row.havera_due_diligence,
        closingStatus:
          row.encerramento === "ganho" || row.encerramento === "perdido"
            ? row.encerramento
            : null,
        updatedAt: row.updated_at,
      };
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível pesquisar os leads.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
