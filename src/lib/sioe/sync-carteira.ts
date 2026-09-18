import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrqestraiCarteira } from "@/lib/orqestrai/client-groups";
import { fetchSioePessoas, fetchSioeTitulos } from "@/lib/sioe/client";
import { digitsOnly, normalizeGroupKey } from "@/lib/crm/normalize-document";
import type { Database } from "@/lib/supabase/database.types";

export type CarteiraSyncResult =
  | {
      ok: true;
      groups: number;
      clients: number;
      titlesLinked: number;
      syncedAt: string;
    }
  | { ok: false; error: string };

type TituloAgg = {
  abertos: number;
  pagos: number;
  valorAberto: number;
  valorPago: number;
  ultimaCompetencia: string | null;
};

function emptyAgg(): TituloAgg {
  return { abertos: 0, pagos: 0, valorAberto: 0, valorPago: 0, ultimaCompetencia: null };
}

function addTitulo(agg: TituloAgg, situacao: string, valor: number, competencia: string | null) {
  if (situacao === "ABERTO") {
    agg.abertos += 1;
    agg.valorAberto += valor;
  } else if (situacao === "PAGO") {
    agg.pagos += 1;
    agg.valorPago += valor;
  } else {
    return;
  }
  if (competencia && (!agg.ultimaCompetencia || competencia > agg.ultimaCompetencia)) {
    agg.ultimaCompetencia = competencia;
  }
}

function statusFromAgg(agg: TituloAgg): "ativo_aberto" | "ativo_pago" | "inativo" {
  if (agg.abertos > 0) return "ativo_aberto";
  if (agg.pagos > 0) return "ativo_pago";
  return "inativo";
}

function mergeAgg(into: TituloAgg, from: TituloAgg) {
  into.abertos += from.abertos;
  into.pagos += from.pagos;
  into.valorAberto += from.valorAberto;
  into.valorPago += from.valorPago;
  if (from.ultimaCompetencia && (!into.ultimaCompetencia || from.ultimaCompetencia > into.ultimaCompetencia)) {
    into.ultimaCompetencia = from.ultimaCompetencia;
  }
}

const PAGE_SIZE = 1000;

async function fetchAllCrmRows<T extends Record<string, unknown>>(
  supabase: SupabaseClient<Database>,
  table: "clientes" | "grupos_economicos",
  columns: string,
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase.from(table).select(columns).range(from, to);
    if (error) return { data: rows, error: error.message };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: rows, error: null };
}

export async function syncCarteiraGrupos(supabase: SupabaseClient<Database>): Promise<CarteiraSyncResult> {
  const snapshot = await fetchOrqestraiCarteira();
  if (!snapshot) {
    return {
      ok: false,
      error: "Não foi possível ler email_client_groups no ORQESTRAI (marketing-system).",
    };
  }

  const [pessoas, titulos] = await Promise.all([fetchSioePessoas(), fetchSioeTitulos()]);
  const now = new Date().toISOString();

  const pessoaById = new Map((pessoas ?? []).map((pessoa) => [pessoa.id, pessoa]));
  const aggByGroupKey = new Map<string, TituloAgg>();
  const aggByDocument = new Map<string, TituloAgg>();

  for (const titulo of titulos ?? []) {
    if (!titulo.pessoaId) continue;
    const pessoa = pessoaById.get(titulo.pessoaId);
    const groupKey = normalizeGroupKey(pessoa?.grupoCliente);
    if (groupKey) {
      const agg = aggByGroupKey.get(groupKey) ?? emptyAgg();
      addTitulo(agg, titulo.situacao, titulo.valor, titulo.competencia);
      aggByGroupKey.set(groupKey, agg);
    }
    const digits = digitsOnly(pessoa?.cpfCnpj);
    if (digits) {
      const agg = aggByDocument.get(digits) ?? emptyAgg();
      addTitulo(agg, titulo.situacao, titulo.valor, titulo.competencia);
      aggByDocument.set(digits, agg);
    }
  }

  const groupRows = snapshot.groups
    .filter((group) => group.name.trim())
    .map((group) => {
      const key = normalizeGroupKey(group.nameNormalized || group.name) || group.id;
      const agg = emptyAgg();
      const byName = aggByGroupKey.get(key);
      if (byName) mergeAgg(agg, byName);
      return {
        id: group.id,
        nome: group.name.trim(),
        chave_estavel: key,
        orqestrai_id: group.id,
        status: statusFromAgg(agg),
        last_synced_at: now,
        updated_at: now,
        agg,
      };
    });

  const uniqueByKey = new Map<string, (typeof groupRows)[number]>();
  for (const row of groupRows) {
    const existing = uniqueByKey.get(row.chave_estavel);
    if (!existing) {
      uniqueByKey.set(row.chave_estavel, row);
      continue;
    }
    mergeAgg(existing.agg, row.agg);
    existing.status = statusFromAgg(existing.agg);
  }
  const groupsToUpsert = [...uniqueByKey.values()];

  if (groupsToUpsert.length) {
    const { error } = await supabase.from("grupos_economicos").upsert(
      groupsToUpsert.map(({ agg: _agg, ...row }) => row),
      { onConflict: "chave_estavel" },
    );
    if (error) return { ok: false, error: `Falha ao gravar grupos: ${error.message}` };
  }

  const { data: persistedGroups, error: loadGroupsError } = await fetchAllCrmRows<{
    id: string;
    chave_estavel: string;
    orqestrai_id: string | null;
  }>(supabase, "grupos_economicos", "id, chave_estavel, orqestrai_id");
  if (loadGroupsError) {
    return { ok: false, error: `Falha ao reler grupos: ${loadGroupsError}` };
  }

  const localGroupByOrqestrai = new Map<string, string>();
  const localGroupByKey = new Map<string, string>();
  for (const row of persistedGroups ?? []) {
    if (row.orqestrai_id) localGroupByOrqestrai.set(row.orqestrai_id, row.id);
    localGroupByKey.set(row.chave_estavel, row.id);
  }

  const aggByLocalGroup = new Map<string, TituloAgg>();
  for (const row of groupsToUpsert) {
    const localId = localGroupByOrqestrai.get(row.orqestrai_id) ?? localGroupByKey.get(row.chave_estavel);
    if (!localId) continue;
    const current = aggByLocalGroup.get(localId) ?? emptyAgg();
    mergeAgg(current, row.agg);
    aggByLocalGroup.set(localId, current);
  }

  const clientRows: Database["public"]["Tables"]["clientes"]["Insert"][] = [];
  const seenDocuments = new Set<string>();

  for (const company of snapshot.companies) {
    const digits = digitsOnly(company.cnpj);
    if (!digits || seenDocuments.has(digits)) continue;
    seenDocuments.add(digits);
    const localGroupId = company.clientGroupId
      ? localGroupByOrqestrai.get(company.clientGroupId)
      : undefined;
    const extra = localGroupId ? aggByDocument.get(digits) : null;
    if (localGroupId && extra) {
      const current = aggByLocalGroup.get(localGroupId) ?? emptyAgg();
      mergeAgg(current, extra);
      aggByLocalGroup.set(localGroupId, current);
    }
    clientRows.push({
      razao_social: company.name,
      documento: company.cnpj ?? digits,
      email_principal: null,
      telefone_principal: null,
      grupo_id: localGroupId ?? null,
      sioe_pessoa_id: company.sioePessoaId,
      orqestrai_company_id: company.id,
      orqestrai_person_id: null,
      tipo: "PESSOA JURÍDICA",
      cidade: company.city,
      uf: company.state,
      updated_at: now,
    });
  }

  for (const person of snapshot.people) {
    const digits = digitsOnly(person.cpfCnpj);
    if (!digits || seenDocuments.has(digits)) continue;
    seenDocuments.add(digits);
    const localGroupId = person.clientGroupId
      ? localGroupByOrqestrai.get(person.clientGroupId)
      : undefined;
    clientRows.push({
      razao_social: person.name,
      documento: person.cpfCnpj ?? digits,
      email_principal: person.email,
      telefone_principal: person.phone,
      grupo_id: localGroupId ?? null,
      sioe_pessoa_id: person.sioePessoaId,
      orqestrai_company_id: null,
      orqestrai_person_id: person.id,
      tipo: digits.length === 14 ? "PESSOA JURÍDICA" : "PESSOA FÍSICA",
      updated_at: now,
    });
  }

  if (clientRows.length) {
    const { data: existing, error: existingError } = await fetchAllCrmRows<{
      id: string;
      documento: string;
      orqestrai_company_id: string | null;
      orqestrai_person_id: string | null;
      sioe_pessoa_id: string | null;
    }>(supabase, "clientes", "id, documento, orqestrai_company_id, orqestrai_person_id, sioe_pessoa_id");
    if (existingError) return { ok: false, error: `Falha ao ler clientes: ${existingError}` };

    const byCompany = new Map<string, string>();
    const byPerson = new Map<string, string>();
    const bySioe = new Map<string, string>();
    const byDoc = new Map<string, string>();
    for (const row of existing ?? []) {
      if (row.orqestrai_company_id) byCompany.set(row.orqestrai_company_id, row.id);
      if (row.orqestrai_person_id) byPerson.set(row.orqestrai_person_id, row.id);
      if (row.sioe_pessoa_id) bySioe.set(row.sioe_pessoa_id, row.id);
      const doc = digitsOnly(row.documento);
      if (doc) byDoc.set(doc, row.id);
    }

    const inserts: Database["public"]["Tables"]["clientes"]["Insert"][] = [];
    const updates: Array<{ id: string; patch: Database["public"]["Tables"]["clientes"]["Update"] }> = [];
    for (const row of clientRows) {
      const companyId = row.orqestrai_company_id ?? null;
      const personId = row.orqestrai_person_id ?? null;
      const sioeId = row.sioe_pessoa_id ?? null;
      const doc = digitsOnly(row.documento);
      const existingId =
        (companyId && byCompany.get(companyId)) ||
        (personId && byPerson.get(personId)) ||
        (sioeId && bySioe.get(sioeId)) ||
        (doc && byDoc.get(doc));
      if (existingId) {
        updates.push({ id: existingId, patch: row });
      } else {
        inserts.push({ ...row, created_at: now });
      }
    }

    if (inserts.length) {
      for (let index = 0; index < inserts.length; index += 500) {
        const chunk = inserts.slice(index, index + 500);
        const { error } = await supabase.from("clientes").insert(chunk);
        if (error) return { ok: false, error: `Falha ao inserir clientes: ${error.message}` };
      }
    }
    for (const update of updates) {
      const { error } = await supabase.from("clientes").update(update.patch).eq("id", update.id);
      if (error) return { ok: false, error: `Falha ao atualizar cliente: ${error.message}` };
    }
  }

  const titleRows = [...aggByLocalGroup.entries()].map(([grupoId, agg]) => ({
    grupo_id: grupoId,
    titulos_abertos: agg.abertos,
    titulos_pagos: agg.pagos,
    valor_aberto: Number(agg.valorAberto.toFixed(2)),
    valor_pago: Number(agg.valorPago.toFixed(2)),
    ultima_competencia: agg.ultimaCompetencia,
    last_synced_at: now,
  }));

  if (titleRows.length) {
    const { error } = await supabase.from("grupo_titulos_resumo").upsert(titleRows, { onConflict: "grupo_id" });
    if (error) return { ok: false, error: `Falha ao gravar resumo de títulos: ${error.message}` };
  }

  const statusUpdates = [...aggByLocalGroup.entries()].map(([id, agg]) => ({
    id,
    status: statusFromAgg(agg),
  }));
  for (const update of statusUpdates) {
    const { error } = await supabase
      .from("grupos_economicos")
      .update({ status: update.status, updated_at: now, last_synced_at: now })
      .eq("id", update.id);
    if (error) return { ok: false, error: `Falha ao atualizar status do grupo: ${error.message}` };
  }

  return {
    ok: true,
    groups: groupsToUpsert.length,
    clients: clientRows.length,
    titlesLinked: titleRows.length,
    syncedAt: now,
  };
}
