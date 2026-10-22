import { describe, expect, it } from "vitest";
import { buildCanonicalContract } from "./build-canonical";
import { SCOPE_IDS } from "./clause-catalog";
import { createProposalContractSnapshot } from "./proposal-snapshot";

const ESCOPO = {
  "Recuperação de Créditos": [
    {
      id: "e-rj",
      tipoId: "recuperacao_credito",
      subtipoId: SCOPE_IDS.recuperacaoCreditoRj,
      placeholders: {
        "NOME DA EMPRESA EM RECUPERAÇÃO JUDICIAL": "Grupo Empresarial Casas Bahia S.A.",
        "NÚMERO DO PROCESSO": "4152930-18.2026.8.26.0100",
        "VARA/COMARCA/UF": "2ª Vara de Falências e Recuperações Judiciais do Foro Central Cível de São Paulo/SP",
      },
    },
  ],
};

function build(objectFieldValues?: Record<string, string>) {
  return buildCanonicalContract({
    snapshot: createProposalContractSnapshot({
      opportunityId: "opp-rj",
      empresasIntake: [
        { index: 1, razao_social: "VINICIUS", tipo_documento: "CPF", documento: "111.444.777-35" },
        { index: 2, razao_social: "ANDRE", tipo_documento: "CPF", documento: "123.456.789-09" },
      ],
      fieldByCode: {
        cp_proposta_empresas_json: JSON.stringify({ primaryIndex: 1, extras: [], contratantes: [2] }),
        cp_escopo_detalhe_json: JSON.stringify(ESCOPO),
      },
      capturedAt: "2026-10-21T21:00:00.000Z",
    }),
    objectFieldValues,
  });
}

describe("perfil: recuperação de crédito em processo de recuperação judicial", () => {
  it("monta o objeto com os dados da proposta, sem pendência de objeto", () => {
    const result = build();
    const [scope] = result.data.scopes;
    expect(scope.missingProfile).toBe(false);
    expect(scope.label).toBe("Recuperação de Crédito em Processos de Recuperação Judicial");

    const lines = result.data.contractObject.numberedLines.map((l) => [l.number, l.title ?? "", l.content]);
    expect(lines[0]).toEqual([
      "1.1",
      "Objeto",
      "O presente Contrato tem por objeto a atuação estratégica e diligente com o objetivo de recuperar créditos, de qualquer natureza, em favor das CONTRATANTES, relacionados ao processo de Recuperação Judicial de Grupo Empresarial Casas Bahia S.A., autuado sob o nº 4152930-18.2026.8.26.0100, em trâmite perante a 2ª Vara de Falências e Recuperações Judiciais do Foro Central Cível de São Paulo/SP. A atuação abrangerá as etapas descritas a seguir.",
    ]);
    expect(lines.map((l) => l[0])).toEqual(["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"]);
    expect(lines[1][2]).toBe(
      "Elaboração de parecer estratégico acerca dos caminhos jurídicos mais adequados à recuperação do crédito, além da negociação extrajudicial do crédito competente.",
    );
    expect(lines[5][2]).toBe(
      "A atuação restringe-se ao crédito existente das CONTRATANTES na Recuperação Judicial de Grupo Empresarial Casas Bahia S.A., autuada sob o nº 4152930-18.2026.8.26.0100.",
    );
    expect(result.data.contractObject.missingScopeIds).toEqual([]);
    expect(result.data.contractObject.fieldValues.filter((f) => f.required && !f.value)).toEqual([]);
  });

  it("os pontos específicos do parecer completam a frase quando preenchidos", () => {
    const result = build({
      pontos_parecer_rj:
        "à viabilidade de pleitear a consolidação substancial, nos termos do art. 69-J da Lei nº 11.101/2005",
    });
    expect(result.data.contractObject.numberedLines[1].content).toBe(
      "Elaboração de parecer estratégico acerca dos caminhos jurídicos mais adequados à recuperação do crédito, especialmente quanto à viabilidade de pleitear a consolidação substancial, nos termos do art. 69-J da Lei nº 11.101/2005, além da negociação extrajudicial do crédito competente.",
    );
  });
});
