import type { SupabaseClient } from "@supabase/supabase-js";
import { RD_PIPELINE_STAGE_MAP as STAGE_MAP } from "@/lib/crm/rd-pipeline-stage-from-reconciliation";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

type OpportunityStage = Database["public"]["Enums"]["opportunity_stage"];
type DemandType = Database["public"]["Enums"]["demand_type"];

const RD_CRM_BASE_URL = "https://crm.rdstation.com";
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGES = 500;

export interface RdDealRecord {
  id: string;
  title: string;
  stage: OpportunityStage;
  updatedAt: string;
}

export interface RdImportResult {
  imported: number;
  skipped: number;
  importedDeals: number;
  importedLeads: number;
  failed: number;
  records: RdDealRecord[];
}

interface SyncContext {
  source: "import" | "webhook";
  importBatchId: string | null;
}

export class RdImportConnector {
  constructor(private readonly token: string) {}

  async importDeals(year = 2026): Promise<RdImportResult> {
    this.assertToken();
    const supabase = createSupabaseAdminClient();
    const batchId = await this.startBatch(supabase, year);
    const context: SyncContext = { source: "import", importBatchId: batchId };

    let importedDeals = 0;
    let importedLeads = 0;
    let skipped = 0;
    let failed = 0;
    const records: RdDealRecord[] = [];

    try {
      const [rawDeals, rawContacts] = await Promise.all([
        this.fetchPaginated("deals"),
        this.fetchPaginated("contacts"),
      ]);

      /** Incluir negócios criados OU atualizados no ano (ex.: lead antigo ainda no funil em 2026). */
      const deals = rawDeals.filter((deal) => this.isInYearWindow(deal, year));
      const contacts = rawContacts.filter((contact) => this.isInYearWindow(contact, year));

      for (const deal of deals) {
        try {
          const entry = await this.syncDeal(supabase, deal, context);
          if (entry) {
            importedDeals += 1;
            records.push(entry);
          } else {
            skipped += 1;
          }
        } catch {
          failed += 1;
        }
      }

      for (const contact of contacts) {
        try {
          const persisted = await this.syncLeadContact(supabase, contact, context);
          if (persisted) {
            importedLeads += 1;
          } else {
            skipped += 1;
          }
        } catch {
          failed += 1;
        }
      }

      await this.finishBatch(supabase, batchId, {
        processed: deals.length + contacts.length,
        success: importedDeals + importedLeads,
        errors: failed,
      });
    } catch (error) {
      await this.failBatch(supabase, batchId);
      throw error;
    }

    return {
      imported: importedDeals + importedLeads,
      skipped,
      importedDeals,
      importedLeads,
      failed,
      records,
    };
  }

  async syncWebhookPayload(payload: unknown): Promise<RdImportResult> {
    this.assertToken();
    const supabase = createSupabaseAdminClient();
    const context: SyncContext = { source: "webhook", importBatchId: null };

    const event = this.extractString(payload, ["event_name", "event"]);
    const document = this.extractObject(payload, ["document", "deal", "data"]);
    if (!event || !document) {
      throw new Error("Payload de webhook do RD inválido.");
    }

    let importedDeals = 0;
    let importedLeads = 0;
    const records: RdDealRecord[] = [];

    if (event.includes("deal")) {
      const dealRecord = await this.syncDeal(supabase, document, context);
      if (dealRecord) {
        importedDeals += 1;
        records.push(dealRecord);
      }
    }

    if (event.includes("contact")) {
      const persistedLead = await this.syncLeadContact(supabase, document, context);
      if (persistedLead) {
        importedLeads += 1;
      }
    }

    return {
      imported: importedDeals + importedLeads,
      skipped: 0,
      importedDeals,
      importedLeads,
      failed: 0,
      records,
    };
  }

  private assertToken() {
    if (!this.token) {
      throw new Error("RD token não configurado.");
    }
  }

  private async fetchPaginated(resource: "deals" | "contacts"): Promise<Record<string, unknown>[]> {
    const allItems: Record<string, unknown>[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const json = await this.rdRequest(`/api/v1/${resource}`, {
        page: String(page),
        limit: String(DEFAULT_PAGE_SIZE),
        order: "created_at",
        direction: "asc",
      });

      const pageItems = this.extractCollection(json, resource);
      if (!pageItems.length) {
        break;
      }

      allItems.push(...pageItems);
      const hasMore = this.hasMorePages(json, page, pageItems.length);
      if (!hasMore) {
        break;
      }
    }

    return allItems;
  }

  private async rdRequest(
    path: string,
    query: Record<string, string>,
  ): Promise<Record<string, unknown> | unknown[]> {
    const url = new URL(`${RD_CRM_BASE_URL}${path}`);
    url.searchParams.set("token", this.token);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Falha na API do RD (${response.status}): ${body.slice(0, 300) || "sem detalhes"}`,
      );
    }

    return (await response.json()) as Record<string, unknown> | unknown[];
  }

  private extractCollection(
    payload: Record<string, unknown> | unknown[],
    resource: "deals" | "contacts",
  ): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter(this.isObject);
    }

    const keys = resource === "deals" ? ["deals", "data", "results"] : ["contacts", "data", "results"];
    for (const key of keys) {
      const candidate = payload[key];
      if (Array.isArray(candidate)) {
        return candidate.filter(this.isObject);
      }
    }

    return [];
  }

  private hasMorePages(
    payload: Record<string, unknown> | unknown[],
    page: number,
    pageLength: number,
  ): boolean {
    if (Array.isArray(payload)) {
      return pageLength >= DEFAULT_PAGE_SIZE;
    }

    const hasMore = payload.has_more;
    if (typeof hasMore === "boolean") {
      return hasMore;
    }

    const pagination = payload.pagination;
    if (this.isObject(pagination)) {
      const totalPages = pagination.total_pages;
      if (typeof totalPages === "number") {
        return page < totalPages;
      }
    }

    const totalPages = payload.total_pages;
    if (typeof totalPages === "number") {
      return page < totalPages;
    }

    return pageLength >= DEFAULT_PAGE_SIZE;
  }

  private async syncDeal(
    supabase: SupabaseClient<Database>,
    deal: Record<string, unknown>,
    context: SyncContext,
  ): Promise<RdDealRecord | null> {
    const rdDealId = this.extractString(deal, ["id", "_id", "deal_id"]);
    if (!rdDealId) {
      return null;
    }

    const leadData = this.extractLeadFromDeal(deal);
    const dealTitle =
      this.extractString(deal, ["title", "name"]) ??
      leadData.name ??
      `Negociação ${rdDealId}`;
    const dueDiligence = this.extractDueDiligence(deal);
    const mappedStage = this.mapStage(deal);
    let stage = this.resolveInitialPipelineStage(
      mappedStage.stage,
      dueDiligence,
      mappedStage.isExplicitCadastroLead,
    );

    const encerramentoRd = this.resolveRdCommercialEncerramentoFromPayload(deal);
    if (encerramentoRd === "perdido" && stage === "cadastro_lead") {
      stage = "reuniao";
    }
    if (encerramentoRd === "ganho" && stage === "cadastro_lead") {
      stage = "contrato_assinado";
    }

    const clienteId = await this.upsertCliente(supabase, {
      dealId: rdDealId,
      name: leadData.name ?? dealTitle,
      email: leadData.email,
      phone: leadData.phone,
      document: leadData.document,
    });

    const opportunityId = await this.upsertOpportunity(supabase, {
      dealId: rdDealId,
      clienteId,
      title: dealTitle,
      stage,
      leadName: dealTitle,
      leadEmail: leadData.email,
      dueDiligence,
      demandType: this.inferDemandType(dealTitle),
      encerramentoRd,
    });

    const status = context.source === "webhook" ? "deal_atualizado" : "deal_importado";
    await this.upsertReconciliation(supabase, {
      rdId: rdDealId,
      status,
      opportunityId,
      importBatchId: context.importBatchId,
      details: {
        source: context.source,
        deal,
        lead: leadData,
      },
    });

    return {
      id: rdDealId,
      title: dealTitle,
      stage,
      updatedAt:
        this.extractString(deal, ["updated_at", "updatedAt"]) ?? new Date().toISOString(),
    };
  }

  private async syncLeadContact(
    supabase: SupabaseClient<Database>,
    contact: Record<string, unknown>,
    context: SyncContext,
  ): Promise<boolean> {
    const rdLeadId = this.extractString(contact, ["id", "_id", "contact_id"]);
    if (!rdLeadId) {
      return false;
    }

    const leadName = this.extractString(contact, ["name", "title"]) ?? `Lead ${rdLeadId}`;
    const leadEmail = this.extractFirstEmail(contact);
    const leadPhone = this.extractFirstPhone(contact);
    const leadDocument = this.extractDocument(contact);

    await this.upsertCliente(supabase, {
      dealId: `lead_${rdLeadId}`,
      name: leadName,
      email: leadEmail,
      phone: leadPhone,
      document: leadDocument,
    });

    const status = context.source === "webhook" ? "lead_atualizado" : "lead_importado";
    await this.upsertReconciliation(supabase, {
      rdId: `lead_${rdLeadId}`,
      status,
      opportunityId: null,
      importBatchId: context.importBatchId,
      details: {
        source: context.source,
        lead: contact,
      },
    });

    return true;
  }

  private async upsertOpportunity(
    supabase: SupabaseClient<Database>,
    input: {
      dealId: string;
      clienteId: string | null;
      title: string;
      stage: OpportunityStage;
      leadName: string;
      leadEmail: string | null;
      dueDiligence: boolean;
      demandType: DemandType;
      /** `undefined` = não alterar; `null` = limpar (ex.: RD voltou a aberto); valor = gravar. */
      encerramentoRd: "ganho" | "perdido" | null | undefined;
    },
  ): Promise<string> {
    const { data: reconciliation, error: reconciliationError } = await supabase
      .from("rd_deal_reconciliacao")
      .select("oportunidade_id")
      .eq("rd_deal_id", input.dealId)
      .maybeSingle();

    if (reconciliationError) {
      throw reconciliationError;
    }

    const existingOpportunityId = reconciliation?.oportunidade_id;
    if (existingOpportunityId) {
      const { data: existing } = await supabase
        .from("oportunidades")
        .select("etapa")
        .eq("id", existingOpportunityId)
        .maybeSingle();

      const updateRow: Record<string, unknown> = {
        cliente_id: input.clienteId,
        tipo: input.demandType,
        etapa: input.stage,
        havera_due_diligence: input.dueDiligence,
        solicitante_nome: input.leadName,
        solicitante_email: input.leadEmail,
      };
      if (input.encerramentoRd !== undefined) {
        updateRow.encerramento = input.encerramentoRd;
      }

      const { error: updateError } = await supabase
        .from("oportunidades")
        .update(updateRow as Database["public"]["Tables"]["oportunidades"]["Update"])
        .eq("id", existingOpportunityId);

      if (updateError) {
        throw updateError;
      }

      if (existing && existing.etapa !== input.stage) {
        const now = new Date().toISOString();
        await supabase.from("transicoes_etapa").insert({
          oportunidade_id: existingOpportunityId,
          etapa_origem: existing.etapa,
          etapa_destino: input.stage,
          observacao: "Atualização automática via RD CRM",
        });
        await recordLeadActivityEvent(supabase, {
          oportunidadeId: existingOpportunityId,
          kind: "etapa_alterada",
          title: "Etapa alterada (RD Station)",
          detail: `${existing.etapa} → ${input.stage}`,
          etapa: input.stage,
          sourceId: `rd-sync:${existingOpportunityId}:${input.stage}:${now}`,
          metadata: { from: existing.etapa, to: input.stage, source: "rd_crm" },
        });
      }

      return existingOpportunityId;
    }

    const { data: created, error: createError } = await supabase
      .from("oportunidades")
      .insert({
        cliente_id: input.clienteId,
        tipo: input.demandType,
        etapa: input.stage,
        havera_due_diligence: input.dueDiligence,
        solicitante_nome: input.leadName,
        solicitante_email: input.leadEmail,
        ...(input.encerramentoRd !== undefined
          ? { encerramento: input.encerramentoRd }
          : {}),
      })
      .select("id")
      .single();

    if (createError || !created) {
      throw createError ?? new Error("Não foi possível criar oportunidade.");
    }

    return created.id;
  }

  private async upsertCliente(
    supabase: SupabaseClient<Database>,
    input: {
      dealId: string;
      name: string;
      email: string | null;
      phone: string | null;
      document: string | null;
    },
  ): Promise<string | null> {
    const normalizedDocument = this.normalizeDocument(input.document, input.dealId);
    const safeEmail = input.email ?? `sem-email+${input.dealId}@rd-import.local`;

    const { data: existing, error: lookupError } = await supabase
      .from("clientes")
      .select("id")
      .eq("documento", normalizedDocument)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("clientes")
        .update({
          razao_social: input.name,
          email_principal: safeEmail,
          telefone_principal: input.phone,
        })
        .eq("id", existing.id);

      if (updateError) {
        throw updateError;
      }

      return existing.id;
    }

    const { data: created, error: createError } = await supabase
      .from("clientes")
      .insert({
        razao_social: input.name,
        documento: normalizedDocument,
        email_principal: safeEmail,
        telefone_principal: input.phone,
      })
      .select("id")
      .single();

    if (createError || !created) {
      throw createError ?? new Error("Não foi possível criar cliente.");
    }

    return created.id;
  }

  private async upsertReconciliation(
    supabase: SupabaseClient<Database>,
    input: {
      rdId: string;
      status: string;
      opportunityId: string | null;
      importBatchId: string | null;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    const { error } = await supabase.from("rd_deal_reconciliacao").upsert(
      {
        rd_deal_id: input.rdId,
        status: input.status,
        oportunidade_id: input.opportunityId,
        import_batch_id: input.importBatchId,
        detalhes: input.details as Json,
        reconciled_at: new Date().toISOString(),
      },
      { onConflict: "rd_deal_id" },
    );

    if (error) {
      throw error;
    }
  }

  private async startBatch(
    supabase: SupabaseClient<Database>,
    year: number,
  ): Promise<string> {
    const { data, error } = await supabase
      .from("import_batches")
      .insert({
        source: `rd_crm_${year}`,
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      throw error ?? new Error("Não foi possível iniciar o batch de importação.");
    }

    return data.id;
  }

  private async finishBatch(
    supabase: SupabaseClient<Database>,
    batchId: string,
    counters: { processed: number; success: number; errors: number },
  ): Promise<void> {
    const { error } = await supabase
      .from("import_batches")
      .update({
        status: counters.errors > 0 ? "completed_with_errors" : "completed",
        processed_count: counters.processed,
        success_count: counters.success,
        error_count: counters.errors,
        finished_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (error) {
      throw error;
    }
  }

  private async failBatch(supabase: SupabaseClient<Database>, batchId: string): Promise<void> {
    await supabase
      .from("import_batches")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", batchId);
  }

  private isInYear(
    payload: Record<string, unknown>,
    year: number,
    dateKey: "created_at" | "updated_at" | "last_activity_at",
  ): boolean {
    const camel =
      dateKey === "last_activity_at"
        ? "lastActivityAt"
        : this.toCamelCase(dateKey);
    const isoDate = this.extractString(payload, [dateKey, camel]);
    if (!isoDate) {
      return false;
    }

    const date = new Date(isoDate);
    return Number.isFinite(date.getTime()) && date.getUTCFullYear() === year;
  }

  /**
   * Negócio/contato entra no lote do ano se qualquer data relevante cair nesse ano (UTC):
   * criação, última atualização do registro ou última atividade (campo do RD em deals).
   */
  private isInYearWindow(payload: Record<string, unknown>, year: number): boolean {
    return (
      this.isInYear(payload, year, "created_at") ||
      this.isInYear(payload, year, "updated_at") ||
      this.isInYear(payload, year, "last_activity_at")
    );
  }

  /**
   * Só avança de "cadastro_lead" para levantamento/reunião quando o RD de fato
   * devolveu a etapa de entrada comercial — nunca quando o mapa falhou (ex.: ID na raiz).
   */
  private resolveInitialPipelineStage(
    mapped: OpportunityStage,
    hasDueDiligence: boolean,
    isExplicitCadastroLead: boolean,
  ): OpportunityStage {
    if (mapped !== "cadastro_lead") {
      return mapped;
    }
    if (!isExplicitCadastroLead) {
      return mapped;
    }
    return hasDueDiligence ? "levantamento_dados" : "reuniao";
  }

  /** Remove sufixo de área do RD, ex.: " (SOLICITANTE)", " (FINANCEIRO)". */
  private stripRdStageAreaSuffix(label: string): string {
    return label.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  }

  /** `stage` na raiz costuma ser `deal_stage_id` (hex); não usar como nome legível. */
  private looksLikeRdInternalStageId(value: string): boolean {
    const t = value.trim();
    if (t.length === 24 && /^[a-f0-9]+$/i.test(t)) {
      return true;
    }
    return t.length >= 20 && /^[0-9a-f]+$/i.test(t);
  }

  /**
   * Nome exibido da etapa conforme API v1: objeto `deal_stage.name` é a fonte correta.
   * @see https://developers.rdstation.com/reference/crm-v1-list-deals
   */
  private extractRdStageDisplayLabel(deal: Record<string, unknown>): string | null {
    const dealStage = this.extractObject(deal, ["deal_stage"]);
    if (dealStage) {
      const name = this.extractString(dealStage, ["name"]);
      if (name?.trim()) {
        return name.trim();
      }
      const label = this.extractString(dealStage, ["label"]);
      if (label?.trim()) {
        return label.trim();
      }
      const nick = this.extractString(dealStage, ["nickname"]);
      if (nick && nick.trim().length > 2) {
        return nick.trim();
      }
    }

    const stageName = this.extractString(deal, ["stage_name", "stage_label"]);
    if (stageName?.trim()) {
      return stageName.trim();
    }

    const stageRoot = this.extractString(deal, ["stage", "stageName"]);
    if (stageRoot && !this.looksLikeRdInternalStageId(stageRoot)) {
      return stageRoot.trim();
    }

    return null;
  }

  /**
   * Resultado comercial no RD CRM v1 costuma vir em `rating` ("open" | "won" | "lost") ou em `state`.
   * Só devolve `undefined` quando o payload não indica resultado — assim não sobrescrevemos `encerramento`
   * manual no CRM em updates parciais (ex.: alguns webhooks).
   */
  private resolveRdCommercialEncerramentoFromPayload(
    deal: Record<string, unknown>,
  ): "ganho" | "perdido" | null | undefined {
    const winFlag = deal.win;
    if (winFlag === true) {
      return "ganho";
    }

    const hasLostReason =
      this.extractObject(deal, ["deal_lost_reason", "lost_reason", "dealLostReason"]) !== null;
    if (winFlag === false && hasLostReason) {
      return "perdido";
    }

    const tokens: string[] = [];

    const push = (value: string | null) => {
      if (value && value.trim()) {
        tokens.push(value.trim());
      }
    };

    push(this.extractString(deal, ["rating", "deal_rating", "commercial_rating"]));
    push(this.extractString(deal, ["state", "deal_state", "commercial_state"]));
    push(
      this.extractString(deal, [
        "status",
        "deal_status",
        "commercial_status",
        "deal_commercial_status",
      ]),
    );

    const dealStage = this.extractObject(deal, ["deal_stage"]);
    if (dealStage) {
      push(this.extractString(dealStage, ["rating", "state", "status"]));
    }

    for (const raw of tokens) {
      const n = this.normalizeText(raw);
      if (n === "lost" || n === "perdido" || n === "perdida" || n === "negocio_perdido") {
        return "perdido";
      }
      if (
        n === "won" ||
        n === "ganho" ||
        n === "ganha" ||
        n === "venda_ganha" ||
        n === "win" ||
        n === "closed_won"
      ) {
        return "ganho";
      }
    }

    const primaryOpenHint =
      this.extractString(deal, ["rating", "state", "deal_rating", "deal_state"])?.trim() ?? "";
    if (primaryOpenHint) {
      const n = this.normalizeText(primaryOpenHint);
      if (
        n === "open" ||
        n === "ongoing" ||
        n === "in_progress" ||
        n === "aberto" ||
        n === "em_aberto" ||
        n === "pending"
      ) {
        return null;
      }
    }

    return undefined;
  }

  private mapStage(deal: Record<string, unknown>): {
    stage: OpportunityStage;
    isExplicitCadastroLead: boolean;
  } {
    const rawLabel = this.extractRdStageDisplayLabel(deal);
    if (!rawLabel) {
      return { stage: "cadastro_lead", isExplicitCadastroLead: false };
    }

    const forMap = this.stripRdStageAreaSuffix(rawLabel);
    const normalizedStage = this.normalizeText(forMap.length > 0 ? forMap : rawLabel);
    const mapped =
      STAGE_MAP[normalizedStage] ?? STAGE_MAP[this.normalizeText(rawLabel)];
    if (mapped) {
      return {
        stage: mapped,
        isExplicitCadastroLead: mapped === "cadastro_lead",
      };
    }

    return { stage: "cadastro_lead", isExplicitCadastroLead: false };
  }

  private inferDemandType(title: string): DemandType {
    const normalized = this.normalizeText(title);
    if (normalized.includes("aditivo")) {
      return "aditivo";
    }
    if (normalized.includes("contrato")) {
      return "novo_contrato";
    }
    return "novo_lead";
  }

  private extractDueDiligence(deal: Record<string, unknown>): boolean {
    const directValue = this.extractString(deal, [
      "havera_due_diligence",
      "due_diligence",
      "has_due_diligence",
    ]);

    if (directValue) {
      const normalized = this.normalizeText(directValue);
      return normalized === "sim" || normalized === "true" || normalized === "yes";
    }

    const dueValue =
      this.getDealCustomFieldValue(deal, [
        "Haverá Due Diligence?",
        "Havera Due Diligence?",
        "Realizou Due Diligence? [CP]",
      ]) ?? "";
    const normalized = this.normalizeText(dueValue);
    if (normalized) {
      return normalized === "sim" || normalized === "true" || normalized === "yes";
    }

    return false;
  }

  private extractLeadFromDeal(deal: Record<string, unknown>): {
    name: string | null;
    email: string | null;
    phone: string | null;
    document: string | null;
  } {
    const contacts = this.extractArray(deal, ["contacts", "contact", "deal_contacts"]);
    const firstContact = contacts.find(this.isObject) ?? null;

    const organization = this.extractObject(deal, ["organization", "company"]);

    const name =
      this.getDealCustomFieldValue(deal, [
        "Razão Social [CP]",
        "Razao Social [CP]",
        "Razão Social / Nome Completo",
      ]) ??
      this.extractString(deal, ["name", "title"]) ??
      (firstContact && this.extractString(firstContact, ["name"])) ??
      this.extractString(organization, ["name", "title"]) ??
      null;

    const email =
      this.getDealCustomFieldValue(deal, [
        "Email Solicitante",
        "E-mail do Solicitante",
      ]) ??
      (firstContact && this.extractFirstEmail(firstContact)) ??
      this.extractString(organization, ["email"]) ??
      null;

    const phone =
      (firstContact && this.extractFirstPhone(firstContact)) ??
      this.extractString(organization, ["phone"]) ??
      null;

    const document =
      this.getDealCustomFieldValue(deal, [
        "CNPJ [CP]",
        "CNPJ/CPF",
        "CNPJ / CPF Cliente Principal [CADASTRO]",
      ]) ??
      this.extractDocument(firstContact) ??
      this.extractDocument(organization) ??
      null;

    return { name, email, phone, document };
  }

  private getDealCustomFieldValue(
    deal: Record<string, unknown>,
    labels: string[],
  ): string | null {
    const targetLabels = labels.map((label) => this.normalizeLabel(label));
    const customFields = this.extractArray(deal, [
      "deal_custom_fields",
      "custom_fields",
      "fields",
    ]);

    for (const field of customFields) {
      if (!this.isObject(field)) {
        continue;
      }

      const nestedCustomField = this.extractObject(field, ["custom_field"]);
      const rawLabel =
        this.extractString(nestedCustomField, ["label", "name"]) ??
        this.extractString(field, ["label", "name"]);
      if (!rawLabel) {
        continue;
      }

      const normalized = this.normalizeLabel(rawLabel);
      if (!targetLabels.includes(normalized)) {
        continue;
      }

      const value =
        this.extractString(field, ["value", "content"]) ??
        this.extractString(nestedCustomField, ["value"]);
      if (value) {
        return value;
      }
    }

    return null;
  }

  private extractFirstEmail(payload: Record<string, unknown> | null): string | null {
    if (!payload) {
      return null;
    }

    const direct = this.extractString(payload, ["email"]);
    if (direct) {
      return direct;
    }

    const emailArray = this.extractArray(payload, ["emails"]);
    for (const item of emailArray) {
      if (this.isObject(item)) {
        const value = this.extractString(item, ["email", "value"]);
        if (value) {
          return value;
        }
      }
    }

    return null;
  }

  private extractFirstPhone(payload: Record<string, unknown> | null): string | null {
    if (!payload) {
      return null;
    }

    const direct = this.extractString(payload, ["phone", "mobile_phone"]);
    if (direct) {
      return direct;
    }

    const phones = this.extractArray(payload, ["phones"]);
    for (const item of phones) {
      if (this.isObject(item)) {
        const value = this.extractString(item, ["phone", "number", "value"]);
        if (value) {
          return value;
        }
      }
    }

    return null;
  }

  private extractDocument(payload: Record<string, unknown> | null): string | null {
    if (!payload) {
      return null;
    }
    return this.extractString(payload, ["document", "document_number", "cpf_cnpj", "cnpj", "cpf"]);
  }

  private normalizeDocument(value: string | null, fallback: string): string {
    if (!value) {
      return `RD-${fallback}`;
    }

    const onlyDigits = value.replace(/\D/g, "");
    if (onlyDigits.length > 0) {
      return onlyDigits;
    }

    return value.trim().toUpperCase();
  }

  private extractArray(
    payload: Record<string, unknown> | null,
    keys: string[],
  ): unknown[] {
    if (!payload) {
      return [];
    }
    for (const key of keys) {
      const candidate = payload[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
    return [];
  }

  private extractObject(
    payload: unknown,
    keys: string[],
  ): Record<string, unknown> | null {
    if (!this.isObject(payload)) {
      return null;
    }
    for (const key of keys) {
      const candidate = payload[key];
      if (this.isObject(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private extractString(
    payload: Record<string, unknown> | unknown,
    keys: string[],
  ): string | null {
    if (!this.isObject(payload)) {
      return null;
    }
    for (const key of keys) {
      const candidate = payload[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
      if (typeof candidate === "number") {
        return String(candidate);
      }
    }
    return null;
  }

  private normalizeText(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  private normalizeLabel(value: string): string {
    return this.normalizeText(
      value
        .replace(/[\u2013\u2014\u2015]/g, "-")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }

  private toCamelCase(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
