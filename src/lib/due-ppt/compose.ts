/**
 * Regras da apresentação da DUE: quais slides entram, em que ordem, com quais
 * números e textos. Entrada = rascunho + processos normalizados de cada área.
 */
import {
  analisarCivel,
  analisarRecCred,
  analisarTrabalhista,
  analisarTributario,
  FAIXAS_TEMPO,
  FAIXAS_VALOR,
  isArquivado,
  limitarGrupos,
  primeiraParte,
  valorEnvolvido,
  type AnaliseCivel,
  type AnaliseRecCred,
  type AnaliseTrabalhista,
  type AnaliseTributario,
} from "./analise";
import { DUE_AREAS, DUE_AREA_IDS, LIMITE_DETALHE, metodologiaEsferas, normalizarTexto, type DueAreaId } from "./areas";
import { areaDraft, type AreaDraft, type DueApresentacaoDraft, type ReestruturacaoForm } from "./draft";
import {
  anosDecimal,
  brl,
  brlInteiro,
  brlVariacaoMi,
  dataBr,
  inteiro,
  listaPt,
  pct,
  qtd2,
  tituloNome,
} from "./format";
import type { ImageAsset } from "./pptx/image";
import type { DeckSpec, SlideOp, SlideSpec } from "./pptx/build";
import type { ExtrasTributario, Processo } from "./processos";

export type VarianteEfetiva = "painel" | "detalhe" | "lista";

export type AreaDados = {
  id: DueAreaId;
  processos: Processo[];
  extras: ExtrasTributario;
};

export type ResumoArea = {
  id: DueAreaId;
  variante: VarianteEfetiva;
  /** Processos considerados (sem arquivados). */
  considerados: number;
  total: number;
  /** Valor que entra na conclusão como passivo (null = área não é passivo). */
  passivo: number | null;
  /** Valor que entra como crédito (Recuperação de Crédito). */
  credito: number | null;
  /** Textos gerados que o usuário pode editar: chave → texto. */
  textos: Record<string, { rotulo: string; texto: string }>;
  analise: AnaliseCivel | AnaliseTrabalhista | AnaliseTributario | AnaliseRecCred | null;
  avisos: string[];
};

const LINHAS_POR_LISTA = 10;
const MAX_PAGINAS_LISTA = 4;
const MAX_DETALHES = 15;

// ─── análise por área ─────────────────────────────────────────────────────────

function considerados(ps: Processo[]): Processo[] {
  return ps.filter((p) => !isArquivado(p));
}

function porValor(ps: Processo[], area: DueAreaId): Processo[] {
  const v = (p: Processo) => (area === "trabalhista" ? valorEnvolvido(p) : p.valorCausa);
  return [...ps].sort((a, b) => v(b) - v(a));
}

function varianteEfetiva(area: DueAreaId, escolha: AreaDraft["variante"], n: number): VarianteEfetiva {
  const def = DUE_AREAS[area];
  if (escolha !== "auto" && def.variantes.includes(escolha)) return escolha;
  if (def.variantes.length === 1) return def.variantes[0]!;
  return n > 0 && n <= LIMITE_DETALHE ? "detalhe" : "painel";
}

function resumoReestruturacao(form: ReestruturacaoForm): ResumoArea {
  const avisos: string[] = [];
  if (!form.autos && form.passivoTotal == null) avisos.push("Preencha ao menos os autos e o passivo total da recuperação judicial.");
  return {
    id: "reestruturacao",
    variante: "painel",
    considerados: 0,
    total: 0,
    passivo: form.passivoTotal ?? 0,
    credito: null,
    textos: {},
    analise: null,
    avisos,
  };
}

export function analisarArea(dados: AreaDados, draft: DueApresentacaoDraft, hoje: Date): ResumoArea {
  const ad = areaDraft(draft, dados.id);
  if (dados.id === "reestruturacao") return resumoReestruturacao(draft.reestruturacao);
  const cons = considerados(dados.processos);
  const variante = varianteEfetiva(dados.id, ad.variante, cons.length);
  const avisos: string[] = [];
  const textos: ResumoArea["textos"] = {};
  let passivo: number | null = null;
  let credito: number | null = null;
  let analise: ResumoArea["analise"] = null;

  if (dados.id === "civel") {
    const a = analisarCivel(dados.processos);
    analise = a;
    passivo = a.passivo;
    if (variante === "painel") textos.leitura = { rotulo: "Leitura executiva", texto: a.leitura };
    if (a.semPoloCliente) avisos.push("A planilha não traz o polo do cliente: todos os processos foram somados como passivo.");
  } else if (dados.id === "trabalhista") {
    const a = analisarTrabalhista(dados.processos);
    analise = a;
    passivo = a.passivo;
    if (variante === "painel") {
      textos.obsAno = { rotulo: "Observação — processos por ano", texto: a.obsAno };
      textos.obsPedidos = { rotulo: "Observação — pedidos", texto: a.obsPedidos };
      textos.leitura = { rotulo: "Leitura executiva", texto: a.leitura };
    }
  } else if (dados.id === "tributario") {
    const a = analisarTributario(dados.processos, dados.extras);
    analise = a;
    passivo = a.passivoTotal;
    textos.pontos = { rotulo: "Principais pontos de atenção (um por linha)", texto: a.pontos };
    textos.leitura = { rotulo: "Leitura executiva", texto: a.leitura };
    if (dados.extras.pge == null && dados.extras.pgfn == null) {
      avisos.push("Sem aba de dívida ativa (PGE/PGFN): a esfera administrativa sai zerada.");
    }
  } else if (dados.id === "rec_cred") {
    const a = analisarRecCred(dados.processos, hoje);
    analise = a;
    credito = a.valorCausa;
  }

  if (variante === "lista" && cons.length > LINHAS_POR_LISTA * MAX_PAGINAS_LISTA) {
    avisos.push(`Lista com ${cons.length} processos: entram os ${LINHAS_POR_LISTA * MAX_PAGINAS_LISTA} de maior valor. Para a carteira toda, use o painel com gráficos.`);
  }
  if (variante === "detalhe") {
    const lista = porValor(cons, dados.id);
    if (lista.length > MAX_DETALHES) avisos.push(`Muitos processos para um slide cada (${lista.length}); entram os ${MAX_DETALHES} de maior valor.`);
    for (const p of lista.slice(0, MAX_DETALHES)) {
      textos[`resumo:${p.numero}`] = { rotulo: `Resumo — ${p.numero}`, texto: resumoProcesso(dados.id, p) };
    }
  }
  if (!cons.length && dados.id !== "tributario") avisos.push("Nenhum processo ativo na planilha.");

  return { id: dados.id, variante, considerados: cons.length, total: dados.processos.length, passivo, credito, textos, analise, avisos };
}

function textoFinal(ad: AreaDraft, resumo: ResumoArea, chave: string): string {
  const editado = ad.textos[chave];
  if (editado != null) return editado;
  return resumo.textos[chave]?.texto ?? "";
}

// ─── slides por processo ──────────────────────────────────────────────────────

function minusc(s: string): string {
  return s ? s.toLowerCase() : "";
}

/** "LESTER SEGURANCA PATRIMONIAL LTDA ME" → "Lester Seguranca" (tabela estreita do top 5). */
export function nomeCurto(partes: string): string {
  const nome = primeiraParte(partes)
    .replace(/\b(ltda|me|epp|eireli|s\.?\s?a\.?|s\/a|cia|comercio|industria)\b\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!nome) return "—";
  const palavras = nome.split(" ").filter((w) => !/^(de|da|do|das|dos|e)$/i.test(w));
  return tituloNome(palavras.slice(0, 2).join(" "));
}

function statusProcesso(p: Processo): string {
  const sit = p.situacao ? tituloNome(p.situacao) : "Ativo";
  return p.fase ? `${sit} · fase de ${minusc(p.fase)}` : sit;
}

function tribunalInstancia(p: Processo): string {
  const inst = p.instancia ? `${String(p.instancia).replace(/\D/g, "") || p.instancia}ª instância` : "";
  return [p.tribunal, inst].filter(Boolean).join(" · ") || "—";
}

const UF_POR_NOME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF",
  "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

function siglaUf(uf: string): string {
  if (/^[A-Za-z]{2}$/.test(uf.trim())) return uf.trim().toUpperCase();
  return UF_POR_NOME[normalizarTexto(uf)] ?? "";
}

function varaComarca(p: Processo): string {
  const vara = p.vara ? tituloNome(p.vara) : "";
  const comarca = p.comarca ? tituloNome(p.comarca) : "";
  const uf = siglaUf(p.uf);
  const local = [comarca, uf].filter(Boolean).join("/");
  return [vara, local].filter(Boolean).join(" – ") || "—";
}

function ehExecucao(p: Processo): boolean {
  return /execu|cumprimento|monitori/.test(normalizarTexto(`${p.classe} ${p.fase}`));
}

export function resumoProcesso(area: DueAreaId, p: Processo): string {
  const a = tituloNome(primeiraParte(p.poloAtivo) || "parte não informada");
  const b = tituloNome(primeiraParte(p.poloPassivo) || "parte não informada");
  const inst = p.instancia ? `em ${String(p.instancia).replace(/\D/g, "") || p.instancia}ª instância${p.tribunal ? ` no ${p.tribunal}` : ""}` : p.tribunal ? `no ${p.tribunal}` : "";
  if (area === "trabalhista") {
    return [
      `Reclamação trabalhista ajuizada por ${a} contra ${b}${p.dataDistribuicao ? ` em ${dataBr(p.dataDistribuicao)}` : ""}${p.vara ? `, na ${tituloNome(p.vara)}` : ""}.`,
      p.fase ? `Processo em fase de ${minusc(p.fase)}, com valor envolvido de ${brl(valorEnvolvido(p))}.` : `Valor envolvido de ${brl(valorEnvolvido(p))}.`,
      p.valorAcordo > 0 ? `Há registro de acordo de ${brl(p.valorAcordo)}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const classe = p.classe ? tituloNome(p.classe) : "Processo";
  const frases = [`${classe} movido por ${a} contra ${b}${inst ? `, ${inst}` : ""}.`];
  if (p.fase) frases.push(`Processo em fase de ${minusc(p.fase)}${p.ultimoMovimento ? `; o último ato registrado é ${minusc(p.ultimoMovimento)}` : ""}.`);
  else if (p.ultimoMovimento) frases.push(`O último ato registrado é ${minusc(p.ultimoMovimento)}.`);
  if (area === "rec_cred") {
    const acordo = p.valorAcordo > 0 || !!p.dataAcordo;
    if (acordo) frases.push("Há registro de acordo.");
    else if (p.indicativoRevelia) frases.push("Não há registro de acordo; há indicativo de revelia.");
    else frases.push("Não há registro de acordo nem de revelia.");
  }
  return frases.join(" ");
}

function detalheTokens(area: DueAreaId, p: Processo, resumo: string): Record<string, string> {
  const base = {
    DET_AREA: DUE_AREAS[area].titulo,
    DET_PROCESSO: p.numero,
    DET_PARTE_A: primeiraParte(p.poloAtivo) ? p.poloAtivo : "—",
    DET_PARTE_B: primeiraParte(p.poloPassivo) ? p.poloPassivo : "—",
    DET_STATUS: statusProcesso(p),
    DET_VARA: varaComarca(p),
    DET_TRIBUNAL: tribunalInstancia(p),
    DET_AJUIZAMENTO: dataBr(p.dataDistribuicao) || "—",
    DET_RESUMO: resumo,
  };
  if (area === "trabalhista") {
    const pedidos = (p.pedidos || p.assuntos)
      .split(/\s*,\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    return {
      ...base,
      DET_L_PARTE_A: "RECLAMANTE",
      DET_L_PARTE_B: "RECLAMADA(S)",
      DET_L_BLOCO_1: "PEDIDOS",
      DET_BLOCO_1: pedidos.length ? `${pedidos.slice(0, 12).join(", ")}${pedidos.length > 12 ? "…" : ""}` : "Não informados na base.",
      DET_L_BLOCO_2: "INFORMAÇÕES",
      DET_BLOCO_2: [
        p.cargos ? `**Cargo:** ${p.cargos}` : "",
        p.classe ? `**Rito:** ${p.classe}` : "",
        p.origemValor ? `**Origem do valor:** ${minusc(p.origemValor)}` : "",
      ]
        .filter(Boolean)
        .join("\n") || "**Cargo:** não informado",
      DET_L_VALOR: "VALOR ENVOLVIDO",
      DET_VALOR: brl(valorEnvolvido(p)),
      DET_L_INFO_1: "VALOR DA CAUSA",
      DET_INFO_1: brl(p.valorCausa),
      DET_L_INFO_2: "ACORDO",
      DET_INFO_2: p.valorAcordo > 0 ? brl(p.valorAcordo) : "Não",
      DET_L_INFO_3: "LIQUIDAÇÃO",
      DET_INFO_3: p.valorLiquidacao > 0 ? brl(p.valorLiquidacao) : "—",
    };
  }
  if (area === "rec_cred") {
    const exec = ehExecucao(p);
    const citacao = /cita/.test(normalizarTexto(`${p.ultimoMovimento} ${p.assuntos}`));
    const constricao = p.indicativoBloqueio
      ? "sim, há indicativo de bloqueio."
      : /bloqueio|penhora|sisbajud|bacenjud|renajud|infojud|arresto/.test(normalizarTexto(p.ultimoMovimento))
        ? `sim, em andamento: último movimento é ${minusc(p.ultimoMovimento)}.`
        : "não há registro na base.";
    const idpj = /desconsidera/.test(normalizarTexto(`${p.classe} ${p.assuntos}`));
    return {
      ...base,
      DET_L_PARTE_A: exec ? "EXEQUENTE" : "AUTOR",
      DET_L_PARTE_B: exec ? "EXECUTADA" : "RÉU",
      DET_L_BLOCO_1: "INFORMAÇÕES DA DÍVIDA",
      DET_BLOCO_1: [
        `**Tipo da dívida:** ${p.classe ? minusc(p.classe) : "não informado"}`,
        `**Assuntos:** ${p.assuntos ? minusc(p.assuntos) : "não informados"}`,
        `**Data da distribuição:** ${dataBr(p.dataDistribuicao) || "não informada na base"}`,
      ].join("\n"),
      DET_L_BLOCO_2: "PEDIDOS",
      DET_BLOCO_2: [
        `**Citação realizada?** ${citacao ? "há registro de citação." : "não há registro na base."}`,
        `**Dívida paga?** ${p.valorAcordo > 0 || p.dataAcordo ? `há registro de acordo${p.valorAcordo > 0 ? ` (${brl(p.valorAcordo)})` : ""}.` : "não há registro de pagamento ou acordo."}`,
        `**Atos constritivos realizados?** ${constricao}`,
        `**IDPJ instaurado?** ${idpj ? "sim." : "não há registro na base."}`,
      ].join("\n"),
      DET_L_VALOR: "VALOR EM COBRANÇA",
      DET_VALOR: brl(p.valorCausa),
      DET_L_INFO_1: "ÚLTIMO MOVIMENTO",
      DET_INFO_1: p.ultimoMovimento || "—",
      DET_L_INFO_2: "CITAÇÃO",
      DET_INFO_2: citacao ? "Registrada" : "Sem registro",
      DET_L_INFO_3: "REVELIA",
      DET_INFO_3: p.indicativoRevelia ? "Sim" : "Não",
    };
  }
  // Cível (e qualquer outra área com planilha de processos)
  return {
    ...base,
    DET_L_PARTE_A: "AUTOR",
    DET_L_PARTE_B: "RÉU",
    DET_L_BLOCO_1: "INFORMAÇÕES DO PROCESSO",
    DET_BLOCO_1: [
      `**Classe:** ${p.classe ? minusc(p.classe) : "não informada"}`,
      p.poloCliente ? `**Polo do cliente:** ${minusc(p.poloCliente)}` : "",
      p.socioPoloPassivo ? `**Sócio no polo passivo:** ${p.socioPoloPassivo === "SIM" ? "sim" : "não"}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    DET_L_BLOCO_2: p.assuntos ? "ASSUNTOS" : "",
    DET_BLOCO_2: p.assuntos ? minusc(p.assuntos) : "",
    DET_L_VALOR: "VALOR DA CAUSA",
    DET_VALOR: brl(p.valorCausa),
    DET_L_INFO_1: "ÚLTIMO MOVIMENTO",
    DET_INFO_1: p.ultimoMovimento || "—",
    DET_L_INFO_2: "COMARCA",
    DET_INFO_2: p.comarca ? tituloNome(p.comarca) : "—",
    DET_L_INFO_3: "FASE",
    DET_INFO_3: p.fase ? tituloNome(p.fase) : "—",
  };
}

function listaSlides(area: DueAreaId, cons: Processo[], valorTotal: number): SlideSpec[] {
  const lista = porValor(cons, area).slice(0, LINHAS_POR_LISTA * MAX_PAGINAS_LISTA);
  const cortados = cons.length - lista.length;
  const paginas = Math.max(1, Math.ceil(lista.length / LINHAS_POR_LISTA));
  const rot =
    area === "trabalhista"
      ? { a: "Reclamante", b: "Reclamada(s)", valor: "Valor envolvido", info: "Fase", lValor: "POTENCIAL PASSIVO" }
      : area === "rec_cred"
        ? { a: "Exequente", b: "Executado", valor: "Valor em cobrança", info: "Último movimento", lValor: "VALOR EM COBRANÇA" }
        : { a: "Autor", b: "Réu", valor: "Valor da causa", info: "Classe · fase", lValor: "POTENCIAL PASSIVO" };
  const out: SlideSpec[] = [];
  for (let pg = 0; pg < paginas; pg++) {
    const itens = lista.slice(pg * LINHAS_POR_LISTA, (pg + 1) * LINHAS_POR_LISTA);
    out.push({
      source: "SLIDE_LISTA",
      tokens: {
        LISTA_AREA: DUE_AREAS[area].titulo,
        LISTA_TITULO: `PROCESSOS ATIVOS (${cons.length})${cortados > 0 ? ` — ${lista.length} de maior valor` : ""}${pg > 0 ? " — continuação" : ""}`,
        LISTA_L_VALOR: rot.lValor,
        LISTA_VALOR: brl(valorTotal),
        LISTA_L_PARTE_A: rot.a,
        LISTA_L_PARTE_B: rot.b,
        LISTA_L_VALOR_COL: rot.valor,
        LISTA_L_INFO: rot.info,
      },
      tables: {
        TBL_LISTA: itens.map((p) => ({
          processo: p.numero,
          parteA: p.poloAtivo || "—",
          parteB: p.poloPassivo || "—",
          valor: brl(area === "trabalhista" ? valorEnvolvido(p) : p.valorCausa),
          info:
            area === "trabalhista"
              ? tituloNome(p.fase || "—")
              : area === "rec_cred"
                ? p.ultimoMovimento || "—"
                : [p.classe ? tituloNome(p.classe) : "", p.fase ? minusc(p.fase) : ""].filter(Boolean).join(" · ") || "—",
        })),
      },
    });
  }
  return out;
}

// ─── painéis ──────────────────────────────────────────────────────────────────

function faseSlots(prefix: string, fases: Array<{ nome: string; qtd: number; valor: number }>, max: number, line: string, maxBottomIn: number) {
  const gs = limitarGrupos(fases, max);
  const tokens: Record<string, string> = {};
  gs.forEach((g, i) => {
    tokens[`${prefix}_${i + 1}`] = g.nome;
    tokens[`${prefix}_${i + 1}_QTD`] = qtd2(g.qtd);
    tokens[`${prefix}_${i + 1}_VALOR`] = brl(g.valor);
  });
  const op: SlideOp = { kind: "slots", prefix, count: gs.length, line, maxBottomIn };
  return { tokens, op };
}

function painelCivel(a: AnaliseCivel, ad: AreaDraft, resumo: ResumoArea): SlideSpec {
  const fase = faseSlots("CIVEL_FASE", a.fases, 3, "CIVEL_FASE_LINHA", 6.25);
  const socio = faseSlots("CIVEL_SOCIO", a.socios, 2, "CIVEL_SOCIO_LINHA", 6.25);
  const regiao: Record<string, string> = {};
  a.regioes.forEach((r, i) => {
    regiao[`CIVEL_TRIBUNAL_${i + 1}`] = r.nome;
    regiao[`CIVEL_TRIBUNAL_${i + 1}_QTD`] = qtd2(r.qtd);
  });
  // Modelos anteriores a out/2026 só têm CIVEL_REGIAO_1/2: o maior tribunal + "Outros".
  const [trib1, ...outrosTrib] = a.tribunais;
  return {
    source: "SLIDE_CIVEL_PAINEL",
    tokens: {
      CIVEL_PASSIVO: brl(a.passivo),
      CIVEL_ATIVOS: qtd2(a.ativos),
      CIVEL_SUSPENSOS: qtd2(a.suspensos),
      CIVEL_MEDIA: brl(a.media),
      CIVEL_MAIOR: brl(a.maior),
      ...regiao,
      CIVEL_REGIAO_1: trib1?.sigla ?? "—",
      CIVEL_REGIAO_1_QTD: qtd2(trib1?.qtd ?? 0),
      CIVEL_REGIAO_2: outrosTrib.length === 1 ? outrosTrib[0]!.sigla : "Outros",
      CIVEL_REGIAO_2_QTD: qtd2(outrosTrib.reduce((s, t) => s + t.qtd, 0)),
      CIVEL_TOP5_TITULO: "CASOS COM MAIOR VALOR",
      CIVEL_TOP5_L_PARTE: a.semPoloCliente ? "Autor" : "Credor",
      CIVEL_TOP5_N: String(a.top.length),
      CIVEL_TOP5_TOTAL: brl(a.top.reduce((s, t) => s + t.valor, 0)),
      CIVEL_LEITURA: textoFinal(ad, resumo, "leitura"),
      ...fase.tokens,
      ...socio.tokens,
    },
    tables: {
      TBL_CIVEL_TOP5: a.top.map((t) => ({ parte: t.parte || "—", processo: t.processo, valor: brl(t.valor) })),
    },
    ops: [
      fase.op,
      socio.op,
      { kind: "columns", prefix: "CIVEL_TRIBUNAL", count: a.regioes.length },
      // Com 4 colunas, "DF · TJDFT" não cabe na coluna com a fonte do modelo.
      ...(a.regioes.length >= 4
        ? [{ kind: "fontScale" as const, names: a.regioes.map((_, i) => `CIVEL_TRIBUNAL_${i + 1}_NOME`), scale: 0.9 }]
        : []),
    ],
  };
}

function painelTrabalhista(a: AnaliseTrabalhista, ad: AreaDraft, resumo: ResumoArea): SlideSpec {
  const fase = faseSlots("TRAB_FASE", a.fases, 3, "TRAB_FASE_LINHA", 6.3);
  const pedidos = [...a.pedidos].reverse();
  return {
    source: "SLIDE_TRAB_PAINEL",
    tokens: {
      TRAB_PASSIVO: brl(a.passivo),
      TRAB_ATIVOS: qtd2(a.ativos),
      TRAB_ARQUIVADOS: qtd2(a.arquivados),
      TRAB_MEDIA: brl(a.media),
      TRAB_MAIOR: brl(a.maior),
      TRAB_OBS_ANO: textoFinal(ad, resumo, "obsAno"),
      TRAB_OBS_PEDIDOS: textoFinal(ad, resumo, "obsPedidos"),
      TRAB_LEITURA: textoFinal(ad, resumo, "leitura"),
      ...fase.tokens,
    },
    charts: {
      CHART_TRAB_ANO: { categories: a.porAno.map((x) => x.ano), series: [{ values: a.porAno.map((x) => x.qtd) }] },
      CHART_TRAB_PEDIDOS: { categories: pedidos.map((p) => p.rotulo), series: [{ values: pedidos.map((p) => p.qtd) }] },
    },
    ops: [fase.op],
  };
}

function painelTributario(a: AnaliseTributario, ad: AreaDraft, resumo: ResumoArea): SlideSpec {
  const pgfnTotal = a.pgfn.tributario + a.pgfn.previdenciario + a.pgfn.multa;
  return {
    source: "SLIDE_TRIB_PAINEL",
    tokens: {
      TRIB_PROCESSOS: qtd2(a.processos),
      TRIB_PASSIVO_JUDICIAL: brl(a.passivoJudicial),
      TRIB_TRAMITACAO: qtd2(a.tramitacao),
      TRIB_SUSPENSOS: qtd2(a.suspensos),
      TRIB_ADMINISTRATIVO: brl(a.administrativo),
      TRIB_ORIGEM_TOTAL: brl(a.passivoJudicial),
      TRIB_PGFN_TRIBUTARIO: brl(a.pgfn.tributario),
      TRIB_PGFN_PREVIDENCIARIO: brl(a.pgfn.previdenciario),
      TRIB_PGFN_MULTA: brl(a.pgfn.multa),
      TRIB_PGFN_TOTAL: brl(pgfnTotal),
      TRIB_ADM_PGFN: brl(pgfnTotal),
      TRIB_ADM_PGE: brl(a.pge),
      TRIB_ADM_TOTAL: brl(a.administrativo),
      TRIB_PONTOS: textoFinal(ad, resumo, "pontos"),
      TRIB_LEITURA: textoFinal(ad, resumo, "leitura"),
    },
    tables: { TBL_TRIB_ORIGEM: a.origens.map((o) => ({ origem: o.origem, valor: brl(o.valor) })) },
  };
}

function painelRecCred(a: AnaliseRecCred): SlideSpec {
  const tipos = a.porTipo.slice(0, 5);
  const asc = [...tipos].reverse();
  const tokens: Record<string, string> = {
    RC_TOTAL: qtd2(a.total),
    RC_ATIVOS: qtd2(a.ativos),
    RC_ARQUIVADOS: qtd2(a.arquivados),
    RC_VALOR_CAUSA: brl(a.valorCausa),
    RC_MEDIA: brl(a.media),
    RC_FAIXA_TOTAL: inteiro(a.ativos),
    RC_TEMPO_MEDIO: anosDecimal(a.tempoMedioAnos),
    RC_TOP5_TITULO: `TOP ${a.top.length} MAIORES CRÉDITOS (VALOR DA CAUSA)`,
    RC_TOP5_N: String(a.top.length),
    RC_TOP5_TOTAL: brlInteiro(a.topTotal),
    RC_TOP5_PCT: pct(a.topPct, 0),
  };
  tipos.forEach((t, i) => (tokens[`RC_TIPO_QTD_${i + 1}`] = qtd2(t.qtd)));
  a.faixas.forEach((n, i) => (tokens[`RC_FAIXA_QTD_${i + 1}`] = inteiro(n)));
  a.tempo.forEach((n, i) => (tokens[`RC_TEMPO_QTD_${i + 1}`] = inteiro(n)));
  return {
    source: "SLIDE_RC_PAINEL",
    tokens,
    charts: {
      CHART_RC_TIPO: {
        categories: asc.map((t) => t.classe),
        series: [{ values: asc.map((t) => t.valor) }, { values: asc.map((t) => t.qtd) }],
      },
      CHART_RC_FAIXA: { categories: FAIXAS_VALOR.map((f) => f.rotulo), series: [{ values: a.faixas }] },
      CHART_RC_ANO: { categories: a.porAno.map((x) => x.ano), series: [{ values: a.porAno.map((x) => x.valor) }] },
      CHART_RC_TEMPO: { categories: FAIXAS_TEMPO.map((f) => f.rotulo), series: [{ values: a.tempo }] },
    },
    tables: {
      TBL_RC_TOP5: a.top.map((t, i) => ({
        pos: String(i + 1),
        devedor: nomeCurto(t.devedor),
        processo: t.processo,
        valor: brlInteiro(t.valor),
      })),
    },
    ops: [{ kind: "pills", prefix: "RC_TIPO_QTD", count: tipos.length }],
  };
}

// ─── reestruturação ──────────────────────────────────────────────────────────

function reestruturacaoSlides(f: ReestruturacaoForm): SlideSpec[] {
  const out: SlideSpec[] = [];
  const v = (n: number | null) => (n == null ? "—" : brl(n));
  out.push({
    source: "SLIDE_REEST_RJ",
    tokens: {
      RJ_AUTOS: f.autos || "—",
      RJ_RECUPERANDAS: f.recuperandas || "—",
      RJ_COMPETENCIA: f.competencia || "—",
      RJ_JUIZ: f.juiz || "—",
      RJ_RELATOR: f.relator || "—",
      RJ_ADMINISTRADOR: f.administrador || "—",
      RJ_RESUMO: f.resumo,
      RJ_PASSIVO_TOTAL: v(f.passivoTotal),
      RJ_DEFERIMENTO: dataBr(f.deferimento) || "—",
      RJ_AJUIZAMENTO: dataBr(f.ajuizamento) || "—",
      RJ_FORO: f.foro || "—",
    },
  });
  if (f.classes.length) {
    const totEdital = f.classes.reduce((s, c) => s + (c.edital ?? 0), 0);
    const totAj = f.classes.reduce((s, c) => s + (c.aj ?? 0), 0);
    const varTot = totAj - totEdital;
    const extraE = f.extraconcursalEdital ?? 0;
    const extraA = f.extraconcursalAj ?? 0;
    out.push({
      source: "SLIDE_REEST_ENDIVIDAMENTO",
      tokens: {
        RJ_TOTAL_EDITAL: brl(totEdital),
        RJ_TOTAL_AJ: brl(totAj),
        RJ_TOTAL_VARIACAO: brlVariacaoMi(varTot),
        RJ_EXTRA_EDITAL: v(f.extraconcursalEdital),
        RJ_EXTRA_AJ: v(f.extraconcursalAj),
        RJ_EXTRA_VARIACAO: brlVariacaoMi(extraA - extraE),
        RJ_CONCURSAL_AJ: brl(totAj),
        RJ_VARIACAO_EDITAL: `${brlVariacaoMi(varTot)}${totEdital ? ` (${varTot > 0 ? "+" : varTot < 0 ? "−" : ""}${pct(Math.abs(varTot) / totEdital, 0)})` : ""}`,
        RJ_EXTRACONCURSAL_AJ: brl(extraA),
        RJ_ENDIVIDAMENTO_TOTAL: brl(totAj + extraA),
        RJ_ENDIVIDAMENTO_RESUMO: f.endividamentoResumo,
      },
      tables: {
        TBL_RJ_CLASSES: f.classes.map((c) => ({
          classe: c.classe,
          edital: v(c.edital),
          aj: v(c.aj),
          variacao: brlVariacaoMi((c.aj ?? 0) - (c.edital ?? 0)),
        })),
      },
    });
  }
  if (f.pagamento.length) {
    out.push({ source: "SLIDE_REEST_PAGAMENTO", tables: { TBL_RJ_PAGAMENTO: f.pagamento.map((p) => ({ ...p })) } });
  }
  if (f.opcoes.length) {
    const tokens: Record<string, string> = {};
    (["A", "B"] as const).forEach((l, i) => {
      const o = f.opcoes[i];
      tokens[`RJ_OPCAO_${l}_ROTULO`] = o ? o.rotulo || `OPÇÃO ${l}` : "";
      tokens[`RJ_OPCAO_${l}_TITULO`] = o?.titulo ?? "";
      tokens[`RJ_OPCAO_${l}_CONTRAPARTIDA`] = o?.contrapartida ?? "";
      tokens[`RJ_OPCAO_${l}_CONDICOES`] = o?.condicoes ?? "";
      tokens[`RJ_OPCAO_${l}_OBS`] = o?.obs ?? "";
    });
    out.push({ source: "SLIDE_REEST_FORMAS", tokens });
  }
  if (f.medidas.length) {
    const tokens: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      const m = f.medidas[i];
      tokens[`RJ_MEDIDA_${i + 1}_CATEGORIA`] = m?.categoria ?? "";
      tokens[`RJ_MEDIDA_${i + 1}_TITULO`] = m?.titulo ?? "";
      tokens[`RJ_MEDIDA_${i + 1}_DESTAQUE`] = m?.destaque ?? "";
      tokens[`RJ_MEDIDA_${i + 1}_PREVE`] = m?.preve ?? "";
      tokens[`RJ_MEDIDA_${i + 1}_OBJETIVO`] = m?.objetivo ?? "";
    }
    out.push({ source: "SLIDE_REEST_MEDIDAS", tokens });
  }
  return out;
}

// ─── conclusão ────────────────────────────────────────────────────────────────

const SUPERSCRIPT = ["¹", "²", "³", "⁴"];

function conclusao(resumos: ResumoArea[]): SlideSpec {
  const passivos = resumos
    .filter((r) => DUE_AREAS[r.id].conclusaoKey && r.passivo != null)
    .map((r) => ({ r, key: DUE_AREAS[r.id].conclusaoKey!, valor: r.passivo ?? 0 }))
    .sort((a, b) => b.valor - a.valor);
  const total = passivos.reduce((s, p) => s + p.valor, 0);
  const credito = resumos.find((r) => r.id === "rec_cred");
  // Com o quadro de crédito, a coluna de passivos só comporta 2 linhas completas.
  const compacto = !!credito && passivos.length > 2;
  const tokens: Record<string, string> = {};
  const ops: SlideOp[] = [];
  const notas: string[] = [];

  for (const p of passivos) {
    let extra = "";
    if (p.r.id === "tributario") {
      const a = p.r.analise as AnaliseTributario;
      if (a.administrativo > 0) {
        const s = SUPERSCRIPT[notas.length]!;
        extra = ` · judicial + administrativo${s}`;
        notas.push(
          `${s} O valor tributário soma o passivo judicial (${brl(a.passivoJudicial)}, ${a.processos} execuções fiscais) e o administrativo (${brl(a.administrativo)}, dívida ativa${a.pge > 0 ? " estadual" : ""}${a.pgfn.tributario + a.pgfn.previdenciario + a.pgfn.multa === 0 ? "; nenhum débito na PGFN" : ""}).`,
        );
      }
    }
    if (p.r.id === "reestruturacao") {
      const s = SUPERSCRIPT[notas.length]!;
      extra = ` · passivo da recuperação judicial${s}`;
      notas.push(`${s} Passivo total do edital do art. 52, §1º da LFRE; créditos concursais podem coincidir com processos das demais áreas.`);
    }
    const parte = pct(total > 0 ? p.valor / total : 0);
    tokens[`CONC_${p.key}_VALOR`] = compacto ? `${brl(p.valor)} · ${parte}` : brl(p.valor);
    tokens[`CONC_${p.key}_PCT`] = `${parte} do passivo total${extra}`;
    ops.push({ kind: "bar", track: `CONC_${p.key}_TRILHO`, bar: `CONC_${p.key}_BARRA`, ratio: total > 0 ? p.valor / total : 0 });
  }
  const nomes = passivos.map((p) => DUE_AREAS[p.r.id].rotulo.toLowerCase());
  tokens.CONC_TOTAL = brl(total);
  if (!nomes.length) tokens.CONC_DESCRICAO = "Nenhum passivo identificado nas áreas diligenciadas.";
  else if (nomes.length === 1) tokens.CONC_DESCRICAO = `Potencial passivo da área ${nomes[0]}.`;
  else tokens.CONC_DESCRICAO = `Soma do potencial passivo ${nomes.includes("reestruturação") ? "de " : ""}${listaPt(nomes)}.`;
  tokens.CONC_NOTAS = notas.join(" ");

  const all = ["CONC_REEST", "CONC_TRIB", "CONC_TRAB", "CONC_CIVEL"];
  const order = passivos.map((p) => `CONC_${p.key}`);
  ops.unshift({
    kind: "stack",
    order,
    all,
    bottomLimitShape: "CONC_SEPARADOR",
    compact: compacto ? { remove: ["PCT"], pull: ["TRILHO", "BARRA"], pullOffsetIn: 0.36 } : undefined,
  });
  if (!notas.length) ops.push({ kind: "remove", names: ["CONC_NOTAS"] });

  if (credito) {
    const a = credito.analise as AnaliseRecCred | null;
    tokens.CRED_TOTAL = brl(credito.credito ?? 0);
    tokens.CRED_DESCRICAO = a ? `Potencial crédito localizado em ${a.ativos} processo${a.ativos === 1 ? "" : "s"} ativo${a.ativos === 1 ? "" : "s"}` : "Potencial crédito localizado";
    return { source: "SLIDE_CONCLUSAO_CREDITO", tokens, ops };
  }
  return { source: "SLIDE_CONCLUSAO", tokens, ops };
}

// ─── deck ─────────────────────────────────────────────────────────────────────

export type ComposeInput = {
  draft: DueApresentacaoDraft;
  areas: AreaDados[];
  logo?: ImageAsset | null;
  hoje: Date;
};

export type ComposeResult = { spec: DeckSpec; resumos: ResumoArea[]; avisos: string[] };

export function composeDeck(input: ComposeInput): ComposeResult {
  const { draft, hoje } = input;
  const avisos: string[] = [];
  const dadosPorArea = new Map(input.areas.map((a) => [a.id, a]));
  const incluidas = DUE_AREA_IDS.filter((id) => {
    const ad = draft.areas[id];
    if (!ad?.incluir) return false;
    if (id === "reestruturacao") return true;
    return dadosPorArea.has(id);
  });
  const resumos = incluidas.map((id) =>
    analisarArea(dadosPorArea.get(id) ?? { id, processos: [], extras: { pge: null, pgfn: null } }, draft, hoje),
  );
  // Área sem processo nenhum (e sem dívida ativa) não entra na apresentação.
  const ativas = resumos.filter((r) => {
    if (r.id === "reestruturacao") return true;
    if (r.id === "tributario") {
      const a = r.analise as AnaliseTributario;
      return a.processos > 0 || a.administrativo > 0;
    }
    if (r.considerados === 0) {
      avisos.push(`${DUE_AREAS[r.id].titulo}: nenhum processo ativo — a área ficou fora da apresentação.`);
      return false;
    }
    return true;
  });
  const ids = ativas.map((r) => r.id);

  const capa = draft.capa;
  const empresas = capa.empresas.filter((e) => e.razaoSocial.trim());
  const globals: Record<string, string> = {
    RAZAO_SOCIAL: capa.razaoSocial,
    CNPJ: capa.cnpj,
    METODOLOGIA_ESFERAS: metodologiaEsferas(ids),
  };
  for (let i = 1; i <= 3; i++) {
    globals[`EMPRESA_${i}_RAZAO_SOCIAL`] = empresas[i - 1]?.razaoSocial ?? "";
    globals[`EMPRESA_${i}_CNPJ`] = empresas[i - 1]?.cnpj ?? "";
  }

  const capaOps: SlideOp[] = [];
  const semEmpresa: string[] = [];
  for (let i = empresas.length + 1; i <= 3; i++) semEmpresa.push(`TXT_EMPRESA_${i}`, `ICO_EMPRESA_${i}`);
  if (semEmpresa.length) capaOps.push({ kind: "remove", names: semEmpresa });
  if (input.logo) capaOps.push({ kind: "image", name: "IMG_LOGO_CLIENTE", image: input.logo });
  else capaOps.push({ kind: "remove", names: ["IMG_LOGO_CLIENTE", "CIRCULO_CLIENTE"] }, { kind: "shift", names: ["CIRCULO_ESCRITORIO", "IMG_LOGO_ESCRITORIO"], dxIn: 1.6 });

  const slides: SlideSpec[] = [
    { source: "SLIDE_CAPA" },
    { source: "SLIDE_SOBRE" },
    { source: "SLIDE_RECONHECIMENTOS" },
    { source: "SLIDE_METODOLOGIA" },
    { source: "SLIDE_DUE_CAPA", ops: capaOps },
    {
      source: "SLIDE_AREAS",
      ops: [
        {
          kind: "cardRow",
          order: ids.map((id) => DUE_AREAS[id].cardGroup),
          all: DUE_AREA_IDS.map((id) => DUE_AREAS[id].cardGroup),
          keepTemplateLayoutWhen: DUE_AREA_IDS.length,
        },
      ],
    },
  ];

  for (const r of ativas) {
    const def = DUE_AREAS[r.id];
    const ad = areaDraft(draft, r.id);
    slides.push({ source: `SLIDE_${def.slideKey}_DIVISOR` });
    if (r.id === "reestruturacao") {
      slides.push(...reestruturacaoSlides(draft.reestruturacao));
      avisos.push(...r.avisos.map((m) => `${def.titulo}: ${m}`));
      continue;
    }
    const dados = dadosPorArea.get(r.id)!;
    const cons = considerados(dados.processos);
    if (r.variante === "detalhe") {
      for (const p of porValor(cons, r.id).slice(0, MAX_DETALHES)) {
        slides.push({ source: "SLIDE_DETALHE", tokens: detalheTokens(r.id, p, textoFinal(ad, r, `resumo:${p.numero}`)) });
      }
    } else if (r.variante === "lista") {
      slides.push(...listaSlides(r.id, cons, r.passivo ?? r.credito ?? 0));
    } else if (r.id === "civel") slides.push(painelCivel(r.analise as AnaliseCivel, ad, r));
    else if (r.id === "trabalhista") slides.push(painelTrabalhista(r.analise as AnaliseTrabalhista, ad, r));
    else if (r.id === "tributario") slides.push(painelTributario(r.analise as AnaliseTributario, ad, r));
    else if (r.id === "rec_cred") slides.push(painelRecCred(r.analise as AnaliseRecCred));
    avisos.push(...r.avisos.map((m) => `${def.titulo}: ${m}`));
  }

  if (ativas.length) slides.push(conclusao(ativas));
  slides.push({ source: "SLIDE_SOCIOS" });
  if (!ativas.length) avisos.push("Nenhuma área com dados: a apresentação sai só com as páginas institucionais.");
  if (!capa.razaoSocial.trim()) avisos.push("Capa sem razão social.");

  return { spec: { globals, slides }, resumos: ativas, avisos };
}

