import { describe, expect, it } from "vitest";
import { reestruturacaoSchema } from "./draft";
import {
  dataIa,
  parseRespostaReestruturacao,
  recortarTrechos,
  reestruturacaoJsonSchema,
  REEST_RECORTE_CHAR_CAP,
  tipoPeca,
  valorIa,
} from "./reestruturacao-ia";

const ENCHIMENTO = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(600);

describe("recortarTrechos", () => {
  it("manda o documento curto inteiro, com cabeçalho e tipo da peça", () => {
    const texto = "EDITAL\nRelação de credores (art. 52, §1º)\nClasse I – Trabalhista: R$ 1.000,00";
    const r = recortarTrechos([{ nome: "edital.pdf", texto, paginas: 3 }]);
    expect(r.texto).toContain("=== Documento 1: edital.pdf (edital do art. 52, §1º — 3 páginas) ===");
    expect(r.texto).toContain("Classe I – Trabalhista: R$ 1.000,00");
    expect(r.documentos).toEqual([{ nome: "edital.pdf", tipo: "edital", caracteres: texto.length, recortados: texto.length }]);
  });

  it("no documento longo, fica com o começo e os trechos do plano, sem o enchimento do fim", () => {
    const texto = [
      "PLANO DE RECUPERAÇÃO JUDICIAL",
      "Autos nº 1234567-89.2025.8.26.0114 — Recuperandas: ALFA LTDA e BETA S.A.",
      ENCHIMENTO,
      "Classe III – Quirografários: deságio de 60%, carência de 18 meses e pagamento em 120 parcelas mensais.",
      ENCHIMENTO,
      "Credores Parceiros (Opção A): fornecimento contínuo; deságio reduzido de 20%.",
      ENCHIMENTO,
      "RODAPÉ SEM INTERESSE PARA O FORMULÁRIO",
    ].join("\n");

    const r = recortarTrechos([{ nome: "prj.pdf", texto }], 8_000);

    expect(r.texto.length).toBeLessThanOrEqual(8_000);
    expect(r.documentos[0]!.tipo).toBe("plano");
    // Contado depois de limpar os espaços sobrando.
    expect(r.documentos[0]!.caracteres).toBeGreaterThan(100_000);
    expect(r.documentos[0]!.recortados).toBeLessThan(8_000);
    expect(r.texto).toContain("1234567-89.2025.8.26.0114");
    expect(r.texto).toContain("deságio de 60%, carência de 18 meses");
    expect(r.texto).toContain("Credores Parceiros (Opção A)");
    expect(r.texto).toContain("[...]");
    expect(r.texto).not.toContain("RODAPÉ SEM INTERESSE");
  });

  it("prefere o trecho com mais termos diferentes quando não cabe tudo", () => {
    const repetido = "Ver parcela. ".repeat(40);
    const texto = [
      "Capa do documento.",
      ENCHIMENTO,
      repetido,
      ENCHIMENTO,
      "Classe II – Garantia real: deságio de 30%, carência de 12 meses, juros de 1% ao ano + TR.",
      ENCHIMENTO,
    ].join("\n");
    const r = recortarTrechos([{ nome: "plano.pdf", texto }], 2_000);
    expect(r.texto.length).toBeLessThanOrEqual(2_000);
    expect(r.texto).toContain("deságio de 30%, carência de 12 meses");
  });

  it("respeita o teto somando vários documentos e reparte a sobra do curto", () => {
    const longo = (titulo: string) =>
      `${titulo}\n${"Classe I – Trabalhista R$ 1.000,00; deságio; carência; administrador judicial. ".repeat(2_000)}`;
    const curto = "EDITAL — Total geral da relação de credores: R$ 5.000.000,00";
    const r = recortarTrechos(
      [
        { nome: "edital.pdf", texto: curto },
        { nome: "relatorio-aj.pdf", texto: longo("RELATÓRIO MENSAL DE ATIVIDADES") },
        { nome: "plano.pdf", texto: longo("PLANO DE RECUPERAÇÃO JUDICIAL") },
      ],
      20_000,
    );
    expect(r.texto.length).toBeLessThanOrEqual(20_000);
    expect(r.documentos.map((d) => d.tipo)).toEqual(["edital", "relatorio_aj", "plano"]);
    expect(r.documentos[0]!.recortados).toBe(curto.length);
    // Os dois longos dividem o que o curto não usou.
    expect(r.documentos[1]!.recortados).toBeGreaterThan(8_000);
    expect(r.documentos[2]!.recortados).toBeGreaterThan(8_000);
    expect(r.texto).toContain("=== Documento 3: plano.pdf");
  });

  it("marca PDF sem texto e usa o teto padrão", () => {
    const r = recortarTrechos([{ nome: "scan.pdf", texto: "   " }]);
    expect(r.texto).toContain("(sem texto legível)");
    expect(r.texto.length).toBeLessThanOrEqual(REEST_RECORTE_CHAR_CAP);
  });
});

describe("tipoPeca", () => {
  it("reconhece pelo nome do arquivo", () => {
    expect(tipoPeca("Edital art 52 §1º.pdf", "")).toBe("edital");
    expect(tipoPeca("RMA agosto-2025.pdf", "")).toBe("relatorio_aj");
    expect(tipoPeca("Relatório do AJ.pdf", "")).toBe("relatorio_aj");
    expect(tipoPeca("PRJ consolidado.pdf", "")).toBe("plano");
  });

  it("reconhece pelo começo do texto", () => {
    expect(tipoPeca("doc.pdf", "PLANO DE RECUPERAÇÃO JUDICIAL do Grupo X")).toBe("plano");
    expect(tipoPeca("doc.pdf", "Relatório Mensal de Atividades — competência julho")).toBe("relatorio_aj");
    expect(tipoPeca("doc.pdf", "Vistos. Defiro o processamento da recuperação judicial.")).toBe("decisao");
    expect(tipoPeca("doc.pdf", "Petição inicial")).toBe("outro");
  });
});

describe("parseRespostaReestruturacao", () => {
  const resposta = {
    autos: "1234567-89.2025.8.26.0114",
    recuperandas: "ALFA LTDA | BETA S.A.",
    competencia: "2ª Vara Regional de Competência Empresarial",
    juiz: "Dr. Fulano de Tal",
    relator: "",
    administrador: "AJ Consultoria Ltda.",
    resumo: "Recuperação judicial ajuizada em 10/01/2025 • Plano apresentado em 15/03/2025",
    passivoTotal: 12345678.9,
    deferimento: "2025-01-20",
    ajuizamento: "2025-01-10",
    foro: "Campinas – SP",
    classes: [
      { classe: "Classe I – Trabalhista", edital: 1000, aj: 1200.5 },
      { classe: "Classe III – Quirografários", edital: 5000000, aj: null },
    ],
    extraconcursalEdital: null,
    extraconcursalAj: 300000,
    endividamentoResumo: "Concentração na Classe III.",
    pagamento: [{ classe: "Classe III", desagio: "60%", carencia: "18 meses", forma: "120 parcelas", atualizacao: "TR + 1% a.a." }],
    opcoes: [{ rotulo: "OPÇÃO A", titulo: "Credores parceiros", contrapartida: "Fornecimento", condicoes: "Deságio 20%", obs: "" }],
    medidas: [{ categoria: "CAPTAÇÃO", titulo: "Financiamento DIP", destaque: "Até R$ 50 milhões", preve: "Captação", objetivo: "Caixa" }],
  };

  it("aceita a resposta no formato do schema e valida com reestruturacaoSchema", () => {
    const form = parseRespostaReestruturacao(resposta);
    expect(form).toEqual(reestruturacaoSchema.parse(resposta));
    expect(form.passivoTotal).toBe(12345678.9);
    expect(form.classes[1]).toEqual({ classe: "Classe III – Quirografários", edital: 5000000, aj: null });
  });

  it("converte valores em texto e datas dd/mm/aaaa; descarta o que não dá para ler", () => {
    const form = parseRespostaReestruturacao({
      ...resposta,
      passivoTotal: "R$ 12.345.678,90",
      extraconcursalEdital: "não informado",
      classes: [{ classe: "Classe II", edital: "1.500.000,00", aj: "n/a" }],
      deferimento: "20/01/2025",
      ajuizamento: "31/02/2025",
    });
    expect(form.passivoTotal).toBe(12345678.9);
    expect(form.extraconcursalEdital).toBeNull();
    expect(form.classes).toEqual([{ classe: "Classe II", edital: 1500000, aj: null }]);
    expect(form.deferimento).toBe("2025-01-20");
    expect(form.ajuizamento).toBe("");
  });

  it("devolve o formulário vazio quando a resposta não é um objeto", () => {
    const vazio = reestruturacaoSchema.parse({});
    expect(parseRespostaReestruturacao(null)).toEqual(vazio);
    expect(parseRespostaReestruturacao("texto")).toEqual(vazio);
    expect(parseRespostaReestruturacao([])).toEqual(vazio);
    expect(parseRespostaReestruturacao({ autos: null, classes: "x", opcoes: [null] })).toEqual(vazio);
  });

  it("corta textos no limite do schema", () => {
    const longo = "x".repeat(10_000);
    const tudoLongo = Object.fromEntries(Object.keys(resposta).map((k) => [k, longo]));
    const form = parseRespostaReestruturacao({
      ...tudoLongo,
      passivoTotal: null,
      extraconcursalEdital: null,
      extraconcursalAj: null,
      classes: [{ classe: longo, edital: 1, aj: 2 }],
      pagamento: [{ classe: longo, desagio: longo, carencia: longo, forma: longo, atualizacao: longo }],
      opcoes: [{ rotulo: longo, titulo: longo, contrapartida: longo, condicoes: longo, obs: longo }],
      medidas: [{ categoria: longo, titulo: longo, destaque: longo, preve: longo, objetivo: longo }],
    });
    expect(form.autos).toHaveLength(200);
    expect(form.autos.endsWith("…")).toBe(true);
    expect(form.recuperandas).toHaveLength(2000);
    expect(form.deferimento).toBe("");
    expect(form.opcoes[0]!.contrapartida).toHaveLength(1500);
    expect(form.medidas[0]!.destaque).toHaveLength(120);
  });

  it("limita as listas, tira linhas vazias e dá rótulo às formas especiais", () => {
    const form = parseRespostaReestruturacao({
      ...resposta,
      classes: [
        ...Array.from({ length: 25 }, (_, i) => ({ classe: `Classe ${i}`, edital: i, aj: null })),
        { classe: "", edital: null, aj: null },
      ],
      opcoes: [
        { rotulo: "", titulo: "Parceiros", contrapartida: "", condicoes: "", obs: "" },
        { rotulo: "OPÇÃO B", titulo: "", contrapartida: "", condicoes: "", obs: "" },
        { rotulo: "", titulo: "Financiadores", contrapartida: "", condicoes: "", obs: "" },
        { rotulo: "", titulo: "Fornecedores", contrapartida: "", condicoes: "", obs: "" },
      ],
      medidas: Array.from({ length: 6 }, (_, i) => ({ categoria: "", titulo: `Medida ${i}`, destaque: "", preve: "", objetivo: "" })),
      pagamento: [{ classe: "", desagio: "", carencia: "", forma: "", atualizacao: "" }],
    });
    expect(form.classes).toHaveLength(20);
    expect(form.opcoes.map((o) => [o.rotulo, o.titulo])).toEqual([
      ["OPÇÃO A", "Parceiros"],
      ["OPÇÃO B", "Financiadores"],
    ]);
    expect(form.medidas.map((m) => m.titulo)).toEqual(["Medida 0", "Medida 1", "Medida 2"]);
    expect(form.pagamento).toEqual([]);
  });

  it("move a linha de extraconcursal das classes para os campos próprios", () => {
    const form = parseRespostaReestruturacao({
      ...resposta,
      extraconcursalEdital: null,
      extraconcursalAj: 999,
      classes: [...resposta.classes, { classe: "Créditos extraconcursais", edital: 100, aj: 200 }],
    });
    expect(form.classes.map((c) => c.classe)).toEqual(["Classe I – Trabalhista", "Classe III – Quirografários"]);
    expect(form.extraconcursalEdital).toBe(100);
    expect(form.extraconcursalAj).toBe(999);
  });
});

describe("valorIa / dataIa", () => {
  it("lê valores em reais", () => {
    expect(valorIa(1234.567)).toBe(1234.57);
    expect(valorIa("1.234,56")).toBe(1234.56);
    expect(valorIa("R$ 1234.56")).toBe(1234.56);
    expect(valorIa("")).toBeNull();
    expect(valorIa(Number.NaN)).toBeNull();
    expect(valorIa(undefined)).toBeNull();
  });

  it("aceita só datas válidas", () => {
    expect(dataIa("2025-3-5")).toBe("2025-03-05");
    expect(dataIa("05.03.2025")).toBe("2025-03-05");
    expect(dataIa("2025-01-10T00:00:00Z")).toBe("2025-01-10");
    expect(dataIa("2025-02-30")).toBe("");
    expect(dataIa("março de 2025")).toBe("");
    expect(dataIa(20250310)).toBe("");
  });
});

describe("reestruturacaoJsonSchema", () => {
  type No = { type?: unknown; properties?: Record<string, No>; required?: string[]; additionalProperties?: boolean; items?: No };

  function objetos(no: No, caminho = "raiz"): Array<[string, No]> {
    const out: Array<[string, No]> = [];
    if (no.properties) out.push([caminho, no]);
    for (const [k, v] of Object.entries(no.properties ?? {})) out.push(...objetos(v, `${caminho}.${k}`));
    if (no.items) out.push(...objetos(no.items, `${caminho}[]`));
    return out;
  }

  it("segue o modo strict da OpenAI (tudo obrigatório, sem propriedades extras)", () => {
    for (const [caminho, no] of objetos(reestruturacaoJsonSchema as unknown as No)) {
      expect(no.additionalProperties, caminho).toBe(false);
      expect([...(no.required ?? [])].sort(), caminho).toEqual(Object.keys(no.properties!).sort());
    }
  });

  it("tem os mesmos campos do reestruturacaoSchema", () => {
    const exemplo = reestruturacaoSchema.parse({ classes: [{}], pagamento: [{}], opcoes: [{}], medidas: [{}] });
    const props = (reestruturacaoJsonSchema as unknown as No).properties!;
    expect(Object.keys(props).sort()).toEqual(Object.keys(exemplo).sort());
    for (const lista of ["classes", "pagamento", "opcoes", "medidas"] as const) {
      expect(Object.keys(props[lista]!.items!.properties!).sort(), lista).toEqual(Object.keys(exemplo[lista][0]!).sort());
    }
  });
});
