// @vitest-environment jsdom
import PizZip from "pizzip";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DueApresentacaoPanel } from "./due-apresentacao-panel";

function planilhaCivel(): ArrayBuffer {
  const zip = new PizZip();
  zip.file(
    "xl/workbook.xml",
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="dados" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  const cel = (ref: string, v: string | number) =>
    typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const linhas = [
    ["Número do processo", "Situação", "Fase", "Partes polo ativo", "POLO DO CLIENTE", "Tribunal", "Valor de causa (R$)"],
    ["1000001-11.2025.8.26.0100", "Ativo", "Conhecimento", "AUTOR A", "PASSIVO", "TJSP", 1500],
    ["1000002-11.2025.8.26.0100", "Ativo", "Conhecimento", "AUTOR B", "PASSIVO", "TJSP", 2500],
    ["1000003-11.2025.8.26.0100", "Ativo", "Execução", "EMPRESA X", "ATIVO", "TJSP", 999],
  ];
  const cols = "ABCDEFG";
  const xml = linhas
    .map((l, r) => `<row r="${r + 1}">${l.map((v, c) => cel(`${cols[c]}${r + 1}`, v)).join("")}</row>`)
    .join("");
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`,
  );
  const bytes = zip.generate({ type: "uint8array" }) as Uint8Array;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function resposta(body: unknown) {
  return { ok: true, status: 200, json: async () => body, arrayBuffer: async () => body as ArrayBuffer };
}

afterEach(() => vi.unstubAllGlobals());

describe("DueApresentacaoPanel", () => {
  it("carrega o rascunho sugerido, lê a planilha da área e mostra os números", async () => {
    const xlsx = planilhaCivel();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/due-apresentacao")) {
        return resposta({
          ok: true,
          draft: null,
          sugestao: { razaoSocial: "EMPRESA X LTDA", cnpj: "00.000.000/0001-00", empresas: [], areas: ["civel"] },
          atualizadoEm: null,
          geradoEm: null,
          migrationPending: false,
          aviso: null,
        });
      }
      if (url.endsWith("/due-documents")) {
        return resposta({
          ok: true,
          documents: [
            {
              id: "doc-civel",
              document_kind: "planilha_area",
              area_key: "civel",
              original_filename: "DUE - CÍVEL.xlsx",
              content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              byte_size: 1000,
              uploaded_at: "2026-10-20T10:00:00Z",
              uploaded_by_app_user_id: null,
            },
          ],
        });
      }
      if (url.includes("documentId=doc-civel")) return resposta({ ok: true, signedUrl: "https://storage.test/civel.xlsx" });
      if (url === "https://storage.test/civel.xlsx") return resposta(xlsx);
      throw new Error(`fetch inesperado: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DueApresentacaoPanel leadId="lead-1" etapa="compilacao" />);

    expect(await screen.findByText("Apresentação automática")).toBeInTheDocument();
    expect(screen.getByLabelText("Razão social")).toHaveValue("EMPRESA X LTDA");
    // Passivo = só o polo passivo (1.500 + 2.500).
    await waitFor(() => expect(screen.getByText(/Potencial passivo R\$ 4\.000,00/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Gerar e anexar à compilação/ })).toBeEnabled();
    expect(screen.getByText(/Entram na apresentação: Cível/)).toBeInTheDocument();
  });
});
