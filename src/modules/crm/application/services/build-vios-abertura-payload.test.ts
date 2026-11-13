import { describe, expect, it } from "vitest";

import {
  buildViosAberturaPedido,
  chaveAberturaVios,
  nomeNoVios,
  type ViosAberturaEntrada,
} from "./build-vios-abertura-payload";

const entrada = (extra: Partial<ViosAberturaEntrada> = {}): ViosAberturaEntrada => ({
  oportunidadeId: "11111111-2222-4333-8444-555555555555",
  crmUrl: "https://crm.exemplo.com.br/crm/leads/11111111-2222-4333-8444-555555555555",
  modo: "simular",
  hojeYmd: "2026-11-13",
  responsavelPasta: "Ligia Gilberti Lopes",
  intake: {
    empresas: [
      { tipo_documento: "CPF", razao_social: "Alessandro Di Salvo Neto", documento: "216.994.308-02" },
      { tipo_documento: "CPF", razao_social: "Bruno Di Salvo", documento: "216.993.268-27" },
      { tipo_documento: "CNPJ", razao_social: "ACME Ltda", documento: "11.222.333/0001-81" },
    ],
    areas_analise: ["Cível", "Trabalhista", "Tributário"],
    data_entrega_due: "2026-11-20",
    horario_entrega_due: "09:00",
    local_reuniao: "Online",
    data_reuniao: "2026-11-23",
    horario_reuniao: null,
    tipo_lead: "Indicacao",
    tipo_indicacao: "Contador",
    nome_indicacao: "Fulano",
  },
  responsaveis: [
    { area: "Cível", nomeVios: "Giancarlo Murta Zotini" },
    { area: "Trabalhista", nomeVios: "Daniel Pressatto Fernandes" },
    { area: "Tributário", nomeVios: "Francisco de Assis Barbosa Campos Zanin" },
  ],
  ...extra,
});

describe("buildViosAberturaPedido", () => {
  it("monta cliente, envolvidos, pasta e tarefas no modelo da central", () => {
    const r = buildViosAberturaPedido(entrada());
    if (!r.ok) throw new Error(r.motivo);
    const { pedido } = r;

    expect(pedido.chave_idempotencia).toBe("crm:abertura_due:11111111-2222-4333-8444-555555555555");
    expect(pedido.modo).toBe("simular");
    expect(pedido.cliente).toEqual({
      tipo_pessoa: "PF",
      cpf_cnpj: "21699430802",
      nome: "Alessandro Di Salvo Neto",
      categoria: "Prospecção",
      grupo: "Grupo prospect",
    });
    expect(pedido.envolvidos).toEqual([
      { nome: "Bruno Di Salvo", cpf_cnpj: "21699326827", tipo_parte: "Cliente" },
      { nome: "ACME Ltda", cpf_cnpj: "11222333000181", tipo_parte: "Cliente" },
    ]);
    expect(pedido.pasta).toMatchObject({
      escritorio: "BISMARCHI PIRES SOCIEDADE DE ADVOGADOS",
      departamento: "Comercial",
      area: "Comercial",
      agrupador: "Due Diligence Prospect",
      responsavel: "Ligia Gilberti Lopes",
      data_cadastro: "13/11/2026",
    });
    expect(pedido.pasta.descricao).toContain("DUE DILIGENCE - Alessandro Di Salvo Neto, Bruno Di Salvo, ACME Ltda");

    // Um ENVIAR por responsável (dia do cadastro) e um Protocolo com todos (entrega). A ciência da abertura o VIOS cria.
    expect(pedido.tarefas.map((t) => [t.tarefa, t.tarefa_id, t.etiqueta_id, t.data, t.responsavel])).toEqual([
      ["ENVIAR", "708", "1", "13/11/2026", ["Giancarlo Murta Zotini"]],
      ["ENVIAR", "708", "1", "13/11/2026", ["Daniel Pressatto Fernandes"]],
      ["ENVIAR", "708", "1", "13/11/2026", ["Francisco de Assis Barbosa Campos Zanin"]],
      [
        "Protocolo",
        "595",
        "3",
        "20/11/2026",
        ["Giancarlo Murta Zotini", "Daniel Pressatto Fernandes", "Francisco de Assis Barbosa Campos Zanin"],
      ],
    ]);
    expect(r.avisos).toEqual([]);
  });

  it("descreve as tarefas como a central (tipo de lead, prazo, reunião, empresas e link)", () => {
    const r = buildViosAberturaPedido(entrada());
    if (!r.ok) throw new Error(r.motivo);
    const enviar = r.pedido.tarefas[0]!.observacao;
    expect(enviar.startsWith("ENVIAR DUE DILLIGENCE PROSPECT\n\nTipo de Lead: Indicação\n")).toBe(true);
    expect(enviar).toContain("Indicação: Contador\nNome da Indicação: Fulano");
    expect(enviar).toContain("- Prazo de Entrega: 20/11/2026 às 09:00");
    expect(enviar).toContain("- Áreas de Análise: Cível, Trabalhista, Tributário");
    expect(enviar).toContain("- Local: Online\n- Data: 23/11/2026\n- Horário: A definir");
    expect(enviar).toContain("- ACME Ltda - 11.222.333/0001-81");
    expect(enviar).toContain("Lead no CRM: https://crm.exemplo.com.br/crm/leads/");
    expect(r.pedido.tarefas[3]!.observacao.startsWith("PROTOCOLO DUE DILLIGENCE PROSPECT\n\n")).toBe(true);
  });

  it("hora do banco (17:00:00) sai como 17:00", () => {
    const base = entrada();
    const r = buildViosAberturaPedido(
      entrada({ intake: { ...base.intake, horario_entrega_due: "17:00:00", horario_reuniao: "9:30:00" } }),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.pedido.tarefas[0]!.observacao).toContain("- Prazo de Entrega: 20/11/2026 às 17:00\n");
    expect(r.pedido.tarefas[0]!.observacao).toContain("- Horário: 09:30\n");
  });

  it("mesmo responsável em duas áreas recebe um ENVIAR só", () => {
    const r = buildViosAberturaPedido(
      entrada({
        responsaveis: [
          { area: "Cível", nomeVios: "Leonardo Marques Silva" },
          { area: "Trabalhista", nomeVios: "Leonardo Marques Silva" },
        ],
      }),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.pedido.tarefas.filter((t) => t.tarefa === "ENVIAR")).toHaveLength(1);
    expect(r.pedido.tarefas.find((t) => t.tarefa === "Protocolo")!.responsavel).toEqual(["Leonardo Marques Silva"]);
  });

  it("área sem responsável vira aviso; sem nenhum, só a pasta (sem tarefas)", () => {
    const umaSem = buildViosAberturaPedido(
      entrada({
        responsaveis: [
          { area: "Cível", nomeVios: "Giancarlo Murta Zotini" },
          { area: "Recuperação de Créditos", nomeVios: null },
        ],
      }),
    );
    if (!umaSem.ok) throw new Error(umaSem.motivo);
    expect(umaSem.avisos).toEqual(["Área sem responsável no CRM: Recuperação de Créditos."]);

    const nenhum = buildViosAberturaPedido(entrada({ responsaveis: [{ area: "Cível", nomeVios: null }] }));
    if (!nenhum.ok) throw new Error(nenhum.motivo);
    expect(nenhum.pedido.tarefas).toEqual([]);
    expect(nenhum.pedido.pasta.responsavel).toBe("Ligia Gilberti Lopes");
  });

  it("PJ pelo CNPJ; envolvido sem documento válido vai sem documento e repetido sai", () => {
    const base = entrada();
    const r = buildViosAberturaPedido(
      entrada({
        intake: {
          ...base.intake,
          empresas: [
            { razao_social: "ACME Ltda", documento: "11222333000181" },
            { razao_social: "ACME Filial", documento: "11.222.333/0001-81" },
            { razao_social: "Sem Documento SA", documento: "" },
            { razao_social: "Documento Errado", documento: "123" },
          ],
        },
      }),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.pedido.cliente.tipo_pessoa).toBe("PJ");
    expect(r.pedido.envolvidos).toEqual([
      { nome: "Sem Documento SA", tipo_parte: "Cliente" },
      { nome: "Documento Errado", tipo_parte: "Cliente" },
    ]);
    expect(r.avisos).toContain("Envolvido sem CPF/CNPJ válido: Sem Documento SA.");
  });

  it("não monta sem data de entrega ou com documento inválido no cliente", () => {
    const base = entrada();
    expect(buildViosAberturaPedido(entrada({ intake: { ...base.intake, data_entrega_due: null } }))).toEqual({
      ok: false,
      motivo: "Lead sem data de entrega da due.",
    });
    const r = buildViosAberturaPedido(
      entrada({ intake: { ...base.intake, empresas: [{ razao_social: "X", documento: "111.111.111-11" }] } }),
    );
    expect(r).toEqual({ ok: false, motivo: "CPF/CNPJ da 1ª empresa inválido (X)." });
  });

  it("chave aceita pelo SAMA (8 a 200 caracteres: letras, números, _ . : -)", () => {
    expect(chaveAberturaVios("11111111-2222-4333-8444-555555555555")).toMatch(/^[A-Za-z0-9_.:-]{8,200}$/);
  });
});

describe("nomeNoVios", () => {
  const rh = [
    { fullName: "Renato Rossetti Vallim de Castro", email: "renato@bismarchipires.com.br", isActive: true },
    { fullName: "Ligia Gilberti Lopes", email: "ligia@bismarchipires.com.br", isActive: true },
    { fullName: "Pessoa Antiga", email: "ana@bpplaw.com.br", isActive: false },
    { fullName: "Ana Nova", email: "ana@bismarchipires.com.br", isActive: true },
  ];

  it("usa o nome completo do RH pelo e-mail de login", () => {
    expect(nomeNoVios({ fullName: "Renato Vallim", email: "Renato@bismarchipires.com.br" }, rh)).toBe(
      "Renato Rossetti Vallim de Castro",
    );
  });

  it("casa pelo local-part quando o domínio muda", () => {
    expect(nomeNoVios({ fullName: "Ligia Lopes", email: "ligia@bpplaw.com.br" }, rh)).toBe("Ligia Gilberti Lopes");
  });

  it("e-mail exato vence; local-part ambíguo fica com o nome do CRM", () => {
    expect(nomeNoVios({ fullName: "Ana", email: "ana@bpplaw.com.br" }, rh)).toBe("Pessoa Antiga");
    expect(nomeNoVios({ fullName: "Ana CRM", email: "ana@outro.com.br" }, rh)).toBe("Ana CRM");
  });

  it("sem par no RH, fica o nome do CRM", () => {
    expect(nomeNoVios({ fullName: "Fulano de Tal", email: "fulano@bismarchipires.com.br" }, rh)).toBe("Fulano de Tal");
    expect(nomeNoVios({ fullName: "Sem Email", email: null }, rh)).toBe("Sem Email");
  });
});
