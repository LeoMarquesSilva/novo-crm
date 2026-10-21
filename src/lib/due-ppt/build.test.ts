import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeDeck, type AreaDados } from "./compose";
import { draftSchema } from "./draft";
import { conferirModelo } from "./modelo";
import { buildDeck } from "./pptx/build";
import { PptxPackage, slideMarker } from "./pptx/package";
import { box, findByPrefix, findShape } from "./pptx/shapes";
import { NS, desc } from "./pptx/xml";
import type { Processo } from "./processos";

const MODELO = path.resolve(__dirname, "../../../templates/due/MODELO-DUE-CRM.pptx");

function proc(i: number, p: Partial<Processo>): Processo {
  return {
    numero: `${String(1000000 + i)}-11.2025.8.26.0100`,
    situacao: "Ativo",
    fase: "Conhecimento",
    classe: "PROCEDIMENTO COMUM CÍVEL",
    poloAtivo: `AUTOR ${i}`,
    poloPassivo: "EMPRESA TESTE LTDA",
    poloCliente: "PASSIVO",
    socioPoloPassivo: "NAO",
    dataDistribuicao: `202${i % 5}-0${(i % 9) + 1}-10`,
    comarca: "CAMPINAS",
    vara: "1 VARA CIVEL",
    tribunal: "TJSP",
    instancia: "1",
    uf: "São Paulo",
    valorCausa: 10_000 * i,
    valorEnvolvido: null,
    valorAcordo: 0,
    valorLiquidacao: 0,
    origemValor: "",
    pedidos: "",
    assuntos: "",
    cargos: "",
    ultimoMovimento: "Conclusos para despacho",
    indicativoBloqueio: null,
    indicativoRevelia: null,
    dataAcordo: null,
    dataArquivamento: null,
    documento: "",
    nome: "",
    ...p,
  };
}

function textoDoSlide(pkg: PptxPackage, p: string): string {
  return desc(pkg.xml(p), NS.a, "t")
    .map((t) => t.textContent ?? "")
    .join(" ");
}

describe.skipIf(!existsSync(MODELO))("apresentação gerada a partir do modelo do repositório", () => {
  const modelo = new Uint8Array(readFileSync(MODELO));

  it("o modelo tem todos os slides do contrato", () => {
    const c = conferirModelo(modelo);
    expect(c.faltando).toEqual([]);
    expect(c.marcadores).toBeGreaterThan(100);
  });

  it("monta Cível (painel), Trabalhista (1 slide por processo) e Tributário sem sobrar marcador", () => {
    const civel = Array.from({ length: 12 }, (_, i) => proc(i + 1, { fase: i % 4 === 0 ? "Execução" : "Conhecimento" }));
    const trab = Array.from({ length: 3 }, (_, i) =>
      proc(i + 50, { poloAtivo: `RECLAMANTE ${i}`, valorEnvolvido: 5000 * (i + 1), assuntos: "Horas Extras", tribunal: "TRT15" }),
    );
    const trib = [proc(80, { poloAtivo: "ESTADO DE SAO PAULO", classe: "EXECUCAO FISCAL", situacao: "EM TRAMITAÇÃO" })];
    const areas: AreaDados[] = [
      { id: "civel", processos: civel, extras: { pge: null, pgfn: null } },
      { id: "trabalhista", processos: trab, extras: { pge: null, pgfn: null } },
      { id: "tributario", processos: trib, extras: { pge: 1234.5, pgfn: null } },
    ];
    const draft = draftSchema.parse({
      capa: { razaoSocial: "EMPRESA TESTE LTDA", cnpj: "00.000.000/0001-00", empresas: [{ razaoSocial: "FILIAL", cnpj: "1" }] },
      areas: { civel: { incluir: true }, trabalhista: { incluir: true }, tributario: { incluir: true }, rec_cred: { incluir: false } },
    });
    const { spec, resumos } = composeDeck({ draft, areas, hoje: new Date("2026-10-20T00:00:00Z") });
    expect(resumos.map((r) => [r.id, r.variante])).toEqual([
      ["civel", "painel"],
      ["trabalhista", "detalhe"],
      ["tributario", "painel"],
    ]);

    const out = buildDeck(modelo, spec);
    expect(out.warnings).toEqual([]);
    const pkg = new PptxPackage(out.bytes);
    const slides = pkg.slidePaths();
    const marcadores = slides.map((p) => slideMarker(pkg.xml(p)));
    expect(marcadores).toEqual([
      "SLIDE_CAPA",
      "SLIDE_SOBRE",
      "SLIDE_RECONHECIMENTOS",
      "SLIDE_METODOLOGIA",
      "SLIDE_DUE_CAPA",
      "SLIDE_AREAS",
      "SLIDE_CIVEL_DIVISOR",
      "SLIDE_CIVEL_PAINEL",
      "SLIDE_TRAB_DIVISOR",
      "SLIDE_DETALHE",
      "SLIDE_DETALHE",
      "SLIDE_DETALHE",
      "SLIDE_TRIB_DIVISOR",
      "SLIDE_TRIB_PAINEL",
      "SLIDE_CONCLUSAO",
      "SLIDE_SOCIOS",
    ]);
    for (const p of slides) expect(textoDoSlide(pkg, p)).not.toContain("{{");

    expect(textoDoSlide(pkg, slides[3]!)).toContain("as esferas cível, trabalhista e tributária");
    expect(textoDoSlide(pkg, slides[4]!)).toContain("EMPRESA TESTE LTDA");
    // Passivo cível = soma do polo passivo (12 processos de 10 mil a 120 mil).
    expect(textoDoSlide(pkg, slides[7]!)).toContain("R$ 780.000,00");
    expect(textoDoSlide(pkg, slides[9]!)).toContain("RECLAMANTE 2");
    const conclusao = textoDoSlide(pkg, slides[14]!);
    expect(conclusao).toContain("Cível");
    expect(conclusao).toContain("Soma do potencial passivo");

    // Slides, gráficos e mídias que não entram saem do pacote (aqui nenhum painel tem gráfico).
    expect(pkg.files().some((f) => f.startsWith("ppt/charts/"))).toBe(false);
    expect(out.bytes.byteLength).toBeLessThan(modelo.byteLength);
    expect(pkg.files().filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(slides.length);
  });

  it("Recuperação de Crédito em painel atualiza os gráficos e vai para a conclusão com crédito", () => {
    const rc = Array.from({ length: 8 }, (_, i) =>
      proc(i + 1, { poloAtivo: "EMPRESA TESTE LTDA", poloPassivo: `DEVEDOR ${i} LTDA`, classe: i % 2 ? "MONITÓRIA" : "EXECUÇÃO DE TÍTULO" }),
    );
    const draft = draftSchema.parse({ capa: { razaoSocial: "X" }, areas: { rec_cred: { incluir: true } } });
    const { spec } = composeDeck({
      draft,
      areas: [{ id: "rec_cred", processos: rc, extras: { pge: null, pgfn: null } }],
      hoje: new Date("2026-10-20T00:00:00Z"),
    });
    const out = buildDeck(modelo, spec);
    const pkg = new PptxPackage(out.bytes);
    const slides = pkg.slidePaths();
    const marcadores = slides.map((p) => slideMarker(pkg.xml(p)));
    expect(marcadores).toContain("SLIDE_RC_PAINEL");
    expect(marcadores).toContain("SLIDE_CONCLUSAO_CREDITO");
    const painel = slides[marcadores.indexOf("SLIDE_RC_PAINEL")]!;
    const chartPaths = pkg.rels(painel).filter((r) => r.type.endsWith("/chart")).map((r) => r.path);
    expect(chartPaths).toHaveLength(4);
    const tipo = chartPaths
      .map((c) => desc(pkg.xml(c), NS.c, "v").map((v) => v.textContent ?? ""))
      .find((vs) => vs.includes("MONITÓRIA"));
    expect(tipo).toBeDefined();
    for (const p of slides) expect(textoDoSlide(pkg, p)).not.toContain("{{");
  });

  it("Cível: região em até 4 colunas (+ Outros) e os dois itens de sócio", () => {
    const civel = (regs: Array<[string, string, number]>) => {
      let i = 0;
      return regs.flatMap(([tribunal, tr, qtd]) =>
        Array.from({ length: qtd }, () => {
          i++;
          return proc(i, { tribunal, numero: `${2000000 + i}-11.2025.8.${tr}.0100`, socioPoloPassivo: i % 4 ? "NAO" : "SIM" });
        }),
      );
    };
    const montar = (processos: Processo[]) => {
      const draft = draftSchema.parse({ capa: { razaoSocial: "X" }, areas: { civel: { incluir: true } } });
      const { spec } = composeDeck({
        draft,
        areas: [{ id: "civel", processos, extras: { pge: null, pgfn: null } }],
        hoje: new Date("2026-10-20T00:00:00Z"),
      });
      const out = buildDeck(modelo, spec);
      expect(out.warnings).toEqual([]);
      const pkg = new PptxPackage(out.bytes);
      const painel = pkg.slidePaths().find((p) => slideMarker(pkg.xml(p)) === "SLIDE_CIVEL_PAINEL")!;
      const doc = pkg.xml(painel);
      const texto = (nome: string) =>
        desc(findShape(doc, nome)!, NS.a, "t")
          .map((t) => t.textContent ?? "")
          .join("");
      const tokens = spec.slides.find((s) => s.source === "SLIDE_CIVEL_PAINEL")!.tokens!;
      expect(textoDoSlide(pkg, painel)).not.toContain("{{");
      return { doc, texto, tokens };
    };

    const cinco = montar(civel([["TJSC", "24", 6], ["TJSP", "26", 4], ["TJRJ", "19", 3], ["TJRS", "21", 2], ["TJPE", "17", 1]]));
    expect([1, 2, 3, 4].map((i) => cinco.texto(`CIVEL_TRIBUNAL_${i}_NOME`))).toEqual(["SC · TJSC", "SP · TJSP", "RJ · TJRJ", "Outros"]);
    expect(cinco.texto("CIVEL_TRIBUNAL_4_QTD")).toBe("03");
    expect(findByPrefix(cinco.doc, "CIVEL_TRIBUNAL_DIV_")).toHaveLength(3);
    expect([cinco.texto("CIVEL_SOCIO_1_NOME"), cinco.texto("CIVEL_SOCIO_2_NOME")]).toEqual(["Sim", "Não"]);
    expect(cinco.texto("CIVEL_SOCIO_2_QTD")).toBe("Processos: 12");
    // Modelo antigo (só CIVEL_REGIAO_1/2): o maior + "Outros", como antes.
    expect([cinco.tokens.CIVEL_REGIAO_1, cinco.tokens.CIVEL_REGIAO_1_QTD, cinco.tokens.CIVEL_REGIAO_2, cinco.tokens.CIVEL_REGIAO_2_QTD]).toEqual(
      ["TJSC", "06", "Outros", "10"],
    );

    // Duas colunas dividem a faixa ao meio, com a divisória na fronteira.
    const dois = montar(civel([["TJSP", "26", 4], ["TJDFT", "07", 3]]));
    expect([dois.texto("CIVEL_TRIBUNAL_1_NOME"), dois.texto("CIVEL_TRIBUNAL_2_NOME")]).toEqual(["SP · TJSP", "DF · TJDFT"]);
    expect(findShape(dois.doc, "CIVEL_TRIBUNAL_3_NOME")).toBeNull();
    const col1 = box(findShape(dois.doc, "CIVEL_TRIBUNAL_1_NOME")!);
    const col2 = box(findShape(dois.doc, "CIVEL_TRIBUNAL_2_NOME")!);
    const div = box(findShape(dois.doc, "CIVEL_TRIBUNAL_DIV_1")!);
    expect(col2.x).toBe(col1.x + col1.w);
    expect(Math.abs(div.x + div.w / 2 - col2.x)).toBeLessThanOrEqual(1);
    expect(findShape(dois.doc, "CIVEL_TRIBUNAL_DIV_2")).toBeNull();

    const um = montar(civel([["TJSP", "26", 7]]));
    expect(um.texto("CIVEL_TRIBUNAL_1_NOME")).toBe("SP · TJSP");
    expect(findShape(um.doc, "CIVEL_TRIBUNAL_2_NOME")).toBeNull();
    expect(findByPrefix(um.doc, "CIVEL_TRIBUNAL_DIV_")).toHaveLength(0);
    expect(box(findShape(um.doc, "CIVEL_TRIBUNAL_1_NOME")!).w).toBe(2 * col1.w);
  });
});
