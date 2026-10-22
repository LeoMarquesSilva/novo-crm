import { describe, expect, it } from "vitest";
import { maximoEixo } from "./chart";
import { fillTokens, plainText } from "./text";
import { NS, desc, parseXml, serializeXml } from "./xml";

const A = `xmlns:a="${NS.a}"`;

function body(inner: string) {
  return parseXml(`<a:txBody ${A}>${inner}</a:txBody>`);
}

describe("fillTokens", () => {
  it("troca marcador quebrado em vários runs mantendo o formato do 1º", () => {
    const doc = body('<a:p><a:r><a:rPr b="1"/><a:t>Total: {{VA</a:t></a:r><a:r><a:t>LOR}} ok</a:t></a:r></a:p>');
    const missing = new Set<string>();
    fillTokens(doc.documentElement!, { VALOR: "R$ 10,00" }, missing);
    expect(plainText(doc.documentElement!)).toBe("Total: R$ 10,00 ok");
    expect(missing.size).toBe(0);
    expect(serializeXml(doc)).toContain('<a:rPr b="1"/><a:t>Total: R$ 10,00</a:t>');
  });

  it("expande parágrafo-marcador em várias linhas com negrito", () => {
    const doc = body('<a:p><a:pPr marL="1"/><a:r><a:rPr b="1" sz="900"/><a:t>{{BLOCO}}</a:t></a:r><a:endParaRPr/></a:p>');
    fillTokens(doc.documentElement!, { BLOCO: "**Citação?** não há registro.\n**Dívida paga?** não." }, new Set());
    const ps = desc(doc.documentElement!, NS.a, "p");
    expect(ps).toHaveLength(2);
    expect(plainText(doc.documentElement!)).toBe("Citação? não há registro.\nDívida paga? não.");
    const runs = desc(ps[0]!, NS.a, "r");
    expect(runs[0]!.getElementsByTagNameNS(NS.a, "rPr")[0]!.getAttribute("b")).toBe("1");
    expect(runs[1]!.getElementsByTagNameNS(NS.a, "rPr")[0]!.getAttribute("b")).toBe("0");
    expect(desc(ps[1]!, NS.a, "pPr")).toHaveLength(1);
  });

  it("marcador sem valor vira vazio e é avisado", () => {
    const doc = body("<a:p><a:r><a:t>{{NAO_EXISTE}}</a:t></a:r></a:p>");
    const missing = new Set<string>();
    fillTokens(doc.documentElement!, {}, missing);
    expect(plainText(doc.documentElement!)).toBe("");
    expect([...missing]).toEqual(["NAO_EXISTE"]);
  });
});


describe("maximoEixo", () => {
  it("dá folga e arredonda o máximo do eixo", () => {
    expect(maximoEixo(9)).toBe(12);
    expect(maximoEixo(82)).toBe(100);
    expect(maximoEixo(223_642)).toBe(300_000);
    expect(maximoEixo(0)).toBe(1);
  });
});
