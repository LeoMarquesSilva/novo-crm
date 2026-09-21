import { describe, expect, it } from "vitest";
import {
  NEW_INDICATION_VALUE,
  collaboratorSelectItems,
  indicationNameSelectItems,
  resolveIndicationNameMode,
  shouldRequestIndicatorApproval,
} from "./indication-name-options";

describe("resolveIndicationNameMode", () => {
  const approved = ["Felipe da Triunfae", "Banco XYZ"];

  it("usa a base aprovada, colaborador interno ou cadastro novo para aprovação", () => {
    expect(
      resolveIndicationNameMode({
        tipoIndicacao: "Fundo",
        nome: "Felipe da Triunfae",
        approvedIndicators: approved,
      }),
    ).toBe("existing");
    expect(
      resolveIndicationNameMode({
        tipoIndicacao: "Fundo",
        nome: "Pessoa Nova",
        approvedIndicators: approved,
      }),
    ).toBe("new");
    expect(
      resolveIndicationNameMode({
        tipoIndicacao: "Colaborador",
        nome: "Maria",
        approvedIndicators: approved,
      }),
    ).toBe("colaborador");
  });
});

describe("shouldRequestIndicatorApproval", () => {
  it("só pede aprovação quando o gestor cadastra uma pessoa nova", () => {
    expect(
      shouldRequestIndicatorApproval({
        tipoLead: "Indicacao",
        tipoIndicacao: "Fundo",
        mode: "new",
      }),
    ).toBe(true);
    expect(
      shouldRequestIndicatorApproval({
        tipoLead: "Indicacao",
        tipoIndicacao: "Colaborador",
        mode: "colaborador",
      }),
    ).toBe(false);
    expect(
      shouldRequestIndicatorApproval({
        tipoLead: "Indicacao",
        tipoIndicacao: "Fundo",
        mode: "existing",
      }),
    ).toBe(false);
  });
});

describe("indicationNameSelectItems", () => {
  it("inclui a opção de solicitar aprovação no mesmo padrão do lead", () => {
    const items = indicationNameSelectItems(["Ana"]);
    expect(items.Ana).toBe("Ana");
    expect(items[NEW_INDICATION_VALUE]).toContain("solicitar aprovação");
    expect(collaboratorSelectItems([{ id: "1", name: "João" }])).toEqual({ João: "João" });
  });
});
