// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { D4SignViewDialog } from "./d4sign-view-dialog";

const UUID = "c686dbc1-1111-4111-8111-111111111111";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function renderDialog(open = true) {
  return render(
    <D4SignViewDialog
      open={open}
      onOpenChange={() => undefined}
      documentUuid={UUID}
      documentName="Contrato teste.pdf"
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("D4SignViewDialog", () => {
  it("não busca o PDF enquanto o dialog está fechado", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    renderDialog(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([422, 429, 502])("mostra o painel de erro no status %s e não monta iframe", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "falha" }), { status })),
    );

    renderDialog();

    expect(await screen.findByRole("heading", { name: "Não foi possível carregar o documento" })).toBeTruthy();
    expect(screen.queryByTitle("Visualização do contrato")).toBeNull();
    // Mostra o motivo devolvido pela rota, não uma mensagem genérica.
    expect(screen.getByText("falha")).toBeTruthy();
  });

  it("aponta \"Abrir no D4Sign\" para a rota /open por padrão", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "falha" }), { status: 502 })),
    );

    renderDialog();

    await screen.findByRole("heading", { name: "Não foi possível carregar o documento" });
    const links = screen.getAllByRole("link", { name: /Abrir no (portal )?D4Sign/ });
    expect(links.every((a) => a.getAttribute("href")?.endsWith("/open"))).toBe(true);
  });

  it("trata corpo vazio como erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new Uint8Array(), { status: 200, headers: { "Content-Type": "application/pdf" } }),
      ),
    );

    renderDialog();

    expect(await screen.findByRole("heading", { name: "Não foi possível carregar o documento" })).toBeTruthy();
    expect(screen.queryByTitle("Visualização do contrato")).toBeNull();
  });

  it("monta o iframe com blob URL só quando a resposta é PDF e revoga ao fechar", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:d4sign-pdf");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(PDF, { status: 200, headers: { "Content-Type": "application/pdf" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const view = renderDialog();

    const iframe = await screen.findByTitle("Visualização do contrato");
    expect(iframe.getAttribute("src")).toBe("blob:d4sign-pdf");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/api/crm/d4sign/documents/${UUID}/view`);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
    expect(createObjectURL).toHaveBeenCalledOnce();

    view.rerender(
      <D4SignViewDialog
        open={false}
        onOpenChange={() => undefined}
        documentUuid={UUID}
      />,
    );

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:d4sign-pdf");
    });
  });
});
