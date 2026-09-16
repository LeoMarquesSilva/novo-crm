// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROPOSTA_INVESTIMENTO_TIPOS_CATALOG } from "@/data/proposta-investimento-catalog";
import {
  parseEscopoJsonWithMeta,
  stringifyEscopoJsonWithMeta,
} from "@/lib/crm/proposta-escopo-json";
import { resolveInvestimentoDocumento } from "@/lib/crm/proposta-investimento-consolidado";
import { PropostaEscopoPorArea } from "./proposta-escopo-por-area";

const refresh = vi.fn();
const removeChannel = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseClient: () => {
    const channel = {
      on: vi.fn(),
      subscribe: vi.fn(),
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    return {
      channel: vi.fn(() => channel),
      removeChannel,
    };
  },
}));

function ScopeHarness() {
  const [value, setValue] = useState("");
  const handleDraftChange = useCallback((json: string) => {
    const { escopo, investimentoDocumento } = parseEscopoJsonWithMeta(json);
    const resolved = resolveInvestimentoDocumento(
      escopo,
      ["Recuperação de Créditos"],
      investimentoDocumento,
      PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
    );
    const next = stringifyEscopoJsonWithMeta(escopo, resolved);
    setValue((previous) => (previous === next ? previous : next));
  }, []);

  return (
    <>
      <output data-testid="scope-value">{value}</output>
      <PropostaEscopoPorArea
        leadId="78210335-788f-4140-b03a-c195e9021b50"
        fieldDefinitionId="field-scope"
        initialValue={value}
        savedValue=""
        areasDisplay="Recuperação de Créditos"
        defaultNomeEmpresa={null}
        viewerRole="admin"
        onEscopoDraftChange={handleDraftChange}
      />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue(null),
    }),
  );
});

describe("PropostaEscopoPorArea", () => {
  it("estabiliza o rascunho vazio ao montar uma área sem escopo salvo", async () => {
    render(<ScopeHarness />);

    expect(screen.getByText("Escopo detalhado por área")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("scope-value").textContent).toContain(
        "Recuperação de Créditos",
      );
    });
  });
});
