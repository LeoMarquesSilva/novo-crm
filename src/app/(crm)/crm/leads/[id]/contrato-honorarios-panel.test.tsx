// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HonorariosDaPropostaPanel } from "./contrato-honorarios-panel";
import type { ContractInvestment, ContractPayment } from "@/lib/crm/contract-engine/types";

const PAYMENT: ContractPayment = {
  method: "indefinido",
  methodLabel: "",
  clauseText:
    "Honorários fixos de R$ 12.000,00 (doze mil reais), pagos em cinco parcelas iguais.\nFicam previstos honorários de êxito de 5% (cinco por cento) sobre o proveito econômico obtido.",
  firstDueDate: null,
  installmentCount: 5,
  downPayment: null,
  arithmeticOk: true,
  arithmeticNote: null,
};

const INVESTMENT: ContractInvestment = {
  items: [
    { id: "1", tipoId: "honorarios_contratuais", subtipoId: "spot", placeholders: {}, amount: 12000 },
  ],
  totalAmount: 12000,
  totalExtenso: "R$ 12.000,00 (doze mil reais)",
  tributacao: "",
};

describe("HonorariosDaPropostaPanel", () => {
  it("mostra a cláusula herdada, um parágrafo por honorário, e avisa que a forma de pagamento não sai", () => {
    render(
      <HonorariosDaPropostaPanel payment={PAYMENT} investment={INVESTMENT} ignoredFields={[]} onClearField={() => {}} />,
    );
    expect(screen.getByText(/pagos em cinco parcelas iguais/)).toBeTruthy();
    expect(screen.getByText(/Ficam previstos honorários de êxito/)).toBeTruthy();
    expect(screen.getByText(/não informada na proposta/)).toBeTruthy();
    expect(screen.queryByText(/não entra no documento/)).toBeNull();
  });

  it("lista o texto digitado nos campos antigos como 'não entra' e permite limpar", () => {
    const onClear = vi.fn();
    render(
      <HonorariosDaPropostaPanel
        payment={PAYMENT}
        investment={INVESTMENT}
        ignoredFields={[{ code: "cc_valores", label: "Valores e vencimento", value: "R$ 12.000,00 em 5x" }]}
        onClearField={onClear}
      />,
    );
    expect(screen.getByText(/não entra no documento/)).toBeTruthy();
    expect(screen.getByText(/R\$ 12\.000,00 em 5x/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onClear).toHaveBeenCalledWith("cc_valores");
  });

  it("sem investimento com valor na proposta, avisa que a cláusula sai incompleta", () => {
    render(
      <HonorariosDaPropostaPanel
        payment={{ ...PAYMENT, clauseText: "As condições de honorários ainda não foram herdadas da proposta." }}
        investment={{ ...INVESTMENT, items: [], totalAmount: null, totalExtenso: "" }}
        ignoredFields={[]}
        onClearField={() => {}}
      />,
    );
    expect(screen.getByText(/A proposta não tem investimento com valor/)).toBeTruthy();
  });
});
