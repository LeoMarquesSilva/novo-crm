import { describe, expect, it } from "vitest";
import { INVESTIMENTO_DOCUMENTO_KEY } from "@/data/proposta-tipos-catalog";
import { buildCanonicalContract } from "./build-canonical";
import { getClauseTemplate, SCOPE_IDS } from "./clause-catalog";
import { buildCanonicalContratoPage, previewFromCanonical } from "./legacy-preview";
import { contractPartyGrammar } from "./party-language";
import {
  contractAreaTogglesFromProposal,
  mergeInheritedContractAreaToggles,
} from "./inherit-areas";
import { createProposalContractSnapshot } from "./proposal-snapshot";

const ADDRESS = {
  cp_cliente_logradouro: "Rua A",
  cp_cliente_numero: "10",
  cp_cliente_bairro: "Centro",
  cp_cliente_cidade: "Campinas",
  cp_cliente_uf: "SP",
  cp_cliente_cep: "13000000",
};

function snapshot(escopo: unknown, extras: Record<string, string> = {}) {
  return createProposalContractSnapshot({
    opportunityId: "opp-1",
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
    capturedAt: "2026-09-02T15:00:00.000Z",
  });
}

function entry(subtypeId: string, tipoId = "assessoria_juridica_trabalhista") {
  return {
    id: `e-${subtypeId}`,
    tipoId,
    subtipoId: subtypeId,
    placeholders: {},
  };
}

describe("contractPartyGrammar", () => {
  it("usa singular para uma contratante", () => {
    expect(contractPartyGrammar(1).noun).toBe("CONTRATANTE");
    expect(contractPartyGrammar(1).articleNoun).toBe("a CONTRATANTE");
  });

  it("usa plural para duas contratantes", () => {
    expect(contractPartyGrammar(2).noun).toBe("CONTRATANTES");
    expect(contractPartyGrammar(2).by).toBe("pelas CONTRATANTES");
  });
});

describe("perfis de escopo", () => {
  it("resolve Auditoria: objeto, exclusões, vigência e não se exclui", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
      generatedAt: new Date("2026-09-02T15:00:00.000Z"),
    });
    const text = result.data.clauses.map((c) => c.content).join("\n");
    expect(text).toMatch(/Auditoria Trabalhista/i);
    expect(text).toMatch(/Relatório Conclusivo/i);
    expect(result.data.term.kind).toBe("until_deliverable_with_estimate");
    expect(result.data.startRule.kind).toBe("on_signature");
    expect(text).not.toMatch(/Não está incluída a realização de Auditoria/i);
    expect(result.alignment.ok).toBe(true);
  });

  it("resolve Canal: limites, natureza, 12 meses e sem texto de Auditoria no objeto", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.canal)],
      }),
    });
    const object = result.data.clauses
      .filter((c) => c.role === "object" || c.role === "scope" || c.role === "nature")
      .map((c) => c.content)
      .join("\n");
    expect(object).toMatch(/canal de denúncias/i);
    expect(object).toMatch(/administrativa e organizacional/i);
    expect(object).not.toMatch(/Auditoria Trabalhista/i);
    expect(result.data.clauses.some((c) => c.role === "limitation")).toBe(true);
    expect(result.data.term.kind).toBe("fixed_months");
    expect(result.data.term.months).toBe(12);
    expect(result.data.startRule.kind).toBe("on_first_payment");
  });

  it("resolve Diagnóstico: HSE-IT, GRO/PGR, 30 dias e não se exclui", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.diagnostico)],
      }),
    });
    const text = result.data.clauses.map((c) => c.content).join("\n");
    expect(text).toMatch(/HSE-IT/);
    expect(text).toMatch(/GRO/);
    expect(text).toMatch(/PGR/);
    expect(result.data.term.days).toBe(30);
    expect(text).not.toMatch(/Não está incluído o mapeamento para diagnóstico/i);
  });
});

describe("combinação de escopos", () => {
  it("Auditoria + Diagnóstico NR-1 não se contradizem e numeram em sequência", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria), entry(SCOPE_IDS.diagnostico)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00" },
        },
      }),
    });
    const object = result.data.clauses
      .filter((c) => c.role === "object" || c.role === "scope")
      .map((c) => c.content)
      .join("\n");
    expect(object).toMatch(/Auditoria/i);
    expect(object).toMatch(/NR-1|psicossociais/i);
    expect(
      result.data.clauses.some((c) => c.stableKey === "exclusion_trabalhista_auditoria"),
    ).toBe(false);
    expect(
      result.data.clauses.some((c) => c.stableKey === "exclusion_trabalhista_diagnostico"),
    ).toBe(false);
    expect(result.data.clauses.filter((c) => c.stableKey === "default_inadimplemento")).toHaveLength(
      1,
    );
    const numbers = result.data.sections.map((s) => Number(s.number));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(result.alignment.blockers.filter((b) => b.code === "contradictory_exclusion")).toEqual(
      [],
    );
  });
});

describe("múltiplas empresas", () => {
  it("duas contratantes usam linguagem no plural", () => {
    const snap = createProposalContractSnapshot({
      opportunityId: "opp-2",
      empresasIntake: [
        { index: 1, razao_social: "Empresa A", tipo_documento: "CNPJ", documento: "11.111.111/0001-11" },
        { index: 2, razao_social: "Empresa B", tipo_documento: "CNPJ", documento: "22.222.222/0001-22" },
      ],
      fieldByCode: {
        cp_proposta_empresas_json: JSON.stringify({
          primaryIndex: 1,
          extras: [{ razao_social: "Empresa B", documento: "22.222.222/0001-22" }],
        }),
        cp_escopo_detalhe_json: JSON.stringify({
          Trabalhista: [entry(SCOPE_IDS.auditoria)],
        }),
        ...ADDRESS,
      },
    });
    const result = buildCanonicalContract({ snapshot: snap });
    expect(result.data.contractingParties).toHaveLength(2);
    expect(result.data.clauses.some((c) => c.content.includes("as CONTRATANTES"))).toBe(true);
  });
});

describe("investimento", () => {
  it("gera mensal, preço fechado, parcelado, entrada + êxito", () => {
    const mensal = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.consultivo)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          items: [
            {
              id: "1",
              tipoId: "honorarios_contratuais",
              subtipoId: "mensal_fixo",
              placeholders: { VALORMENSAL: "3000,00" },
            },
          ],
        },
      }),
    });
    expect(mensal.data.payment.clauseText).toMatch(/Honorários mensais/);
    expect(mensal.data.payment.clauseText).toMatch(/três mil reais/i);

    const parcelado = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          items: [
            {
              id: "2",
              tipoId: "honorarios_contratuais",
              subtipoId: "spot",
              placeholders: {
                VALORSPOT: "20000,00",
                PARCELAS: "4",
                VALORPARCELA: "5000,00",
              },
            },
          ],
        },
      }),
    });
    expect(parcelado.data.payment.clauseText).toMatch(/4 parcelas/);
    expect(parcelado.data.payment.arithmeticOk).toBe(true);

    const entrada = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.diagnostico)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          items: [
            {
              id: "3",
              tipoId: "honorarios_contratuais",
              subtipoId: "spot",
              placeholders: {
                VALORSPOT: "4000,00",
                VALORENTRADA: "1200,00",
                PARCELAS: "7",
                VALORPARCELA: "400,00",
              },
            },
          ],
        },
      }),
    });
    expect(entrada.data.payment.clauseText).toMatch(/entrada/);
    expect(entrada.data.payment.arithmeticOk).toBe(true);

    const exito = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.contencioso)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          items: [
            {
              id: "4",
              tipoId: "honorarios_contratuais",
              subtipoId: "exito_percentual",
              placeholders: { PERCENTUALEXITO: "8%" },
            },
          ],
        },
      }),
    });
    expect(exito.data.payment.clauseText).toMatch(/êxito/i);
  });
});

describe("alinhamento e pendências", () => {
  it("bloqueia escopo sem perfil", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry("subtipo_inexistente")],
      }),
    });
    expect(result.alignment.ok).toBe(false);
    expect(result.alignment.blockers.some((b) => b.code === "missing_profile")).toBe(true);
    expect(result.pendencias.find((p) => p.code === "profiles")?.ok).toBe(false);
  });

  it("não deixa placeholder no documento resolvido", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "1000,00", PRIMEIROVENCIMENTO: "01/10/2026" },
        },
      }),
    });
    expect(result.pendencias.find((p) => p.code === "placeholders")?.ok).toBe(true);
  });
});

describe("áreas herdadas da proposta", () => {
  it("marca toggles a partir de cp_areas_objeto e do escopo", () => {
    const toggles = contractAreaTogglesFromProposal({
      cp_areas_objeto: "Cível, Trabalhista, Societário e Contratos, Tributário, Recuperação de Créditos",
      cp_escopo_detalhe_json: JSON.stringify({
        Trabalhista: [entry(SCOPE_IDS.consultivo)],
        Cível: [entry("padrao")],
      }),
    });
    expect(toggles).toEqual({
      cc_incluir_trabalhista: "Sim",
      cc_incluir_civel: "Sim",
      cc_incluir_contratual: "Sim",
      cc_incluir_tributario: "Sim",
    });
  });

  it("marca êxito quando o investimento da proposta tem êxito", () => {
    const toggles = contractAreaTogglesFromProposal({
      cp_areas_objeto: "Trabalhista",
      cp_escopo_detalhe_json: JSON.stringify({
        Trabalhista: [entry(SCOPE_IDS.consultivo)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "mensal_com_exito",
          placeholders: { VALORMENSAL: "3000,00" },
        },
      }),
    });
    expect(toggles.cc_incluir_exito).toBe("Sim");
    expect(toggles.cc_incluir_trabalhista).toBe("Sim");
  });

  it("não sobrescreve Sim/Não já escolhidos no contrato", () => {
    const merged = mergeInheritedContractAreaToggles(
      { cc_incluir_trabalhista: "Não", cc_incluir_civel: "" },
      { cc_incluir_trabalhista: "Sim", cc_incluir_civel: "Sim" },
    );
    expect(merged.cc_incluir_trabalhista).toBe("Não");
    expect(merged.cc_incluir_civel).toBe("Sim");
  });
});

describe("preview legado não gera cláusulas numeradas vazias", () => {
  it("previewFromCanonical não repete os escopos como 'áreas' com corpo vazio", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.contencioso), entry(SCOPE_IDS.consultivo)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
      fieldByCode: {
        NUMERO_PROCESSO: "0010789-21.2026.5.15.0126",
        PARTE_CONTRARIA: "João da Silva",
        VARA_TRIBUNAL: "2ª Vara do Trabalho de Campinas",
      },
    });
    const page = previewFromCanonical(result.data);
    // Bug real corrigido: `areas` vinha preenchida a partir de `data.scopes` com
    // `details: []` sempre vazio — o preview e o .docx gerado mostravam uma
    // cláusula numerada por escopo (ex.: "3. TRABALHISTA — CONSULTIVO") sem
    // nenhum texto abaixo. O conteúdo real já está todo dentro de `objeto`.
    expect(page.areas).toHaveLength(0);
    expect(page.objeto).toMatch(/reclamação trabalhista/i);
    expect(page.objeto).toMatch(/consultiv/i);
  });

  it("previewFromCanonical agrupa por seção sem duplicar numeração (items, não texto pré-numerado)", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const page = previewFromCanonical(result.data);
    // Bug 1 (corrigido): cada cláusula (Compliance, Tributos, Foro,
    // Irrevogabilidade...) virava um item numerado de topo próprio (19, 20, 21,
    // 22...) em vez de ficar agrupada numa única "Disposições Gerais".
    // Bug 2 (corrigido): ao agrupar, o número da seção (embutido em `title`) e o
    // número atribuído por quem renderiza (`num` prop / N()) se somavam, virando
    // "4. 3. PREÇO E FORMA DE PAGAMENTO" — daí `title` não carrega mais número
    // nenhum, e sub-itens vão em `items` (sem prefixo numérico próprio) em vez de
    // texto pré-numerado dentro de `content`.
    const disposicoes = page.clausulasAdicionais.find((c) => c.title === "DISPOSIÇÕES GERAIS");
    expect(disposicoes).toBeDefined();
    expect(disposicoes?.title).not.toMatch(/^\d/);
    const itemTitles = disposicoes?.items?.map((i) => i.title) ?? [];
    expect(itemTitles.some((t) => /Irrevogabilidade/i.test(t))).toBe(true);
    expect(itemTitles.some((t) => /Foro/i.test(t))).toBe(true);
    expect(itemTitles.some((t) => /Tributos/i.test(t))).toBe(true);
    // Sub-itens não carregam prefixo numérico embutido (ex.: "12.1.") — quem
    // renderiza é quem numera, com o número que ela mesma atribuiu à seção-pai.
    expect(itemTitles.every((t) => !/^\d+\.\d+\.\s*/.test(t))).toBe(true);
    // Compliance é sua própria seção — não deve estar dentro de Disposições Gerais.
    expect(itemTitles.some((t) => /Compliance/i.test(t))).toBe(false);

    const titles = page.clausulasAdicionais.map((c) => c.title);
    // Um único item de topo por seção — não um item por cláusula individual —
    // e nenhum título carrega número embutido.
    expect(titles.filter((t) => /IRREVOGABILIDADE|FORO|TRIBUTOS/.test(t))).toHaveLength(0);
    expect(titles.every((t) => !/^\d/.test(t))).toBe(true);
  });

  it("Objetos Excluídos vira posição fixa 2 (Objeto=1, Excluídos=2, Honorários=3, padrão .md)", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const page = previewFromCanonical(result.data);
    // Bug real corrigido: Honorários era sempre a cláusula 2 (hardcoded), antes
    // de Objetos Excluídos — divergindo do padrão contrato_honorarios_template_1.md,
    // onde Objetos Excluídos é 2 e Honorários é 3. Agora Objetos Excluídos vira
    // seu próprio campo de posição fixa, fora da lista genérica.
    expect(page.objetosExcluidos).not.toBeNull();
    expect(page.objetosExcluidos?.title).toBe("OBJETOS EXCLUÍDOS DO CONTRATO");
    const titles = page.clausulasAdicionais.map((c) => c.title);
    expect(titles).not.toContain("OBJETOS EXCLUÍDOS DO CONTRATO");
    expect(titles).not.toContain("OBJETO DO CONTRATO");
    // Conteúdo de pagamento já sai coberto pela cláusula fixa 3 (Honorários) —
    // não deve aparecer duplicado como seção genérica separada.
    expect(titles).not.toContain("PREÇO E FORMA DE PAGAMENTO");
  });

  it("sub-itens de Objetos Excluídos não repetem 'Exclusão —' no título (já redundante com o cabeçalho da seção)", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const page = previewFromCanonical(result.data);
    expect(page.objetosExcluidos).not.toBeNull();
    const itemTitles = page.objetosExcluidos?.items?.map((i) => i.title) ?? [];
    expect(itemTitles.length).toBeGreaterThan(0);
    expect(itemTitles.some((t) => /^exclus(ã|a)o\s*[—-]/i.test(t))).toBe(false);
    // Continua identificável pelo conteúdo específico, só sem o prefixo redundante.
    expect(itemTitles).toContain("Diagnóstico NR-1");
    expect(itemTitles).toContain("Canal de Denúncias");
  });

  it("descarta fragmentos numéricos órfãos do Objeto salvos como 'cláusula extra' antiga", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    // Reproduz o achado real no lead Ingevity: `clausulas_selecionadas` guardava
    // fragmentos como "1.2. Consultivo Trabalhista", salvos antes do motor de
    // Objeto existir — nunca foram cláusula extra escolhida por alguém.
    const page = buildCanonicalContratoPage({
      canonicalData: result.data,
      userExtras: [
        { title: "1.1. Objeto", content: "texto antigo qualquer" },
        { title: "1.2. Consultivo Trabalhista", content: "outro texto antigo" },
        { title: "Cláusula extra de verdade", content: "isso sim foi escolhido manualmente" },
      ],
    });
    const titles = page.clausulasAdicionais.map((c) => c.title);
    expect(titles).not.toContain("1.1. Objeto");
    expect(titles).not.toContain("1.2. Consultivo Trabalhista");
    expect(titles).toContain("Cláusula extra de verdade");
  });

  it("cláusula 'adicional' de exclusão escolhida manualmente entra como sub-item de Objetos Excluídos, não vira clásula solta duplicada", () => {
    // Regressão real: um usuário tinha adicionado manualmente "Exclusão — Diagnóstico
    // NR-1" como cláusula extra (antes de a seção automática de exclusões existir).
    // Isso renderizava como "12. EXCLUSÃO — DIAGNÓSTICO NR-1", uma cláusula solta com
    // número próprio, repetindo "Exclusão" no título e deslocada de "2. OBJETOS
    // EXCLUÍDOS DO CONTRATO", onde semanticamente deveria estar.
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const page = buildCanonicalContratoPage({
      canonicalData: result.data,
      userExtras: [
        { title: "Exclusão — Cliente Muito Específico", content: "Texto exclusivo deste cliente." },
      ],
    });
    // Não aparece como cláusula solta.
    expect(page.clausulasAdicionais.map((c) => c.title)).not.toContain(
      "Exclusão — Cliente Muito Específico",
    );
    // Aparece dentro de Objetos Excluídos, sem repetir "Exclusão" no título do item.
    expect(page.objetosExcluidos).not.toBeNull();
    const itemTitles = page.objetosExcluidos?.items?.map((i) => i.title) ?? [];
    expect(itemTitles).toContain("Cliente Muito Específico");
    const itemContents = page.objetosExcluidos?.items?.map((i) => i.content) ?? [];
    expect(itemContents).toContain("Texto exclusivo deste cliente.");
  });

  it("cláusula extra com o MESMO título de uma que o motor já gera, mas com texto desatualizado, é descartada — não duplicada dentro da própria seção", () => {
    // Achado real (mesmo lead da Diagnóstico NR-1): a cláusula extra salva
    // "Exclusão — Diagnóstico NR-1" tinha o texto CURTO/antigo, de antes de o
    // catálogo ser ampliado (ver legalReviewNote de exclusion_trabalhista_diagnostico).
    // O motor já gera a versão atual/completa automaticamente para esse escopo —
    // mesclar a versão antiga como MAIS um item teria criado duas entradas
    // "Diagnóstico NR-1" lado a lado dentro da mesma seção, uma contradizendo a
    // outra. A antiga precisa ser descartada, não mesclada.
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const page = buildCanonicalContratoPage({
      canonicalData: result.data,
      userExtras: [
        {
          title: "Exclusão — Diagnóstico NR-1",
          content:
            "Não está incluído o mapeamento para diagnóstico de riscos psicossociais nos termos da NR-1, salvo contratação expressa.",
        },
      ],
    });
    const itemTitles = page.objetosExcluidos?.items?.map((i) => i.title) ?? [];
    // Só UMA entrada "Diagnóstico NR-1" — a atual do motor, não a duplicata antiga.
    expect(itemTitles.filter((t) => t === "Diagnóstico NR-1").length).toBe(1);
    const itemContents = page.objetosExcluidos?.items?.map((i) => i.content) ?? [];
    // O texto curto/antigo não sobrevive — só o texto atual e completo do catálogo.
    expect(itemContents.some((c) => c.includes("condução de programas contínuos de treinamentos"))).toBe(
      true,
    );
    expect(
      itemContents.some(
        (c) =>
          c === "Não está incluído o mapeamento para diagnóstico de riscos psicossociais nos termos da NR-1, salvo contratação expressa.",
      ),
    ).toBe(false);
  });

  it("cláusula extra 'Atraso no pagamento' com nota interna de revisão jurídica desatualizada é descartada — não vaza pro contrato de verdade", () => {
    // Achado real: a cláusula extra continha uma frase de revisão interna
    // ("REQUIRES LEGAL DECISION quanto à manutenção desta multa como padrão.")
    // que NÃO existe na versão atual/aprovada do catálogo. Como "Atraso no
    // pagamento" é cláusula padrão (isRequired) sempre gerada pelo motor dentro
    // de "INADIMPLEMENTO", a versão antiga precisa ser descartada — nunca
    // mesclada, sob risco de a nota de revisão interna ir parar no contrato
    // real enviado ao cliente.
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const page = buildCanonicalContratoPage({
      canonicalData: result.data,
      userExtras: [
        {
          title: "Atraso no pagamento",
          content:
            "O atraso no pagamento facultará à Contratada cobrar multa equivalente a 20% (vinte por cento) do valor em mora, acrescida de juros de 1% (um por cento) ao mês, pro rata die, com atualização pela variação positiva do IPCA-E. REQUIRES LEGAL DECISION quanto à manutenção desta multa como padrão.",
        },
      ],
    });
    expect(page.clausulasAdicionais.map((c) => c.title)).not.toContain("Atraso no pagamento");
    const inadimplemento = page.clausulasAdicionais.find((c) => c.title === "INADIMPLEMENTO");
    expect(inadimplemento).toBeDefined();
    const itemTitles = inadimplemento?.items?.map((i) => i.title) ?? [];
    expect(itemTitles.filter((t) => t === "Atraso no pagamento").length).toBe(1);
    const itemContents = inadimplemento?.items?.map((i) => i.content) ?? [];
    expect(itemContents.some((c) => c.includes("REQUIRES LEGAL DECISION"))).toBe(false);
  });

  it("cláusula extra 'Despesas' com nota de revisão interna desatualizada é descartada — não duplica a seção Despesas do motor", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const page = buildCanonicalContratoPage({
      canonicalData: result.data,
      userExtras: [
        {
          title: "Despesas",
          content:
            "A remuneração avençada não abrange despesas extraordinárias necessárias à execução dos Serviços. Os modelos mencionam R$ 2,00 por quilômetro — REQUIRES LEGAL DECISION se esse valor é padrão institucional.",
        },
      ],
    });
    const titles = page.clausulasAdicionais.map((c) => c.title);
    expect(titles.filter((t) => t === "DESPESAS").length).toBe(1);
    const despesas = page.clausulasAdicionais.find((c) => c.title === "DESPESAS");
    expect(despesas?.content ?? "").not.toContain("REQUIRES LEGAL DECISION se esse valor é padrão institucional");
  });

  it("buildCanonicalContratoPage é a mesma fonte usada por preview, Gerar DOCX e envio ao D4Sign", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const engineClauseContent = result.data.clauses[0]?.content.trim() ?? "";
    const page = buildCanonicalContratoPage({
      canonicalData: result.data,
      userExtras: [
        { title: "Extra do usuário", content: "Cláusula manual que não existe no motor." },
        // Mesmo conteúdo de uma cláusula que o motor já gerou — não deve duplicar.
        { title: "Duplicata do motor", content: engineClauseContent },
      ],
    });
    const titles = page.clausulasAdicionais.map((c) => c.title);
    expect(titles).toContain("Extra do usuário");
    expect(titles).not.toContain("Duplicata do motor");
  });
});

describe("campos e cláusulas não vazam entre contextos", () => {
  it("Contencioso Trabalhista de caso único não mostra campo de Full Service (qtd_acoes)", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.contencioso)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
      fieldByCode: {
        NUMERO_PROCESSO: "0010789-21.2026.5.15.0126",
        PARTE_CONTRARIA: "João da Silva",
        VARA_TRIBUNAL: "2ª Vara do Trabalho de Campinas",
      },
    });
    const keys = result.data.contractObject.fieldValues.map((f) => f.key);
    expect(keys).toContain("numero_processo");
    expect(keys).not.toContain("qtd_acoes");
  });

  it("Consultivo Trabalhista isolado não mostra campos de Full Service (qtd/valor excedente)", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.consultivo)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const keys = result.data.contractObject.fieldValues.map((f) => f.key);
    expect(keys).not.toContain("qtd_horas_trabalhista");
    expect(keys).not.toContain("valor_excedente_trabalhista_consultivo");
    expect(result.data.contractObject.status).not.toBe("incomplete");
  });

  it("não duplica a ideia de irrevogabilidade (Vinculação das Partes deixou de ser automática)", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
    });
    const keys = result.data.clauses.map((c) => c.stableKey);
    expect(keys).toContain("general_irrevogabilidade");
    expect(keys).not.toContain("general_vinculacao_partes");
  });
});

describe("clauseLibrary (admin de cláusulas)", () => {
  // Cláusulas de papel "object"/"scope"/"limitation"/"nature" são substituídas pelo
  // motor de Objeto (object-catalog.ts) quando há modelo estruturado — por isso o
  // teste usa uma cláusula padrão ("default_inadimplemento"), sempre resolvida via
  // resolveTemplate independente do motor de Objeto.
  it("usa o conteúdo vindo do banco no lugar do catálogo fixo quando presente", () => {
    const overrideContent = "TEXTO SOBRESCRITO PELO ADMIN DE CLÁUSULAS.";
    const base = getClauseTemplate("default_inadimplemento");
    if (!base) throw new Error("catálogo fixo sem default_inadimplemento");
    const clauseLibrary = new Map([["default_inadimplemento", { ...base, content: overrideContent }]]);

    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
      generatedAt: new Date("2026-09-02T15:00:00.000Z"),
      clauseLibrary,
    });

    const clause = result.data.clauses.find((c) => c.stableKey === "default_inadimplemento");
    expect(clause?.content).toBe(overrideContent);
  });

  it("cai no catálogo fixo quando a stable_key não está na biblioteca do banco", () => {
    const result = buildCanonicalContract({
      snapshot: snapshot({
        Trabalhista: [entry(SCOPE_IDS.auditoria)],
        [INVESTIMENTO_DOCUMENTO_KEY]: {
          tipoId: "honorarios_contratuais",
          subtipoId: "spot",
          placeholders: { VALORSPOT: "20000,00", PRIMEIROVENCIMENTO: "10/04/2026" },
        },
      }),
      generatedAt: new Date("2026-09-02T15:00:00.000Z"),
      clauseLibrary: new Map(),
    });

    const clause = result.data.clauses.find((c) => c.stableKey === "default_inadimplemento");
    expect(clause?.content).toMatch(/inadimplemento/i);
  });
});
