import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeDeck, type AreaDados } from "./compose";
import { draftSchema } from "./draft";
import { conferirModelo } from "./modelo";
import { buildDeck } from "./pptx/build";
import { PptxPackage, slideMarker } from "./pptx/package";
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
});
