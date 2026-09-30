import { describe, expect, it } from "vitest";
import { INVESTIMENTO_DOCUMENTO_KEY } from "@/data/proposta-tipos-catalog";
import { buildCanonicalContract } from "./build-canonical";
import { SCOPE_IDS } from "./clause-catalog";
import { buildClauseLibrary, type ClauseLibraryRow } from "./clause-library";
import { createProposalContractSnapshot } from "./proposal-snapshot";

const INVESTIMENTO = {
  tipoId: "honorarios_contratuais",
  subtipoId: "spot",
  placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
};

function snapshot(escopo: Record<string, unknown>) {
  return createProposalContractSnapshot({
    opportunityId: "opp-1",
    empresasIntake: [
      { index: 1, razao_social: "Empresa Teste", tipo_documento: "CNPJ", documento: "11.222.333/0001-44" },
    ],
    fieldByCode: {
      cp_proposta_empresas_json: JSON.stringify({ primaryIndex: 1, extras: [] }),
      cp_escopo_detalhe_json: JSON.stringify({ ...escopo, [INVESTIMENTO_DOCUMENTO_KEY]: INVESTIMENTO }),
      cp_cliente_logradouro: "Rua A",
      cp_cliente_numero: "10",
      cp_cliente_bairro: "Centro",
      cp_cliente_cidade: "Campinas",
      cp_cliente_uf: "SP",
      cp_cliente_cep: "13000000",
    },
    capturedAt: "2026-09-02T15:00:00.000Z",
  });
}

function entry(subtypeId: string, tipoId: string) {
  return { id: `e-${subtypeId}`, tipoId, subtipoId: subtypeId, placeholders: {} };
}

function row(partial: Partial<ClauseLibraryRow> & { id: string }): ClauseLibraryRow {
  return {
    stable_key: null,
    title: `Cláusula ${partial.id}`,
    content: `Texto ${partial.id}`,
    role: "object",
    category: "Geral",
    version: 1,
    status: "pending_legal_review",
    sort_order: 0,
    is_required: false,
    is_active: true,
    placeholders: [],
    conflicts_json: [],
    legal_review_note: null,
    area_key: null,
    scope_subtype_key: null,
    ...partial,
  };
}

const NEW_SUBTYPE = "recuperacao_credito_rj";

function build(escopo: Record<string, unknown>, rows?: ClauseLibraryRow[]) {
  return buildCanonicalContract({
    snapshot: snapshot(escopo),
    generatedAt: new Date("2026-09-02T15:00:00.000Z"),
    clauseLibrary: rows ? buildClauseLibrary(rows) : undefined,
  });
}

const LINKED_ROWS: ClauseLibraryRow[] = [
  row({
    id: "c-obj-2",
    title: "Objeto complementar",
    content: "Acompanhamento em favor [DA_CONTRATANTE].",
    area_key: "Cível",
    scope_subtype_key: NEW_SUBTYPE,
    sort_order: 20,
  }),
  row({
    id: "c-obj-1",
    title: "Objeto principal",
    content: "Recuperação de crédito em processos de RJ.",
    area_key: "Cível",
    scope_subtype_key: NEW_SUBTYPE,
    sort_order: 10,
  }),
  row({
    id: "c-exc",
    title: "Exclusão RJ",
    content: "Não inclui assembleias.",
    role: "exclusion",
    area_key: "Cível",
    scope_subtype_key: NEW_SUBTYPE,
  }),
  row({
    id: "c-inativa",
    content: "Inativa não entra.",
    area_key: "Cível",
    scope_subtype_key: NEW_SUBTYPE,
    is_active: false,
  }),
  row({
    id: "c-outra-area",
    content: "Outra área com a mesma chave.",
    area_key: "Recuperação de Créditos",
    scope_subtype_key: NEW_SUBTYPE,
  }),
];

describe("cláusulas vinculadas do banco (subtipo sem perfil em código)", () => {
  it("Trabalhista com perfil em código: mesmo conjunto de cláusulas com ou sem vínculos no banco", () => {
    const escopo = { Trabalhista: [entry(SCOPE_IDS.auditoria, "assessoria_juridica_trabalhista")] };
    const before = build(escopo);
    const after = build(escopo, [
      ...LINKED_ROWS,
      row({
        id: "c-auditoria-db",
        content: "Não deve entrar: o subtipo tem perfil em código.",
        area_key: "Trabalhista",
        scope_subtype_key: SCOPE_IDS.auditoria,
      }),
    ]);
    const shape = (r: typeof before) =>
      r.data.clauses.map((c) => ({ key: c.stableKey, role: c.role, content: c.content }));
    expect(shape(after)).toEqual(shape(before));
    expect(after.data.scopes[0]!.linkedClauseKeys).toBeUndefined();
    expect(before.data.clauses.map((c) => c.stableKey)).toMatchInlineSnapshot(`
      [
        "object.trabalhista.auditoria",
        "object.trabalhista.auditoria.scope",
        "exclusion_geral_base",
        "exclusion_trabalhista_contencioso",
        "exclusion_trabalhista_consultivo",
        "exclusion_trabalhista_diagnostico",
        "exclusion_trabalhista_canal",
        "exclusion_trabalhista_mpt",
        "exclusion_trabalhista_sustentacao",
        "exclusion_scope_change",
        "payment_engine",
        "default_inadimplemento",
        "default_atraso_multa",
        "term_resolved",
        "start_resolved",
        "termination_aviso",
        "obligation_contracted_base",
        "obligation_contracting_base",
        "expense_km",
        "compliance_anticorrupcao",
        "general_tributos",
        "general_foro",
        "general_irrevogabilidade",
        "general_independencia_disposicoes",
        "general_acordo_integral",
        "general_comunicacao",
        "general_mudanca_endereco",
        "general_legislacao_aplicavel",
        "general_responsabilidade_isencao",
        "general_assinaturas_titulo_executivo",
      ]
    `);
  });

  it("inclui as cláusulas ativas do subtipo, na ordem de sort_order, com placeholders resolvidos", () => {
    const result = build({ Cível: [entry(NEW_SUBTYPE, "recuperacao")] }, LINKED_ROWS);
    const scope = result.data.scopes[0]!;
    expect(scope.missingProfile).toBe(false);
    expect(scope.linkedClauseKeys).toEqual(["db_clause:c-exc", "db_clause:c-obj-1", "db_clause:c-obj-2"]);

    const linked = result.data.clauses.filter((c) => c.stableKey.startsWith("db_clause:"));
    expect(linked.map((c) => c.stableKey)).toEqual([
      "db_clause:c-obj-1",
      "db_clause:c-obj-2",
      "db_clause:c-exc",
    ]);
    expect(linked[1]!.content).toBe("Acompanhamento em favor da CONTRATANTE.");
    expect(result.data.sections[0]!.title).toBe("OBJETO DO CONTRATO");
    expect(result.data.sections[1]!.clauses.map((c) => c.stableKey)).toContain("db_clause:c-exc");
    expect(result.pendencias.find((p) => p.code === "profiles")?.ok).toBe(true);
    expect(result.pendencias.find((p) => p.code === "object_coverage")?.ok).toBe(true);
    expect(result.alignment.blockers.map((b) => b.code)).not.toContain("missing_profile");
  });

  it("ignora inativas e cláusulas da mesma chave em outra área", () => {
    const keys = build({ Cível: [entry(NEW_SUBTYPE, "recuperacao")] }, LINKED_ROWS).data.clauses.map(
      (c) => c.stableKey,
    );
    expect(keys).not.toContain("db_clause:c-inativa");
    expect(keys).not.toContain("db_clause:c-outra-area");

    const otherArea = build(
      { "Recuperação de Créditos": [entry(NEW_SUBTYPE, "recuperacao")] },
      LINKED_ROWS,
    );
    expect(otherArea.data.scopes[0]!.linkedClauseKeys).toEqual(["db_clause:c-outra-area"]);
  });

  it("subtipo sem perfil e sem cláusulas ativas continua sinalizado", () => {
    const result = build({ Cível: [entry("subtipo_sem_clausulas", "recuperacao")] }, [
      row({ id: "x", area_key: "Cível", scope_subtype_key: "subtipo_sem_clausulas", is_active: false }),
    ]);
    expect(result.data.scopes[0]!.missingProfile).toBe(true);
    expect(result.pendencias.find((p) => p.code === "profiles")?.ok).toBe(false);
    expect(result.alignment.blockers.map((b) => b.code)).toContain("missing_profile");
  });
});
