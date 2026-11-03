import { describe, expect, it } from "vitest";
import { INVESTIMENTO_DOCUMENTO_KEY } from "@/data/proposta-tipos-catalog";
import { buildCanonicalContract } from "./build-canonical";
import { getClauseTemplate, SCOPE_IDS } from "./clause-catalog";
import {
  listDraftTokenIssues,
  listDraftTokensInText,
  listForbiddenDraftTokens,
  listUnresolvedPlaceholders,
} from "./placeholders";
import { createProposalContractSnapshot } from "./proposal-snapshot";
import type { CanonicalContractData, ContractObjectBlock, ResolvedContractClause } from "./types";

function clause(stableKey: string, content: string, extra: Partial<ResolvedContractClause> = {}): ResolvedContractClause {
  return {
    stableKey,
    title: stableKey,
    content,
    role: "general",
    origin: "standard",
    sourceLabel: "PADRÃO BP",
    version: 1,
    status: "approved",
    placeholdersUsed: [],
    ...extra,
  } as ResolvedContractClause;
}

function block(stableKey: string, content: string, extra: Partial<ContractObjectBlock> = {}): ContractObjectBlock {
  return {
    kind: "object",
    stableKey,
    content,
    order: 10,
    sourceLabel: "OBJETO",
    version: 1,
    status: "approved",
    ...extra,
  } as ContractObjectBlock;
}

describe("listDraftTokensInText", () => {
  it("acha placeholder e token proibido, sem repetir {{ }} com espaço", () => {
    expect(
      listDraftTokensInText("Valor de R$ X em XX/XX, [VALOR_TOTAL], {{ nome }} e {{nome}} [...]").sort(),
    ).toEqual(["R$ X", "XX/XX", "[...]", "[VALOR_TOTAL]", "{{nome}}"].sort());
  });

  it("texto limpo não tem marcação", () => {
    expect(listDraftTokensInText("A CONTRATANTE pagará R$ 1.000,00 em 10/04.")).toEqual([]);
  });
});

describe("listDraftTokenIssues", () => {
  it("aponta a cláusula e o bloco do objeto que travam o Word", () => {
    const data = {
      clauses: [
        clause("default_inadimplemento", "Multa de [PERCENTUAL_MULTA] ao mês."),
        clause("general_foro", "Foro de Campinas."),
        clause("payment_engine", "Total de R$ X.", { origin: "payment_engine", role: "payment" }),
        // Linha numerada do objeto: entra em `clauses` com a chave do bloco.
        clause("obj.trab", "Assessoria em [QTD_ACOES] ações.", { role: "object", origin: "profile", title: "1.1" }),
      ],
      sections: [],
      contractObject: {
        blocks: [
          block("obj.trab", "Assessoria em [QTD_ACOES] ações.", { items: ["Item {{prazo}}"] }),
          block("obj.limpo", "Sem marcação."),
        ],
        numberedLines: [],
      },
    };

    const issues = listDraftTokenIssues(data);
    expect(issues).toEqual([
      expect.objectContaining({ stableKey: "default_inadimplemento", source: "clause", tokens: ["[PERCENTUAL_MULTA]"] }),
      expect.objectContaining({ stableKey: "payment_engine", source: "clause", origin: "payment_engine", tokens: ["R$ X"] }),
      expect.objectContaining({ stableKey: "obj.trab", source: "object", title: "1.1", tokens: ["[QTD_ACOES]", "{{prazo}}"] }),
    ]);

    // Mesma cobertura das listas globais usadas pelo motor e pelo generate-docx.
    const full = data as unknown as CanonicalContractData;
    const all = new Set(issues.flatMap((i) => i.tokens));
    for (const token of [...listUnresolvedPlaceholders(full), ...listForbiddenDraftTokens(full)]) {
      expect(all.has(token)).toBe(true);
    }
  });

  it("build real: cláusula do banco com placeholder que o motor não preenche", () => {
    const base = getClauseTemplate("default_inadimplemento");
    if (!base) throw new Error("catálogo fixo sem default_inadimplemento");
    const result = buildCanonicalContract({
      snapshot: createProposalContractSnapshot({
        opportunityId: "opp-1",
        empresasIntake: [{ index: 1, razao_social: "Empresa Teste", tipo_documento: "CNPJ", documento: "11.222.333/0001-44" }],
        fieldByCode: {
          cp_proposta_empresas_json: JSON.stringify({ primaryIndex: 1, extras: [] }),
          cp_escopo_detalhe_json: JSON.stringify({
            Trabalhista: [
              { id: "e-1", tipoId: "assessoria_juridica_trabalhista", subtipoId: SCOPE_IDS.auditoria, placeholders: {} },
            ],
            [INVESTIMENTO_DOCUMENTO_KEY]: {
              tipoId: "honorarios_contratuais",
              subtipoId: "spot",
              placeholders: { VALORSPOT: "1000,00", PRIMEIROVENCIMENTO: "01/10/2026" },
            },
          }),
          cp_cliente_logradouro: "Rua A",
          cp_cliente_numero: "10",
          cp_cliente_bairro: "Centro",
          cp_cliente_cidade: "Campinas",
          cp_cliente_uf: "SP",
          cp_cliente_cep: "13000000",
        },
        capturedAt: "2026-09-02T15:00:00.000Z",
      }),
      generatedAt: new Date("2026-09-02T15:00:00.000Z"),
      clauseLibrary: new Map([
        ["default_inadimplemento", { ...base, content: "Multa de [PERCENTUAL_MULTA] sobre o débito." }],
      ]),
    });

    expect(result.pendencias.find((p) => p.code === "placeholders")?.ok).toBe(false);
    expect(listDraftTokenIssues(result.data)).toEqual([
      expect.objectContaining({ stableKey: "default_inadimplemento", source: "clause", tokens: ["[PERCENTUAL_MULTA]"] }),
    ]);
  });
});
