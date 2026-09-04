import { describe, expect, it } from "vitest";
import { buildCanonicalContract } from "./build-canonical";
import { SCOPE_IDS } from "./clause-catalog";
import { getObjectTemplate } from "./object-catalog";
import {
  applyObjectOverride,
  numberContractObjectBlocks,
  toRomanListMarker,
} from "./object-engine";
import { appendContractEngineEvent } from "./object-events";
import { createProposalContractSnapshot } from "./proposal-snapshot";
import type { ContractObjectBlock } from "./types";

const ADDRESS = {
  cp_cliente_logradouro: "Rua A",
  cp_cliente_numero: "10",
  cp_cliente_bairro: "Centro",
  cp_cliente_cidade: "Campinas",
  cp_cliente_uf: "SP",
  cp_cliente_cep: "13000000",
};

const PROCESSO = {
  "NUM. DO PROCESSO": "0010789-21.2026.5.15.0126",
  PARTE_CONTRARIA: "João da Silva",
  VARA_TRIBUNAL: "2ª Vara do Trabalho de Campinas",
  VALOR_CAUSA: "R$ 80.000,00",
};

function snapshot(escopo: unknown, extras: Record<string, string> = {}) {
  return createProposalContractSnapshot({
    opportunityId: "opp-obj-1",
    empresasIntake: [
      {
        index: 1,
        razao_social: "Empresa Teste",
        tipo_documento: "CNPJ",
        documento: "11.222.333/0001-44",
      },
    ],
    fieldByCode: {
      cp_proposta_empresas_json: JSON.stringify({ primaryIndex: 1, extras: [] }),
      cp_escopo_detalhe_json: JSON.stringify(escopo),
      ...ADDRESS,
      ...extras,
    },
    capturedAt: "2026-09-03T12:00:00.000Z",
  });
}

function entry(
  subtypeId: string,
  tipoId = "assessoria_juridica_trabalhista",
  placeholders: Record<string, string> = {},
) {
  return {
    id: `e-${subtypeId}`,
    tipoId,
    subtipoId: subtypeId,
    placeholders,
  };
}

describe("objeto simples — contencioso", () => {
  it("redige 1.1 com processo, parte, vara e valor resolvidos", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.contencioso, "assessoria_juridica_trabalhista", PROCESSO)],
      }),
    });
    const object = result.data.contractObject;
    expect(object.status).toBe("complete");
    expect(object.missingRequiredFields).toEqual([]);
    expect(object.numberedLines[0]?.number).toBe("1.1");
    const text = object.numberedLines.map((l) => l.content).join("\n");
    expect(text).toContain("0010789-21.2026.5.15.0126");
    expect(text).toContain("João da Silva");
    expect(text).toContain("2ª Vara do Trabalho de Campinas");
    expect(text).toContain("R$ 80.000,00");
    expect(text).not.toMatch(/\[NUMERO_PROCESSO\]/);
  });

  it("marca incompleto sem número do processo", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.contencioso)],
      }),
    });
    expect(result.data.contractObject.status).toBe("incomplete");
    expect(result.data.contractObject.missingRequiredFields).toContain("numero_processo");
    expect(result.pendencias.find((p) => p.code === "object_fields")?.ok).toBe(false);
  });
});

describe("objeto consultivo", () => {
  it("gera objeto consultivo sem cláusula de contencioso", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.consultivo)],
      }),
    });
    const text = result.data.contractObject.blocks.map((b) => b.content).join("\n");
    expect(text).toMatch(/consultiv/i);
    expect(text).not.toMatch(/reclamação trabalhista nº/i);
    expect(result.data.contractObject.compositionKey).toBeNull();
  });
});

describe("contencioso + consultivo", () => {
  it("mostra os dois escopos e não vira full service automaticamente", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [
          entry(SCOPE_IDS.contencioso, "assessoria_juridica_trabalhista", PROCESSO),
          entry(SCOPE_IDS.consultivo),
        ],
      }),
    });
    const object = result.data.contractObject;
    expect(object.compositionKey).toBeNull();
    const joined = object.numberedLines.map((l) => `${l.number} ${l.title ?? ""} ${l.content}`).join("\n");
    expect(joined).toMatch(/reclamação trabalhista/i);
    expect(joined).toMatch(/consultiv/i);
    expect(joined).not.toMatch(/full service/i);
    expect(object.representedScopeIds).toHaveLength(2);
  });

  it("aplica full service só com evidência explícita", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [
          entry(SCOPE_IDS.contencioso, "assessoria_juridica_trabalhista", PROCESSO),
          entry(SCOPE_IDS.consultivo),
        ],
      }),
      explicitCompositionKey: "trabalhista_full_service",
    });
    const object = result.data.contractObject;
    expect(object.compositionKey).toBe("trabalhista_full_service");
    const numbers = object.numberedLines.map((l) => l.number);
    expect(numbers).toContain("1.1");
    expect(numbers).toContain("1.1.1");
    expect(numbers).toContain("1.1.2");
    expect(numbers).toContain("Parágrafo único");
    const joined = object.numberedLines.map((l) => `${l.title ?? ""} ${l.content}`).join("\n");
    expect(joined).toMatch(/full service/i);
    expect(joined).toMatch(/Contencioso Trabalhista/i);
    expect(joined).toMatch(/Consultivo Trabalhista/i);
  });

  it("full service não exige número de processo/parte/vara (carteira, não caso único)", () => {
    // Sem PROCESSO (número/parte/vara) — o full service cobre uma carteira de
    // processos, não 1 caso identificado; não deve ficar bloqueado por esses campos.
    // Valor excedente (contencioso/consultivo) é obrigatório no full service desde
    // a adoção do padrão `contrato_honorarios_template_1.md` — precisa vir preenchido
    // para não bloquear por outro motivo.
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [
          entry(SCOPE_IDS.contencioso, "assessoria_juridica_trabalhista"),
          entry(SCOPE_IDS.consultivo),
        ],
      }),
      explicitCompositionKey: "trabalhista_full_service",
      fieldByCode: {
        VALOR_EXCEDENTE_TRABALHISTA_CONTENCIOSO: "R$ 3.000,00",
        VALOR_EXCEDENTE_TRABALHISTA_CONSULTIVO: "R$ 500,00",
      },
    });
    const object = result.data.contractObject;
    expect(object.compositionKey).toBe("trabalhista_full_service");
    expect(object.missingRequiredFields).not.toContain("numero_processo");
    expect(object.missingRequiredFields).not.toContain("parte_contraria");
    expect(object.missingRequiredFields).not.toContain("vara_tribunal");
    expect(object.status).not.toBe("incomplete");

    const paragrafoUnico = object.numberedLines.find((l) => l.number === "Parágrafo único");
    expect(paragrafoUnico?.content).toMatch(/grupo econômico/i);
    expect(paragrafoUnico?.content).not.toMatch(/faturamento adicional/i);
  });
});

describe("renderer complexo", () => {
  it("numera paragraph, lista romana e limitation sem duplicar 1.1", () => {
    const blocks: ContractObjectBlock[] = [
      {
        kind: "paragraph",
        stableKey: "object.complex.general",
        title: "Objeto",
        content: "Objeto geral da reestruturação.",
        order: 10,
        sourceLabel: "fixture",
        version: 1,
        status: "pending_legal_review",
      },
      {
        kind: "ordered_list",
        stableKey: "object.complex.list",
        content: "",
        intro: "A CONTRATADA se compromete, ainda:",
        items: ["medida um", "medida dois", "medida três"],
        listStyle: "roman",
        order: 20,
        sourceLabel: "fixture",
        version: 1,
        status: "pending_legal_review",
      },
      {
        kind: "limitation",
        stableKey: "object.complex.limit",
        content: "O escopo não inclui recuperação judicial.",
        order: 30,
        sourceLabel: "fixture",
        version: 1,
        status: "pending_legal_review",
      },
    ];
    const lines = numberContractObjectBlocks(blocks);
    const numbers = lines.map((l) => l.number);
    expect(numbers).toEqual(["1.1", "1.2", "(i)", "(ii)", "(iii)", "1.3"]);
    expect(new Set(numbers.filter((n) => n.startsWith("1."))).size).toBe(3);
    expect(toRomanListMarker(0)).toBe("(i)");
  });
});

describe("várias áreas", () => {
  it("não ignora Cível sem perfil (Família/divórcio ainda não tem perfil)", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.consultivo)],
        Cível: [entry("divorcio_guarda_e_alimentos", "familia")],
      }),
    });
    expect(result.data.scopes).toHaveLength(2);
    expect(
      result.data.scopes.some(
        (s) => s.subtypeId === "divorcio_guarda_e_alimentos" && s.missingProfile,
      ),
    ).toBe(true);
    expect(result.data.contractObject.missingScopeIds.length).toBeGreaterThan(0);
    expect(result.alignment.blockers.some((b) => b.code === "missing_profile")).toBe(true);
    expect(result.alignment.blockers.some((b) => b.code === "object_coverage")).toBe(true);
    expect(result.data.contractObject.representedScopeIds).toHaveLength(1);
  });

  it("Cível um_processo já tem perfil real (derivado do mesmo contrato de +1 processo)", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Cível: [
          entry("um_processo", "contencioso", {
            NUMERO_PROCESSO_CIVEL: "1002345-11.2026.8.26.0114",
            VARA_TRIBUNAL_CIVEL: "3ª Vara Cível de Campinas",
          }),
        ],
      }),
    });
    const scope = result.data.scopes.find((s) => s.subtypeId === "um_processo");
    expect(scope?.missingProfile).toBe(false);
    expect(result.data.contractObject.missingScopeIds).toHaveLength(0);
    // Chaves próprias (numero_processo_civel/vara_tribunal_civel, não as mesmas
    // do Contencioso Trabalhista) — sem isso, os valores de um escopo
    // sobrescreviam o do outro no mapa de placeholders quando os dois
    // apareciam no mesmo contrato (achado real no lead Ingevity).
    expect(result.data.contractObject.missingRequiredFields).toHaveLength(0);
    const joined = result.data.contractObject.numberedLines.map((l) => l.content).join("\n");
    expect(joined).toMatch(/1002345-11\.2026\.8\.26\.0114/);
    expect(joined).toMatch(/3ª Vara Cível de Campinas/);
    expect(joined).not.toMatch(/faturamento adicional por novos processos/i);
  });

  it("Cível +1 processo já tem perfil real (contrato de exemplo)", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Cível: [
          entry("mais_um_processo", "contencioso", {
            NUMERO_PROCESSO_CIVEL: "1002345-11.2026.8.26.0114",
            VARA_TRIBUNAL_CIVEL: "3ª Vara Cível de Campinas",
          }),
        ],
      }),
    });
    const scope = result.data.scopes.find((s) => s.subtypeId === "mais_um_processo");
    expect(scope?.missingProfile).toBe(false);
    const text = result.data.clauses.map((c) => c.content).join("\n");
    expect(text).toMatch(/Cível/i);
    expect(result.data.contractObject.missingScopeIds).toHaveLength(0);
    expect(result.data.contractObject.missingRequiredFields).toHaveLength(0);
    const joined = result.data.contractObject.numberedLines.map((l) => l.content).join("\n");
    expect(joined).toMatch(/1002345-11\.2026\.8\.26\.0114/);
    expect(joined).toMatch(/3ª Vara Cível de Campinas/);
  });

  it("Trabalhista + Cível no mesmo contrato: cada 'Vara / Tribunal' guarda seu próprio valor", () => {
    // Bug real reportado pelo usuário (lead Ingevity, que tem as duas áreas ao
    // mesmo tempo): "numero_processo"/"vara_tribunal" eram usados tanto pelo
    // Contencioso Trabalhista quanto pelo Cível — o valor de um sobrescrevia o
    // do outro no mapa de placeholders (e duas chaves React idênticas "Vara /
    // Tribunal *" no formulário). Confirma que os dois convivem sem se misturar.
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [
          entry(SCOPE_IDS.contencioso, "assessoria_juridica_trabalhista", {
            NUMERO_PROCESSO: "0010789-21.2026.5.15.0126",
            PARTE_CONTRARIA: "João da Silva",
            VARA_TRIBUNAL: "2ª Vara do Trabalho de Campinas",
          }),
        ],
        Cível: [
          entry("mais_um_processo", "contencioso", {
            NUMERO_PROCESSO_CIVEL: "1002345-11.2026.8.26.0114",
            VARA_TRIBUNAL_CIVEL: "3ª Vara Cível de Campinas",
          }),
        ],
      }),
    });
    expect(result.data.contractObject.missingRequiredFields).toHaveLength(0);
    const joined = result.data.contractObject.numberedLines.map((l) => l.content).join("\n");
    expect(joined).toMatch(/0010789-21\.2026\.5\.15\.0126/);
    expect(joined).toMatch(/2ª Vara do Trabalho de Campinas/);
    expect(joined).toMatch(/1002345-11\.2026\.8\.26\.0114/);
    expect(joined).toMatch(/3ª Vara Cível de Campinas/);
  });

  it("Reestruturação e Insolvência (negociacoes_estrategicas) já tem perfil real", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        "Reestruturação e Insolvência": [
          entry("negociacoes_estrategicas", "ajuizamento_de_medida_de_reestruturacao"),
        ],
      }),
    });
    const scope = result.data.scopes.find((s) => s.subtypeId === "negociacoes_estrategicas");
    expect(scope?.missingProfile).toBe(false);
    expect(result.data.contractObject.missingScopeIds).toHaveLength(0);
    const joined = result.data.contractObject.numberedLines.map((l) => l.content).join("\n");
    expect(joined).toMatch(/recuperação (judicial|extrajudicial)/i);
    expect(joined).toMatch(/sucumbência/i);
    expect(result.data.startRule.kind).toBe("on_first_payment");
  });

  it("Societário e Contratos (diagnostico_estruturacao_e_protecao_patrimonial) já tem perfil real", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        "Societário e Contratos": [
          entry(
            "diagnostico_estruturacao_e_protecao_patrimonial",
            "diagnostico_e_reestruturacao_societaria",
          ),
        ],
      }),
    });
    const scope = result.data.scopes.find(
      (s) => s.subtypeId === "diagnostico_estruturacao_e_protecao_patrimonial",
    );
    expect(scope?.missingProfile).toBe(false);
    expect(result.data.contractObject.missingScopeIds).toHaveLength(0);
    expect(result.data.term.kind).toBe("until_deliverable");
    const joined = result.data.contractObject.numberedLines.map((l) => l.content).join("\n");
    expect(joined).toMatch(/diagnóstico/i);
  });

  it("Societário — Consultivo, Revisão e Elaboração de Contratos: bloqueia sem qtd/valor excedente e libera preenchido", () => {
    const semCampos = buildCanonicalContract({
      snapshot: snapshot({
        "Societário e Contratos": [
          entry("consultivo_revisao_e_elaboracao_de_contratos", "assessoria_contratual_empresarial"),
        ],
      }),
    });
    const scope = semCampos.data.scopes.find(
      (s) => s.subtypeId === "consultivo_revisao_e_elaboracao_de_contratos",
    );
    expect(scope?.missingProfile).toBe(false);
    expect(semCampos.data.contractObject.missingRequiredFields).toContain("qtd_horas_societario");
    expect(semCampos.data.contractObject.missingRequiredFields).toContain("valor_excedente_societario");
    expect(semCampos.data.contractObject.status).toBe("incomplete");

    const comCampos = buildCanonicalContract({
      snapshot: snapshot({
        "Societário e Contratos": [
          entry("consultivo_revisao_e_elaboracao_de_contratos", "assessoria_contratual_empresarial"),
        ],
      }),
      fieldByCode: {
        QTD_HORAS_SOCIETARIO: "dez (10)",
        VALOR_EXCEDENTE_SOCIETARIO: "R$ 450,00",
      },
    });
    expect(comCampos.data.contractObject.missingRequiredFields).toHaveLength(0);
    const joined = comCampos.data.contractObject.numberedLines.map((l) => l.content).join("\n");
    expect(joined).toMatch(/dez \(10\)/);
    expect(joined).toMatch(/R\$ 450,00/);
    expect(joined).toMatch(/joint venture/i);
  });
});

describe("override do objeto", () => {
  it("preserva o catálogo e registra override auditável", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.consultivo)],
      }),
    });
    const original = getObjectTemplate("object.trabalhista.consultivo")?.content ?? "";
    const next = applyObjectOverride({
      object: result.data.contractObject,
      blockStableKey: "object.trabalhista.consultivo",
      overrideContent: "Redação ajustada só neste contrato.",
      reason: "Ajuste pontual pedido pelo cliente",
      changedBy: "user-1",
      changedByName: "Maria Comercial",
    });
    expect(getObjectTemplate("object.trabalhista.consultivo")?.content).toBe(original);
    expect(next.overrides).toHaveLength(1);
    expect(next.overrides[0]?.originalContent).toContain("consultiva trabalhista");
    expect(next.overrides[0]?.overrideContent).toBe("Redação ajustada só neste contrato.");
    expect(next.overrides[0]?.reason).toBe("Ajuste pontual pedido pelo cliente");
    expect(next.blocks.find((b) => b.stableKey === "object.trabalhista.consultivo")?.content).toBe(
      "Redação ajustada só neste contrato.",
    );
    const events = appendContractEngineEvent([], {
      type: "contract_object_overridden",
      actorId: "user-1",
      actorName: "Maria Comercial",
      payload: { blockStableKey: "object.trabalhista.consultivo", invalidatesReview: true },
    });
    expect(events[0]?.type).toBe("contract_object_overridden");
    expect(events[0]?.payload.invalidatesReview).toBe(true);
  });
});

describe("numeração e placeholders", () => {
  it("não duplica 1.1 ao resolver vários blocos", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria), entry(SCOPE_IDS.diagnostico)],
      }),
    });
    const decimals = result.data.contractObject.numberedLines
      .map((l) => l.number)
      .filter((n) => /^1\.\d+$/.test(n));
    expect(decimals).toEqual([...decimals].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))));
    expect(new Set(decimals).size).toBe(decimals.length);
  });

  it("não deixa placeholder obrigatório no objeto completo", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.contencioso, "assessoria_juridica_trabalhista", PROCESSO)],
      }),
    });
    const text = result.data.contractObject.numberedLines.map((l) => l.content).join("\n");
    expect(text).not.toMatch(/\[[A-Z0-9_]+\]/);
    expect(text).not.toMatch(/\{\{/);
    expect(result.pendencias.find((p) => p.code === "placeholders")?.ok).toBe(true);
  });
});
