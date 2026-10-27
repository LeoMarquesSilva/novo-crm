import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { detectarArea, normalizarPlanilha, parseData, parseValor } from "./processos";
import { readXlsx, type SheetData } from "./xlsx-reader";

describe("valores e datas", () => {
  it("lê moeda nos formatos que chegam nas planilhas", () => {
    expect(parseValor("R$ 46.000,00")).toBe(46000);
    expect(parseValor("1234.5")).toBe(1234.5);
    expect(parseValor(7846.7)).toBe(7846.7);
    expect(parseValor("N/F")).toBe(0);
    expect(parseValor("R$ 143.509.088,00")).toBe(143509088);
  });

  it("lê data dd/mm/aaaa, ISO e número de série do Excel", () => {
    expect(parseData("27/04/2026")).toBe("2026-04-27");
    expect(parseData("2026-04-27")).toBe("2026-04-27");
    expect(parseData(46139)).toBe("2026-04-27");
  });
});

const civel: SheetData = {
  name: "dados",
  rows: [
    ["Número do processo", "Situação", "Classe", "Fase", "Partes polo ativo", "Partes polo passivo", "POLO DO CLIENTE", "SÓCIO NO POLO PASSIVO?", "Data da distribuição", "Tribunal", "Valor de causa (R$)"],
    ["4000781-95.2026.8.26.0210", "ATIVO", "PROCEDIMENTO COMUM CÍVEL", "Conhecimento", "AUTOR A", "EMPRESA", "PASSIVO", "NÃO", "27/04/2026", "TJSP", "R$ 46.000,00"],
    ["4000781-95.2026.8.26.0210", "ATIVO", "DUPLICADO", "Conhecimento", "AUTOR A", "EMPRESA", "PASSIVO", "NÃO", "27/04/2026", "TJSP", "R$ 46.000,00"],
    ["TOTAL", null, null, null, null, null, null, null, null, null, 46000],
  ],
};

describe("normalização", () => {
  it("acha o cabeçalho, ignora totais e processos repetidos", () => {
    const n = normalizarPlanilha([civel]);
    expect(n.processos).toHaveLength(1);
    expect(n.processos[0]).toMatchObject({ poloCliente: "PASSIVO", socioPoloPassivo: "NAO", valorCausa: 46000, dataDistribuicao: "2026-04-27" });
    expect(n.avisos[0]).toContain("repetido");
  });

  it("lê a aba de dívida ativa estadual (PGE)", () => {
    const n = normalizarPlanilha([
      { name: "TRIBUTÁRIO", rows: [["CPF/CNPJ", "Nome", "Numero Processo", "Valor", "Tipo de Ação", "Polo Ativo", "Status Processo"], ["1", "X", "3000018-93.2025.8.19.0064", "R$ 10,00", "EXECUCAO FISCAL", "ESTADO DO RIO DE JANEIRO", "EM TRAMITAÇÃO"]] },
      { name: "PGE", rows: [["Dívida Ativa Estadual", "Valor"], ["Empresa", 140323428.94], ["TOTAL", 140323428.94]] },
    ]);
    expect(n.processos).toHaveLength(1);
    expect(n.extras.pge).toBe(140323428.94);
  });

  it("reconhece a área pelo nome do arquivo e pelas colunas", () => {
    expect(detectarArea("DUE - CÍVEL - ALEA.xlsx", [])).toBe("civel");
    expect(detectarArea("1.3 ALEA S.A. - Rec cred_final.xlsx", [])).toBe("rec_cred");
    expect(detectarArea("2026.10.09_BASE_TRABALHISTA.xlsx", [])).toBe("trabalhista");
    expect(detectarArea("planilha.xlsx", [civel])).toBe("civel");
    expect(
      detectarArea("x.xlsx", [{ name: "dados", rows: [["Número do processo", "Pedidos", "Valor envolvido"], ["0012080-43.2026.5.15.0001", "a", 1]] }]),
    ).toBe("trabalhista");
  });
});

function xlsxMinimo(): Uint8Array {
  const zip = new PizZip();
  zip.file(
    "xl/workbook.xml",
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="dados" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file(
    "xl/sharedStrings.xml",
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Número do processo</t></si><si><t>Valor</t></si></sst>',
  );
  zip.file(
    "xl/styles.xml",
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>0001</t></is></c><c r="B2" s="1"><v>46139</v></c><c r="C2"><v>12.5</v></c></row></sheetData></worksheet>',
  );
  return zip.generate({ type: "uint8array" }) as Uint8Array;
}

describe("leitor de xlsx", () => {
  it("lê textos compartilhados, inline, números e datas", () => {
    const [sheet] = readXlsx(xlsxMinimo());
    expect(sheet!.name).toBe("dados");
    expect(sheet!.rows[0]).toEqual(["Número do processo", null, "Valor"]);
    expect(sheet!.rows[1]).toEqual(["0001", "27/04/2026", 12.5]);
  });
});

describe("planilha Cível no formato das áreas (POLO ... PRINCIPAL, POLO CLIENTE, FORO, ANO)", () => {
  const sheet: SheetData = {
    name: "Planilha1",
    rows: [
      ["NÚMERO PROCESSO", "CLASSE", "TIPO", "TRÂMITE", "FORO", "VARA", "ANO", "VALOR DA CAUSA", "POLO ATIVO PRINCIPAL", "POLO PASSIVO PRINCIPAL", "POLO CLIENTE", "POSIÇÃO DO CLIENTE", "ID CLIENTE", "SÓCIO POLO PASSIVO", "SITUAÇÃO PROCESSUAL", "FASE"],
      ["0000001-11.2005.8.26.0100", "AÇÃO DE DESPEJO", "", "", "SP", "", 2005, 70605.76, "AUTOR FICTÍCIO", "RÉ FICTÍCIA LTDA", "TERCEIRO", "INTERESSADO", "CLIENTE", "NÃO", "EM TRÂMITE", "CONHECIMENTO"],
    ],
  };

  it("lê partes, polo do cliente, foro, ano e situação (teste 3, 22/10/2026)", () => {
    const [p] = normalizarPlanilha([sheet]).processos;
    expect(p).toMatchObject({
      poloAtivo: "AUTOR FICTÍCIO",
      poloPassivo: "RÉ FICTÍCIA LTDA",
      poloCliente: "TERCEIRO",
      socioPoloPassivo: "NAO",
      comarca: "SP",
      anoDistribuicao: 2005,
      situacao: "EM TRÂMITE",
      fase: "CONHECIMENTO",
    });
  });
});
