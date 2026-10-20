import { describe, expect, it } from "vitest";
import { analisarCivel, analisarRecCred, analisarTrabalhista, analisarTributario, ufDoProcesso } from "./analise";
import { metodologiaEsferas } from "./areas";
import { brl, brlCompacto, formatarDocumento, pct, qtd2 } from "./format";
import type { Processo } from "./processos";

function proc(p: Partial<Processo>): Processo {
  return {
    numero: "0000001-00.2025.8.26.0001",
    situacao: "Ativo",
    fase: "Conhecimento",
    classe: "",
    poloAtivo: "",
    poloPassivo: "",
    poloCliente: null,
    socioPoloPassivo: null,
    dataDistribuicao: null,
    comarca: "",
    vara: "",
    tribunal: "TJSP",
    instancia: "1",
    uf: "",
    valorCausa: 0,
    valorEnvolvido: null,
    valorAcordo: 0,
    valorLiquidacao: 0,
    origemValor: "",
    pedidos: "",
    assuntos: "",
    cargos: "",
    ultimoMovimento: "",
    indicativoBloqueio: null,
    indicativoRevelia: null,
    dataAcordo: null,
    dataArquivamento: null,
    documento: "",
    nome: "",
    ...p,
  };
}

describe("formatação", () => {
  it("formata moeda, compacto, percentual e contagem como nos PPTs", () => {
    expect(brl(2342866.93)).toBe("R$ 2.342.866,93");
    expect(brlCompacto(698686.56)).toBe("R$ 698,7 mil");
    expect(brlCompacto(143510749.5)).toBe("R$ 143,51 milhões");
    expect(pct(0.869)).toBe("86,9%");
    expect(qtd2(5)).toBe("05");
    expect(formatarDocumento("11701126000533")).toBe("11.701.126/0005-33");
  });

  it("monta o trecho da metodologia só com as áreas da due", () => {
    expect(metodologiaEsferas(["trabalhista"])).toBe("a esfera trabalhista");
    expect(metodologiaEsferas(["trabalhista", "civel"])).toBe("as esferas cível e trabalhista");
    expect(metodologiaEsferas(["reestruturacao", "civel", "trabalhista", "tributario"])).toBe(
      "as esferas de insolvência, cível, trabalhista e tributária",
    );
  });
});

describe("Cível", () => {
  const ps = [
    proc({ numero: "1", poloCliente: "PASSIVO", valorCausa: 1000, poloAtivo: "BANCO X S.A", classe: "BUSCA E APREENSÃO" }),
    proc({ numero: "2", poloCliente: "PASSIVO", valorCausa: 500, fase: "Execução", tribunal: "TJRJ" }),
    proc({ numero: "3", poloCliente: "ATIVO", valorCausa: 300 }),
    proc({ numero: "4", poloCliente: "PASSIVO", valorCausa: 999, situacao: "Arquivado" }),
    proc({ numero: "5", poloCliente: "PASSIVO", valorCausa: 200, situacao: "Suspenso", socioPoloPassivo: "SIM" }),
  ];
  const a = analisarCivel(ps);

  it("potencial passivo soma só o polo passivo, sem arquivados", () => {
    expect(a.passivo).toBe(1700);
    expect(a.ativos).toBe(3);
    expect(a.suspensos).toBe(1);
    expect(a.arquivados).toBe(1);
  });

  it("média e maior valor consideram todos os não arquivados", () => {
    expect(a.media).toBe(500);
    expect(a.maior).toBe(1000);
  });

  it("casos de maior valor vêm do polo passivo e a leitura cita o maior", () => {
    expect(a.top.map((t) => t.processo)).toEqual(["1", "2", "5"]);
    expect(a.leitura).toContain("Maior exposição: busca e apreensão movido por Banco X S.A");
    expect(a.socios.map((s) => s.nome)).toEqual(["Sim", "Não informado"]);
  });
});

describe("Trabalhista", () => {
  const ps = [
    proc({ numero: "1", valorEnvolvido: 100, valorCausa: 150, assuntos: "Horas Extras, Indenização por Dano Moral", dataDistribuicao: "2025-01-10" }),
    proc({ numero: "2", valorEnvolvido: 300, valorCausa: 300, assuntos: "Verbas Rescisórias, Horas Extras", fase: "Liquidação", dataDistribuicao: "2025-03-01", poloAtivo: "FULANO DE TAL" }),
    proc({ numero: "3", situacao: "Suspenso", valorEnvolvido: 50, valorCausa: 50, assuntos: "Multa do Artigo 477 da CLT", dataDistribuicao: "2023-05-05" }),
    proc({ numero: "4", situacao: "Arquivado", valorEnvolvido: 0, valorCausa: 400, assuntos: "Horas Extras", dataDistribuicao: "2022-01-01" }),
  ];
  const a = analisarTrabalhista(ps);

  it("ativos incluem suspensos; passivo é o valor envolvido", () => {
    expect(a.ativos).toBe(3);
    expect(a.arquivados).toBe(1);
    expect(a.passivo).toBe(450);
    expect(a.maior).toBe(300);
  });

  it("média do valor da causa é de toda a planilha (como nos PPTs entregues)", () => {
    expect(a.media).toBe(225);
  });

  it("conta pedidos pelos assuntos e preenche os anos sem processo", () => {
    expect(a.pedidos[0]).toMatchObject({ rotulo: "Horas extras", qtd: 3 });
    expect(a.porAno.map((x) => x.ano)).toEqual(["2022", "2023", "2024", "2025"]);
    expect(a.porAno.find((x) => x.ano === "2024")?.qtd).toBe(0);
    expect(a.obsAno).toBe("Observa-se que houve um pico no ajuizamento de reclamações trabalhistas no ano de **2025 (2)**");
    expect(a.obsPedidos).not.toContain("477");
  });
});

describe("Tributário", () => {
  it("separa origem por ente e soma judicial + administrativo na conclusão", () => {
    const ps = [
      proc({ numero: "3000018-93.2025.8.19.0064", poloAtivo: "ESTADO DO RIO DE JANEIRO", valorCausa: 1000 }),
      proc({ numero: "1503710-11.2024.8.26.0584", poloAtivo: "PREFEITURA MUNICIPAL DE SAO PEDRO", valorCausa: 10 }),
      proc({ numero: "1503711-11.2024.8.26.0584", poloAtivo: "PREFEITURA MUNICIPAL DE SAO PAULO", valorCausa: 5 }),
    ];
    const a = analisarTributario(ps, { pge: 2000, pgfn: null });
    expect(a.origens.map((o) => o.origem)).toEqual(["Estado do Rio de Janeiro", "Municípios (SP)"]);
    expect(a.origens[1]!.valor).toBe(15);
    expect(a.passivoJudicial).toBe(1015);
    expect(a.passivoTotal).toBe(3015);
    expect(a.pontos).toContain("Nenhum débito inscrito em dívida ativa federal (PGFN).");
    expect(ufDoProcesso("3000018-93.2025.8.19.0064")).toBe("RJ");
  });
});

describe("Recuperação de crédito", () => {
  it("considera só ativos e distribui por faixa e tempo de tramitação", () => {
    const hoje = new Date("2026-10-20T12:00:00Z");
    const ps = [
      proc({ numero: "1", valorCausa: 30_000, classe: "MONITÓRIA", dataDistribuicao: "2026-03-01", poloPassivo: "DEVEDOR A" }),
      proc({ numero: "2", valorCausa: 80_000, classe: "MONITÓRIA", dataDistribuicao: "2024-01-01" }),
      proc({ numero: "3", valorCausa: 2_000_000, classe: "EXECUÇÃO", dataDistribuicao: "2019-01-01" }),
      proc({ numero: "4", valorCausa: 999, situacao: "Arquivado" }),
    ];
    const a = analisarRecCred(ps, hoje);
    expect(a.ativos).toBe(3);
    expect(a.valorCausa).toBe(2_110_000);
    expect(a.faixas).toEqual([1, 1, 0, 0, 1]);
    expect(a.tempo).toEqual([1, 1, 0, 1]);
    expect(a.porTipo.map((t) => t.classe)).toEqual(["EXECUÇÃO", "MONITÓRIA"]);
    expect(a.porAno.map((x) => x.ano)).toEqual(["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
    expect(a.top[0]!.processo).toBe("3");
  });
});
