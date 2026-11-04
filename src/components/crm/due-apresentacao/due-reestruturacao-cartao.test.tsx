// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftSchema } from "@/lib/due-ppt/draft";
import { DueReestruturacaoNoCartao } from "./due-reestruturacao-cartao";

vi.mock("@/lib/due-ppt/reestruturacao-pdf-client", () => ({ lerPdfsReestruturacao: vi.fn() }));

const salvo = draftSchema.parse({
  capa: { razaoSocial: "ACME LTDA", cnpj: "11.222.333/0001-81" },
  areas: { civel: { incluir: true, variante: "painel", textos: { leitura: "Texto do MKT" } } },
  reestruturacao: { juiz: "Dra. Fulana" },
});

type Chamada = { url: string; method: string; body: unknown };

function mockFetch() {
  const chamadas: Chamada[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    chamadas.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === "PUT") return new Response(JSON.stringify({ ok: true, atualizadoEm: "2026-11-04T18:00:00Z" }));
    return new Response(JSON.stringify({ ok: true, draft: salvo, sugestao: null }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return chamadas;
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("DueReestruturacaoNoCartao", () => {
  it("carrega os dados da RJ do rascunho e grava só a RJ por cima do que o MKT salvou", async () => {
    const chamadas = mockFetch();
    render(<DueReestruturacaoNoCartao leadId="lead-1" razaoSocial="ACME LTDA" cnpj="" abertoInicial />);

    const juiz = await screen.findByLabelText("Juiz");
    expect(juiz).toHaveValue("Dra. Fulana");

    fireEvent.change(juiz, { target: { value: "Dr. Beltrano" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    const put = chamadas.find((c) => c.method === "PUT");
    expect(put?.url).toBe("/api/crm/leads/lead-1/due-apresentacao");
    const draft = (put!.body as { draft: ReturnType<typeof draftSchema.parse> }).draft;
    expect(draft.reestruturacao.juiz).toBe("Dr. Beltrano");
    expect(draft.areas.reestruturacao?.incluir).toBe(true);
    // O que o MKT já tinha (capa e texto da Cível) continua.
    expect(draft.capa.razaoSocial).toBe("ACME LTDA");
    expect(draft.areas.civel?.textos.leitura).toBe("Texto do MKT");
    expect(await screen.findByText("Salvo")).toBeInTheDocument();
  });

  it("sem acesso ao rascunho, avisa e não mostra o formulário", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "Apenas comercial ou admin" }), { status: 403 })),
    );
    render(<DueReestruturacaoNoCartao leadId="lead-1" razaoSocial="ACME" cnpj="" abertoInicial />);
    expect(await screen.findByText(/Sem acesso aos dados da apresentação/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Juiz")).toBeNull();
  });
});
