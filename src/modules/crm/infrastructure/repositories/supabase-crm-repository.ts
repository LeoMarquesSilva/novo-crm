import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Indicador, Oportunidade } from "@/modules/crm/domain/entities";
import type { CrmRepository } from "@/modules/crm/infrastructure/repositories/crm-repository";
import type { SupabaseClient } from "@supabase/supabase-js";

export class SupabaseCrmRepository implements CrmRepository {
  private readonly supabase: SupabaseClient<Database>;

  constructor(client?: SupabaseClient<Database>) {
    this.supabase = client ?? createSupabaseAdminClient();
  }

  async countOportunidades(): Promise<number> {
    const { count, error } = await this.supabase
      .from("oportunidades")
      .select("*", { count: "exact", head: true });

    if (error) throw error;
    return count ?? 0;
  }

  async countClientes(): Promise<number> {
    const { count, error } = await this.supabase
      .from("clientes")
      .select("*", { count: "exact", head: true });

    if (error) throw error;
    return count ?? 0;
  }

  async countContratos(): Promise<number> {
    const { count, error } = await this.supabase
      .from("contratos")
      .select("*", { count: "exact", head: true });

    if (error) throw error;
    return count ?? 0;
  }

  async countIndicadoresPendentes(): Promise<number> {
    const { count, error } = await this.supabase
      .from("indicadores")
      .select("*", { count: "exact", head: true })
      .eq("status", "pendente_aprovacao");

    if (error) throw error;
    return count ?? 0;
  }

  async listIndicadoresPendentes(): Promise<Indicador[]> {
    const { data, error } = await this.supabase
      .from("indicadores")
      .select("id, nome, status, criado_em")
      .eq("status", "pendente_aprovacao")
      .order("criado_em", { ascending: false });

    if (error) throw error;
    const indicators = data ?? [];
    if (indicators.length === 0) return [];

    const indicatorNames = indicators.map((row) => row.nome);
    const { data: opportunities, error: opportunitiesError } = await this.supabase
      .from("oportunidades")
      .select("id, indicador_nome_digitado, solicitante_nome, created_at, criado_por")
      .in("indicador_nome_digitado", indicatorNames)
      .order("created_at", { ascending: false });

    if (opportunitiesError) throw opportunitiesError;

    const opportunityByIndicator = new Map<
      string,
      {
        id: string;
        solicitante_nome: string;
        created_at: string;
        criado_por: string | null;
      }
    >();

    for (const row of opportunities ?? []) {
      if (!row.indicador_nome_digitado) continue;
      if (!opportunityByIndicator.has(row.indicador_nome_digitado)) {
        opportunityByIndicator.set(row.indicador_nome_digitado, {
          id: row.id,
          solicitante_nome: row.solicitante_nome,
          created_at: row.created_at,
          criado_por: row.criado_por,
        });
      }
    }

    const creatorIds = Array.from(new Set((opportunities ?? []).map((row) => row.criado_por).filter(Boolean)));
    const creatorsById = new Map<string, string>();
    if (creatorIds.length > 0) {
      const { data: creators, error: creatorsError } = await this.supabase
        .from("app_users")
        .select("id, full_name")
        .in("id", creatorIds as string[]);
      if (creatorsError) throw creatorsError;
      for (const creator of creators ?? []) {
        creatorsById.set(creator.id, creator.full_name);
      }
    }

    return indicators.map((row) => {
      const linkedOpportunity = opportunityByIndicator.get(row.nome);
      return {
        id: row.id,
        nome: row.nome,
        status: row.status,
        leadNome: linkedOpportunity?.solicitante_nome ?? null,
        solicitanteNome: linkedOpportunity?.criado_por
          ? creatorsById.get(linkedOpportunity.criado_por) ?? null
          : null,
        solicitadoEm: linkedOpportunity?.created_at ?? row.criado_em ?? null,
        oportunidadeId: linkedOpportunity?.id ?? null,
      };
    });
  }

  /** Contagem de oportunidades por etapa (dados reais do banco). */
  async getOportunidadesCountByEtapa(): Promise<Partial<Record<Oportunidade["etapa"], number>>> {
    const { data, error } = await this.supabase.from("oportunidades").select("etapa");

    if (error) throw error;

    const counts: Partial<Record<Oportunidade["etapa"], number>> = {};
    for (const row of data ?? []) {
      const etapa = row.etapa as Oportunidade["etapa"];
      counts[etapa] = (counts[etapa] ?? 0) + 1;
    }
    return counts;
  }
}
