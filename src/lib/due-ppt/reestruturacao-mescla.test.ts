import { describe, expect, it } from "vitest";
import { reestruturacaoSchema, type ReestruturacaoForm } from "./draft";
import { aceitasPadrao, aplicarSugestoes, chaveClasse, destacado, sugestoesIa } from "./reestruturacao-mescla";

const form = (p: Partial<ReestruturacaoForm> = {}): ReestruturacaoForm => reestruturacaoSchema.parse(p);

const CLASSES_BOTAO = [
  { classe: "Classe I – Trabalhista", edital: null, aj: null },
  { classe: "Classe II – Garantia real", edital: null, aj: null },
  { classe: "Classe III – Quirografário", edital: null, aj: null },
  { classe: "Classe IV – ME/EPP", edital: null, aj: null },
];

describe("sugestoesIa / aplicarSugestoes", () => {
  it("preenche o vazio e só sugere substituir o que já está preenchido", () => {
    const atual = form({ juiz: "Dra. Fulana", foro: "Campinas – SP" });
    const ia = form({ autos: "1234567-89.2025.8.26.0114", juiz: "Dr. Beltrano", foro: "campinas –  sp", deferimento: "2025-01-20", passivoTotal: 1234.5 });

    const sugestoes = sugestoesIa(atual, ia);
    expect(sugestoes.map((s) => [s.chave, s.tipo])).toEqual([
      ["autos", "preencher"],
      ["juiz", "substituir"],
      ["deferimento", "preencher"],
      ["passivoTotal", "preencher"],
    ]);
    expect(sugestoes.find((s) => s.chave === "juiz")?.atual).toBe("Dra. Fulana");
    expect(sugestoes.find((s) => s.chave === "deferimento")?.valor).toBe("20/01/2025");
    expect(sugestoes.find((s) => s.chave === "passivoTotal")?.valor).toContain("1.234,50");

    const aceitas = aceitasPadrao(sugestoes);
    expect(aceitas.has("juiz")).toBe(false);
    const { form: novo, destacados } = aplicarSugestoes(atual, ia, aceitas);
    expect(novo).toMatchObject({ autos: "1234567-89.2025.8.26.0114", juiz: "Dra. Fulana", deferimento: "2025-01-20", passivoTotal: 1234.5 });
    expect([...destacados].sort()).toEqual(["autos", "deferimento", "passivoTotal"]);
    // O formulário de origem não muda.
    expect(atual.autos).toBe("");
  });

  it("substitui quando o usuário marca", () => {
    const atual = form({ juiz: "Dra. Fulana" });
    const ia = form({ juiz: "Dr. Beltrano" });
    const { form: novo } = aplicarSugestoes(atual, ia, new Set(["juiz"]));
    expect(novo.juiz).toBe("Dr. Beltrano");
  });

  it("casa as classes I a IV do botão pela numeração e acrescenta as que faltam", () => {
    const atual = form({ classes: CLASSES_BOTAO });
    const ia = form({
      classes: [
        { classe: "Classe I - Trabalhistas", edital: 100, aj: 110 },
        { classe: "Quirografários", edital: 300, aj: null },
        { classe: "Credores subordinados", edital: 50, aj: 50 },
      ],
    });
    const sugestoes = sugestoesIa(atual, ia);
    expect(sugestoes.map((s) => s.chave)).toEqual(["classes.0.edital", "classes.0.aj", "classes.2.edital", "classes+2"]);
    expect(sugestoes[0]!.rotulo).toBe("Classe I – Trabalhista — edital");

    const { form: novo, destacados } = aplicarSugestoes(atual, ia, aceitasPadrao(sugestoes));
    expect(novo.classes.map((c) => [c.classe, c.edital, c.aj])).toEqual([
      ["Classe I – Trabalhista", 100, 110],
      ["Classe II – Garantia real", null, null],
      ["Classe III – Quirografário", 300, null],
      ["Classe IV – ME/EPP", null, null],
      ["Credores subordinados", 50, 50],
    ]);
    expect(destacado(destacados, "classes.0.edital")).toBe(true);
    expect(destacado(destacados, "classes.1.edital")).toBe(false);
    expect(destacado(destacados, "classes.4.aj")).toBe(true);
  });

  it("não sugere o que já está igual (acento, caixa, espaços, centavos)", () => {
    const atual = form({ administrador: "AJ Consultoria Ltda.", passivoTotal: 1000, classes: [{ classe: "Classe I", edital: 10, aj: null }] });
    const ia = form({ administrador: "aj  consultoria ltda.", passivoTotal: 1000.001, classes: [{ classe: "classe 1", edital: 10, aj: null }] });
    expect(sugestoesIa(atual, ia)).toEqual([]);
  });

  it("aproveita linha em branco e respeita o máximo de cada lista", () => {
    const atual = form({
      opcoes: [
        { rotulo: "OPÇÃO A", titulo: "Parceiros", contrapartida: "", condicoes: "", obs: "" },
        { rotulo: "OPÇÃO B", titulo: "Financiadores", contrapartida: "", condicoes: "", obs: "" },
      ],
      medidas: [{ categoria: "", titulo: "", destaque: "", preve: "", objetivo: "" }],
    });
    const ia = form({
      opcoes: [
        { rotulo: "OPÇÃO A", titulo: "Fornecedores", contrapartida: "", condicoes: "Deságio 10%", obs: "" },
        { rotulo: "OPÇÃO B", titulo: "parceiros", contrapartida: "Manter fornecimento", condicoes: "", obs: "" },
      ],
      medidas: [{ categoria: "CAPTAÇÃO", titulo: "DIP", destaque: "", preve: "", objetivo: "" }],
    });
    const sugestoes = sugestoesIa(atual, ia);
    // "Fornecedores" não cabe (já há 2 formas especiais); "parceiros" casa com a linha 0.
    expect(sugestoes.map((s) => s.chave)).toEqual(["opcoes.0.contrapartida", "medidas.0.categoria", "medidas.0.titulo"]);
    expect(sugestoes[1]!.rotulo).toBe("Medida · DIP — categoria");
  });

  it("nunca troca o nome da classe nem o título de uma linha que já casou", () => {
    const atual = form({ pagamento: [{ classe: "Classe III", desagio: "", carencia: "", forma: "", atualizacao: "" }] });
    const ia = form({ pagamento: [{ classe: "Classe III – Quirografários", desagio: "60%", carencia: "", forma: "", atualizacao: "" }] });
    expect(sugestoesIa(atual, ia).map((s) => s.chave)).toEqual(["pagamento.0.desagio"]);
  });
});

describe("chaveClasse", () => {
  it("normaliza a classe pela numeração ou pelo nome", () => {
    expect(chaveClasse("Classe IV – ME/EPP")).toBe("4");
    expect(chaveClasse("classe iii")).toBe("3");
    expect(chaveClasse("Credores com garantia real")).toBe("2");
    expect(chaveClasse("Microempresas e EPP")).toBe("4");
    expect(chaveClasse("Classe 1")).toBe("1");
    expect(chaveClasse("  Subordinados ")).toBe("subordinados");
  });
});
