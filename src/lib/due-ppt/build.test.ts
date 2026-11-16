import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeDeck, ehPessoaFisica, escalaRazaoSocial, type AreaDados } from "./compose";
import { draftSchema } from "./draft";
import { acentuar, separarDocumentos } from "./format";
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

  it("monta Cível (painel), Trabalhista (1 slide por processo, escolhido) e Tributário sem sobrar marcador", () => {
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
      areas: {
        civel: { incluir: true },
        trabalhista: { incluir: true, variante: "detalhe" },
        tributario: { incluir: true },
        rec_cred: { incluir: false },
      },
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

  it("Trabalhista com poucos processos sai em tabela (como a área monta); Cível em lista sem a coluna extra", () => {
    const trab = Array.from({ length: 3 }, (_, i) =>
      proc(i + 50, {
        poloAtivo: `RECLAMANTE ${i}`,
        poloPassivo: "TERCEIRA LTDA, EMPRESA TESTE LTDA, OUTRA LTDA",
        valorEnvolvido: 5000 * (i + 1),
        origemValor: "Decisão homologatória",
        ultimoMovimento: "Aguardando homologação de cálculos.",
        tribunal: "TRT15",
      }),
    );
    const civel = Array.from({ length: 3 }, (_, i) => proc(i + 1, {}));
    const draft = draftSchema.parse({
      capa: { razaoSocial: "EMPRESA TESTE LTDA" },
      areas: { trabalhista: { incluir: true }, civel: { incluir: true, variante: "lista" } },
    });
    const { spec, resumos } = composeDeck({
      draft,
      areas: [
        { id: "trabalhista", processos: trab, extras: { pge: null, pgfn: null } },
        { id: "civel", processos: civel, extras: { pge: null, pgfn: null } },
      ],
      hoje: new Date("2026-11-11T00:00:00Z"),
    });
    expect(resumos.map((r) => [r.id, r.variante])).toEqual([
      ["civel", "lista"],
      ["trabalhista", "lista"],
    ]);
    const out = buildDeck(modelo, spec);
    expect(out.warnings).toEqual([]);
    const pkg = new PptxPackage(out.bytes);
    const slides = pkg.slidePaths();
    const listas = slides.filter((p) => slideMarker(pkg.xml(p)) === "SLIDE_LISTA");
    expect(listas).toHaveLength(2);
    const colunas = (p: string) => desc(desc(findShape(pkg.xml(p), "TBL_LISTA")!, NS.a, "tbl")[0]!, NS.a, "gridCol").length;
    const [civelLista, trabLista] = listas as [string, string];
    expect(colunas(civelLista)).toBe(5);
    expect(colunas(trabLista)).toBe(6);
    const texto = textoDoSlide(pkg, trabLista);
    expect(texto).toContain("PROCESSOS ATIVOS (3)");
    expect(texto).toContain("Origem do valor");
    expect(texto).toContain("Decisão homologatória");
    expect(texto).toContain("Aguardando homologação de cálculos.");
    expect(texto).toContain("TERCEIRA LTDA, EMPRESA TESTE LTDA e outros");
    for (const p of slides) expect(textoDoSlide(pkg, p)).not.toContain("{{");
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

describe.skipIf(!existsSync(MODELO))("Reestruturação e slides por processo", () => {
  const modelo = new Uint8Array(readFileSync(MODELO));
  const montar = (draft: unknown, areas: AreaDados[] = []) => {
    const { spec, resumos } = composeDeck({ draft: draftSchema.parse(draft), areas, hoje: new Date("2026-11-11T00:00:00Z") });
    const out = buildDeck(modelo, spec);
    const pkg = new PptxPackage(out.bytes);
    const slides = pkg.slidePaths();
    const marcadores = slides.map((p) => slideMarker(pkg.xml(p)));
    return { out, pkg, slides, marcadores, resumos };
  };

  it("RJ só com a documentação inicial e pedidos de falência", () => {
    const { out, pkg, slides, marcadores, resumos } = montar({
      capa: { razaoSocial: "EMPRESA TESTE LTDA" },
      areas: { reestruturacao: { incluir: true } },
      reestruturacao: {
        autos: "5014630-47.2022.8.24.0038",
        recuperandas: "EMPRESA TESTE LTDA",
        passivoTotal: 300,
        endividamentoFonte: "inicial",
        classes: [
          { classe: "Classe I – Trabalhista", edital: 100 },
          { classe: "Classe III – Quirografário", edital: 200 },
        ],
        falencias: [
          { autos: "5057064-80.2026.8.21.0010", requerente: "CREDORA S.A.", valorCausa: 50, situacao: "Em andamento", juiz: "Fulano" },
          { autos: "", requerente: "" },
        ],
      },
    });
    expect(out.warnings).toEqual([]);
    expect(marcadores.filter((m) => m === "SLIDE_DETALHE")).toHaveLength(1);
    expect(resumos[0]?.notaConclusao).toContain("documentação inicial");

    const rj = pkg.xml(slides[marcadores.indexOf("SLIDE_REEST_RJ")]!);
    expect(findShape(rj, "Juiz Label")).toBeNull();
    expect(findShape(rj, "Admin Value")).toBeNull();

    const end = pkg.xml(slides[marcadores.indexOf("SLIDE_REEST_ENDIVIDAMENTO")]!);
    const tbl = desc(findShape(end, "TBL_RJ_CLASSES")!, NS.a, "tbl")[0]!;
    expect(desc(tbl, NS.a, "gridCol")).toHaveLength(2);
    expect(findShape(end, "RJ_VARIACAO_CHIP")).toBeNull();
    const textoEnd = textoDoSlide(pkg, slides[marcadores.indexOf("SLIDE_REEST_ENDIVIDAMENTO")]!);
    expect(textoEnd).toContain("DOCUMENTAÇÃO INICIAL");
    expect(textoEnd).not.toContain("RELATÓRIO AJ");

    const fal = slides[marcadores.indexOf("SLIDE_DETALHE")]!;
    const textoFal = textoDoSlide(pkg, fal);
    expect(textoFal).toContain("Pedido de Falência");
    expect(textoFal).toContain("TJRS");
    expect(textoFal).toContain("EMPRESA TESTE LTDA");
    expect(findShape(pkg.xml(fal), "Cargo Label")).toBeNull();
    for (const p of slides) expect(textoDoSlide(pkg, p)).not.toContain("{{");
  });

  it("slide de processo: partes longas empurram os blocos e a vara não repete a comarca", () => {
    const rc = [
      proc(1, {
        poloAtivo: "EMPRESA COMERCIAL EXPORTADORA DE OLEOQUIMICOS LTDA",
        poloPassivo: "DEVEDOR UM LTDA, DEVEDOR DOIS LTDA, DEVEDOR TRES LTDA",
        classe: "EXECUCAO DE TITULO EXTRAJUDICIAL",
        vara: "PRIMEIRA VARA CIVEL DA COMARCA DE SAO BENTO DO SUL",
        comarca: "SAO BENTO DO SUL",
        uf: "SC",
      }),
    ];
    const { pkg, slides, marcadores } = montar(
      { capa: { razaoSocial: "X" }, areas: { rec_cred: { incluir: true } } },
      [{ id: "rec_cred", processos: rc, extras: { pge: null, pgfn: null } }],
    );
    const p = slides[marcadores.indexOf("SLIDE_DETALHE")]!;
    const texto = textoDoSlide(pkg, p);
    expect(texto).toContain("DEVEDOR UM LTDA, DEVEDOR DOIS LTDA e outros");
    expect(texto).toContain("Primeira Vara Cível da Comarca de São Bento do Sul/SC");
    expect(texto).toContain("Execução de Título Extrajudicial movida por");
    const base = new PptxPackage(modelo);
    const original = base.xml(base.slidePaths().find((s) => slideMarker(base.xml(s)) === "SLIDE_DETALHE")!);
    expect(box(findShape(pkg.xml(p), "Pedidos Label")!).y).toBeGreaterThan(box(findShape(original, "Pedidos Label")!).y);
  });
});

describe("acentos", () => {
  it("devolve acentos comuns e não mexe em texto acentuado", () => {
    expect(acentuar("EXECUCAO DE TITULO EXTRAJUDICIAL")).toBe("EXECUÇÃO DE TÍTULO EXTRAJUDICIAL");
    expect(acentuar("Cumprimento de sentenca")).toBe("Cumprimento de sentença");
    expect(acentuar("Execução de titulo")).toBe("Execução de titulo");
  });
});

describe.skipIf(!existsSync(MODELO))("pessoas físicas e Tributário só com dívida ativa", () => {
  const modelo = new Uint8Array(readFileSync(MODELO));

  it("capa com nome, sem documento, e 4 pessoas; PGFN por devedor; texto sem execução fiscal", () => {
    const draft = draftSchema.parse({
      capa: {
        razaoSocial: "FULANO DE TAL NETO",
        cnpj: "",
        empresas: [
          { razaoSocial: "BELTRANO DE TAL", cnpj: "123.456.789-09" },
          { razaoSocial: "CICLANA DE TAL", cnpj: "" },
          { razaoSocial: "OUTRO DE TAL", cnpj: "" },
          { razaoSocial: "EMPRESA DE TAL LTDA", cnpj: "07.339.867/0001-15" },
        ],
      },
      areas: { tributario: { incluir: true } },
    });
    const extras = {
      pge: 10,
      pgfn: { tributario: 300, previdenciario: 0, multa: 0 },
      pgfnDevedores: [
        { nome: "BELTRANO DE TAL", valor: 100 },
        { nome: "FULANO DE TAL NETO", valor: 200 },
      ],
    };
    const { spec, resumos } = composeDeck({
      draft,
      areas: [{ id: "tributario", processos: [], extras }],
      hoje: new Date("2026-11-13T00:00:00Z"),
    });
    expect(resumos[0]?.textos.leitura?.texto).toContain("Não foram identificados processos judiciais");
    const out = buildDeck(modelo, spec);
    expect(out.warnings).toEqual([]);
    const pkg = new PptxPackage(out.bytes);
    const slides = pkg.slidePaths();
    const marcadores = slides.map((p) => slideMarker(pkg.xml(p)));

    const capaPath = slides[marcadores.indexOf("SLIDE_DUE_CAPA")]!;
    const capa = textoDoSlide(pkg, capaPath);
    expect(capa).toContain("NOME");
    expect(capa).not.toContain("RAZÃO SOCIAL");
    expect(capa).toContain("CPF: 123.456.789-09");
    expect(capa).toContain("CNPJ: 07.339.867/0001-15");
    expect(capa).toContain("OUTRO DE TAL");
    const capaXml = pkg.xml(capaPath);
    expect(findShape(capaXml, "TXT_CNPJ")).toBeNull();
    expect(findShape(capaXml, "ICO_EMPRESA_1")).toBeNull();
    expect(findShape(capaXml, "ICO_EMPRESA_4")).not.toBeNull();
    // Pessoa física sem logo: o círculo do cliente fica, com a silhueta de pessoa.
    expect(findShape(capaXml, "IMG_ICONE_PESSOA")).not.toBeNull();
    expect(findShape(capaXml, "CIRCULO_CLIENTE")).not.toBeNull();
    expect(findShape(capaXml, "IMG_LOGO_CLIENTE")).toBeNull();

    const trib = textoDoSlide(pkg, slides[marcadores.indexOf("SLIDE_TRIB_PAINEL")]!);
    expect(trib).toContain("DÉBITOS POR DEVEDOR");
    expect(trib).toContain("Fulano de Tal Neto");
    expect(trib).not.toContain("Previdenciário");
    for (const p of slides) expect(textoDoSlide(pkg, p)).not.toContain("{{");
  });
});

describe("capa", () => {
  it("separa os CPFs/CNPJs emendados do cadastro do RD, na ordem dos nomes", () => {
    expect(separarDocumentos("2169943080262125796872216993268273016441284002034137841", 5)).toEqual([
      "216.994.308-02",
      "621.257.968-72",
      "216.993.268-27",
      "301.644.128-40",
      "020.341.378-41",
    ]);
    expect(separarDocumentos("073398670001150733986700038729138855000165", 3)).toEqual([
      "07.339.867/0001-15",
      "07.339.867/0003-87",
      "29.138.855/0001-65",
    ]);
    expect(separarDocumentos("2169943080262125796872", 3)).toEqual([]);
    expect(separarDocumentos("12345678901", 1)).toEqual([]);
  });

  it("pessoa física: CPF, ou nome sem cara de empresa", () => {
    expect(ehPessoaFisica("FULANO DE TAL", "")).toBe(true);
    expect(ehPessoaFisica("QUALQUER COISA", "123.456.789-09")).toBe(true);
    expect(ehPessoaFisica("SYNVIA LABORATÓRIOS E TOXICOLOGIA LTDA", "")).toBe(false);
    expect(ehPessoaFisica("SYNVIA PARTICIPAÇÕES SOCIETÁRIAS", "")).toBe(false);
  });

  it("razão social longa sai com fonte menor para caber em 2 linhas", () => {
    expect(escalaRazaoSocial("SEDNA YATCHS LTDA")).toBe(1);
    expect(escalaRazaoSocial("PRISMA COMERCIAL EXPORTADORA DE OLEOQUÍMICOS LTDA.")).toBe(0.75);
  });
});

describe("área que concluiu sem processos ativos (16/11/2026)", () => {
  it("não vira aviso de 'sem planilha': aparece como levantamento concluído", () => {
    const draft = draftSchema.parse({ capa: { razaoSocial: "X" }, areas: { trabalhista: { incluir: true }, tributario: { incluir: true } } });
    const r = composeDeck({
      draft,
      areas: [],
      hoje: new Date("2026-11-16T12:00:00Z"),
      semProcessos: [{ area: "trabalhista", responsavel: "Daniel Pressatto Fernandes", em: "16/11/2026" }],
    });
    expect(r.avisos.some((a) => a.startsWith("Trabalhista"))).toBe(false);
    expect(r.concluidasSemProcessos).toEqual([
      "Trabalhista: levantamento concluído em 16/11/2026 (Daniel Pressatto Fernandes), sem processos ativos — não entra na apresentação.",
    ]);
    // Área sem planilha e sem a marcação continua sendo pendência.
    expect(r.avisos).toContain("Tributário: sem planilha anexada — a área fica fora da apresentação.");
  });
});
