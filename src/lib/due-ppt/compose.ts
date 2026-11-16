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
  movidoPor,
  primeiraParte,
  tribunalDoNumero,
  valorEnvolvido,
  type AnaliseCivel,
  type AnaliseRecCred,
  type AnaliseTrabalhista,
  type AnaliseTributario,
} from "./analise";
import { DUE_AREAS, DUE_AREA_IDS, LIMITE_DETALHE, metodologiaEsferas, normalizarTexto, type DueAreaId } from "./areas";
import { areaDraft, type AreaDraft, type DueApresentacaoDraft, type PedidoFalencia, type ReestruturacaoForm } from "./draft";
import {
  acentuar,
  anosDecimal,
  brl,
  brlInteiro,
  brlVariacaoMi,
  dataBr,
  formatarDocumento,
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
  /** Nota de rodapé da conclusão para o passivo desta área (Reestruturação). */
  notaConclusao?: string;
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
  return n > 0 && n <= LIMITE_DETALHE ? def.variantePoucos : "painel";
}

/** Há dados da recuperação judicial (o slide da RJ só sai com eles). */
function temRecuperacaoJudicial(f: ReestruturacaoForm): boolean {
  return !!(f.autos || f.recuperandas || f.competencia || f.passivoTotal != null || f.classes.length);
}

function pedidosFalencia(f: ReestruturacaoForm) {
  return f.falencias.filter((p) => p.autos || p.requerente);
}

function resumoReestruturacao(form: ReestruturacaoForm): ResumoArea {
  const avisos: string[] = [];
  if (!temRecuperacaoJudicial(form) && !pedidosFalencia(form).length) {
    avisos.push("Preencha a recuperação judicial (autos e passivo total) ou ao menos um pedido de falência.");
  } else if (temRecuperacaoJudicial(form) && !form.autos && form.passivoTotal == null) {
    avisos.push("Preencha ao menos os autos e o passivo total da recuperação judicial.");
  }
  const fonte =
    form.endividamentoFonte === "inicial"
      ? "Passivo declarado na documentação inicial da recuperação judicial (art. 51 da LFRE)"
      : "Passivo total do edital do art. 52, §1º da LFRE";
  return {
    notaConclusao: `${fonte}; créditos concursais podem coincidir com processos das demais áreas.`,
    id: "reestruturacao",
    variante: "painel",
    considerados: 0,
    total: 0,
    // Sem passivo informado (ex.: só pedidos de falência), a área não entra na soma da conclusão.
    passivo: form.passivoTotal,
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
    if (a.zerados.length) {
      const lista = a.zerados
        .slice(0, 4)
        .map((p) => `${p.numero}${p.ultimoMovimento ? ` (${p.ultimoMovimento.replace(/\.$/, "")})` : ""}`)
        .join("; ");
      avisos.push(
        `${a.zerados.length} processo(s) não arquivado(s) com valor envolvido zero na planilha entram como zero no passivo: ${lista}${a.zerados.length > 4 ? "; …" : ""}.`,
      );
    }
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

/** Minúsculas, com os acentos que o DataLawyer às vezes perde ("EXECUCAO" → "execução"). */
function minusc(s: string): string {
  return s ? acentuar(s).toLowerCase() : "";
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
  const vara = p.vara ? tituloNome(acentuar(p.vara)) : "";
  const comarca = p.comarca ? tituloNome(acentuar(p.comarca)) : "";
  const uf = siglaUf(p.uf);
  // "1ª Vara Cível da Comarca de Sumaré" já diz a comarca: repetir quebrava em 3 linhas.
  if (vara && comarca && normalizarTexto(vara).includes(normalizarTexto(comarca))) return uf ? `${vara}/${uf}` : vara;
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
      `Reclamação trabalhista ajuizada por ${a} contra ${b}${p.dataDistribuicao ? ` em ${dataBr(p.dataDistribuicao)}` : ""}${p.vara ? `, na ${tituloNome(acentuar(p.vara))}` : ""}.`,
      p.fase ? `Processo em fase de ${minusc(p.fase)}, com valor envolvido de ${brl(valorEnvolvido(p))}.` : `Valor envolvido de ${brl(valorEnvolvido(p))}.`,
      p.valorAcordo > 0 ? `Há registro de acordo de ${brl(p.valorAcordo)}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const classe = p.classe ? tituloNome(acentuar(p.classe)) : "Processo";
  const semPartes = !primeiraParte(p.poloAtivo) && !primeiraParte(p.poloPassivo);
  const frases = [
    semPartes
      ? `${classe}${inst ? `, ${inst}` : ""}; a planilha não informa as partes.`
      : `${classe} ${p.classe ? movidoPor(p.classe) : "movido"} por ${a} contra ${b}${inst ? `, ${inst}` : ""}.`,
  ];
  if (p.poloCliente === "TERCEIRO") frases.push("O cliente figura como terceiro interessado, fora dos polos da ação.");
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
    DET_PARTE_A: primeiraParte(p.poloAtivo) ? partesResumidas(p.poloAtivo) : "—",
    DET_PARTE_B: primeiraParte(p.poloPassivo) ? partesResumidas(p.poloPassivo) : "—",
    DET_STATUS: statusProcesso(p),
    DET_VARA: varaComarca(p),
    DET_TRIBUNAL: tribunalInstancia(p),
    DET_AJUIZAMENTO: dataBr(p.dataDistribuicao) || (p.anoDistribuicao ? String(p.anoDistribuicao) : "—"),
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
        `**Data da distribuição:** ${dataBr(p.dataDistribuicao) || (p.anoDistribuicao ? String(p.anoDistribuicao) : "não informada na base")}`,
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
  // Trabalhista como a área monta: número, reclamante, reclamadas, origem do valor, valor envolvido
  // e últimos andamentos. As outras áreas não usam a coluna extra, que sai da tabela.
  const rot =
    area === "trabalhista"
      ? { a: "Reclamante", b: "Reclamadas", extra: "Origem do valor", valor: "Valor envolvido", info: "Últimos andamentos", lValor: "POTENCIAL PASSIVO" }
      : area === "rec_cred"
        ? { a: "Exequente", b: "Executado", extra: "", valor: "Valor em cobrança", info: "Último movimento", lValor: "VALOR EM COBRANÇA" }
        : { a: "Autor", b: "Réu", extra: "", valor: "Valor da causa", info: "Classe · fase", lValor: "POTENCIAL PASSIVO" };
  const out: SlideSpec[] = [];
  for (let pg = 0; pg < paginas; pg++) {
    const itens = lista.slice(pg * LINHAS_POR_LISTA, (pg + 1) * LINHAS_POR_LISTA);
    const ops: SlideOp[] = rot.extra ? [] : [{ kind: "dropColumns", table: "TBL_LISTA", header: "{{LISTA_L_EXTRA}}" }];
    // Poucas linhas ocupam o cartão (até ~4,6" abaixo do cabeçalho), com letra um pouco maior.
    ops.push({ kind: "rowHeight", table: "TBL_LISTA", hIn: Math.min(0.9, Math.max(0.44, 4.6 / Math.max(itens.length, 1))) });
    if (itens.length <= LIMITE_DETALHE) ops.push({ kind: "fontScale", names: ["TBL_LISTA"], scale: 1.15 });
    out.push({
      source: "SLIDE_LISTA",
      ops,
      tokens: {
        LISTA_AREA: DUE_AREAS[area].titulo,
        LISTA_TITULO: `PROCESSOS ATIVOS (${cons.length})${cortados > 0 ? ` — ${lista.length} de maior valor` : ""}${pg > 0 ? " — continuação" : ""}`,
        LISTA_L_VALOR: rot.lValor,
        LISTA_VALOR: brl(valorTotal),
        LISTA_L_PARTE_A: rot.a,
        LISTA_L_PARTE_B: rot.b,
        LISTA_L_EXTRA: rot.extra,
        LISTA_L_VALOR_COL: rot.valor,
        LISTA_L_INFO: rot.info,
      },
      tables: {
        TBL_LISTA: itens.map((p) => ({
          processo: p.numero,
          parteA: p.poloAtivo ? partesResumidas(p.poloAtivo) : "—",
          parteB: p.poloPassivo ? partesResumidas(p.poloPassivo) : "—",
          extra: rot.extra ? acentuar(p.origemValor) || "—" : "",
          valor: brl(area === "trabalhista" ? valorEnvolvido(p) : p.valorCausa),
          info:
            area === "trabalhista"
              ? p.ultimoMovimento || (p.fase ? `Fase de ${minusc(p.fase)}` : "—")
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
  // Sem a coluna de sócio, o quadro do sócio mostra o polo do cliente (passivo / ativo).
  const usaPolo = a.semSocio && a.polos.length > 0;
  const socio = faseSlots("CIVEL_SOCIO", usaPolo ? a.polos : a.socios, 2, "CIVEL_SOCIO_LINHA", 6.25);
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
      CIVEL_SOCIO_TITULO: usaPolo ? "POLO DO CLIENTE" : "SÓCIO NO POLO PASSIVO",
      CIVEL_TOP5_TITULO: "CASOS COM MAIOR VALOR",
      CIVEL_TOP5_L_PARTE: a.semPoloCliente ? "Autor" : "Credor",
      CIVEL_TOP5_N: String(a.top.length),
      CIVEL_TOP5_TOTAL: brl(a.top.reduce((s, t) => s + t.valor, 0)),
      CIVEL_LEITURA: textoFinal(ad, resumo, "leitura"),
      ...fase.tokens,
      ...socio.tokens,
    },
    tables: {
      // Só a primeira parte: a lista inteira (fundos, cessionários) estoura a tabela sobre o total.
      TBL_CIVEL_TOP5: a.top.map((t) => ({ parte: nomeNaTabela(primeiraParte(t.parte)) || "—", processo: t.processo, valor: brl(t.valor) })),
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
  // Planilha da PGFN só com o valor de cada devedor: a tabela mostra os devedores, não a natureza.
  const porDevedor = a.pgfnDevedores.length > 0;
  const linhasPgfn = porDevedor
    ? [...a.pgfnDevedores].sort((x, y) => y.valor - x.valor).map((d) => ({ rotulo: tituloNome(d.nome), valor: brl(d.valor) }))
    : [
        { rotulo: "Tributário", valor: brl(a.pgfn.tributario) },
        { rotulo: "Previdenciário", valor: brl(a.pgfn.previdenciario) },
        { rotulo: "Multa trabalhista", valor: brl(a.pgfn.multa) },
      ];
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
      TRIB_L_NATUREZA: porDevedor ? "Devedor" : "Natureza",
      TRIB_T_NATUREZA: porDevedor ? "DÉBITOS POR DEVEDOR" : "NATUREZA DAS COBRANÇAS",
      TRIB_ADM_PGFN: brl(pgfnTotal),
      TRIB_ADM_PGE: brl(a.pge),
      TRIB_ADM_TOTAL: brl(a.administrativo),
      TRIB_PONTOS: textoFinal(ad, resumo, "pontos"),
      TRIB_LEITURA: textoFinal(ad, resumo, "leitura"),
    },
    tables: {
      TBL_TRIB_ORIGEM: a.origens.map((o) => ({ origem: o.origem, valor: brl(o.valor) })),
      TBL_TRIB_NATUREZA: linhasPgfn,
    },
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

function reestruturacaoSlides(f: ReestruturacaoForm, razaoSocial: string): SlideSpec[] {
  const out: SlideSpec[] = [];
  const v = (n: number | null) => (n == null ? "—" : brl(n));
  // Campo opcional vazio sai do slide em vez de virar "—".
  const vazios: string[] = [];
  if (!f.juiz) vazios.push("Juiz Label", "Juiz Value");
  if (!f.relator) vazios.push("Relator Label", "Relator Value");
  if (!f.administrador) vazios.push("Admin Label", "Admin Value");
  if (!f.resumo) vazios.push("Summary Background", "Summary Text", "Total Accent");
  const opsRj: SlideOp[] = vazios.length ? [{ kind: "remove", names: vazios }] : [];
  // A faixa do resumo comporta 2 linhas a 14pt (~88 caracteres cada); texto maior sai menor.
  if (f.resumo && linhasDoTexto(f.resumo, 88) > 2) opsRj.push({ kind: "fontScale", names: ["Summary Text"], scale: 0.85 });
  if (temRecuperacaoJudicial(f)) out.push({
    source: "SLIDE_REEST_RJ",
    ops: opsRj,
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
    // Só a documentação inicial (processamento não deferido): uma coluna de valores, sem AJ nem variação.
    const inicial = f.endividamentoFonte === "inicial";
    const ops: SlideOp[] = [];
    if (inicial) {
      ops.push(
        { kind: "keepColumns", table: "TBL_RJ_CLASSES", keep: [0, 1] },
        { kind: "remove", names: ["RJ_VARIACAO_ROTULO", "RJ_VARIACAO_CHIP", "RJ_VARIACAO_TEXTO"] },
        { kind: "shift", names: ["RJ_EXTRA_ROTULO", "RJ_EXTRA_VALOR", "RJ_TOTAL_ROTULO", "RJ_TOTAL_VALOR"], dyIn: -1.06 },
      );
    }
    if (!f.endividamentoResumo) ops.push({ kind: "remove", names: ["Shape 114", "Shape 115", "Text 116"] });
    out.push({
      source: "SLIDE_REEST_ENDIVIDAMENTO",
      ops,
      tokens: {
        RJ_L_EDITAL: inicial ? "DOCUMENTAÇÃO INICIAL" : "EDITAL ART. 52, §1º",
        RJ_L_AJ: "RELATÓRIO AJ",
        RJ_L_VARIACAO: "VARIAÇÃO",
        RJ_L_CONCURSAL: inicial ? "PASSIVO CONCURSAL" : "PASSIVO CONCURSAL (AJ)",
        RJ_L_EXTRA: inicial ? "EXTRACONCURSAL" : "EXTRACONCURSAL (AJ)",
        RJ_L_TOTAL: inicial ? "ENDIVIDAMENTO TOTAL" : "ENDIVIDAMENTO TOTAL (AJ)",
        RJ_TOTAL_EDITAL: brl(totEdital),
        RJ_TOTAL_AJ: brl(totAj),
        RJ_TOTAL_VARIACAO: brlVariacaoMi(varTot),
        RJ_EXTRA_EDITAL: v(f.extraconcursalEdital),
        RJ_EXTRA_AJ: v(f.extraconcursalAj),
        RJ_EXTRA_VARIACAO: brlVariacaoMi(extraA - extraE),
        RJ_CONCURSAL_AJ: brl(inicial ? totEdital : totAj),
        RJ_VARIACAO_EDITAL: `${brlVariacaoMi(varTot)}${totEdital ? ` (${varTot > 0 ? "+" : varTot < 0 ? "−" : ""}${pct(Math.abs(varTot) / totEdital, 0)})` : ""}`,
        RJ_EXTRACONCURSAL_AJ: inicial ? v(f.extraconcursalEdital) : brl(extraA),
        RJ_ENDIVIDAMENTO_TOTAL: brl(inicial ? totEdital + extraE : totAj + extraA),
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
  for (const p of pedidosFalencia(f)) out.push(falenciaSlide(p, razaoSocial));
  return out;
}

/** Pedido de falência no slide de processo (rótulos próprios; campos vazios saem). */
function falenciaSlide(p: PedidoFalencia, razaoSocial: string): SlideSpec {
  const pedido = [
    p.fundamento ? `**Fundamento:** ${p.fundamento}` : "",
    p.credito != null ? `**Crédito indicado na inicial:** ${brl(p.credito)}${p.creditoObs ? `, ${p.creditoObs}` : ""}` : "",
  ].filter(Boolean);
  const tokens: Record<string, string> = {
    DET_AREA: "Pedido de Falência",
    DET_PROCESSO: p.autos || "—",
    DET_L_PARTE_A: "REQUERENTE",
    DET_PARTE_A: p.requerente || "—",
    DET_L_PARTE_B: "EMPRESA DEVEDORA",
    DET_PARTE_B: p.devedora || razaoSocial || "—",
    DET_L_BLOCO_1: pedido.length ? "PEDIDO" : "",
    DET_BLOCO_1: pedido.join("\n"),
    DET_L_BLOCO_2: "",
    DET_BLOCO_2: "",
    DET_L_VALOR: "VALOR DA CAUSA",
    DET_VALOR: p.valorCausa != null ? brl(p.valorCausa) : "—",
    DET_STATUS: p.situacao || "—",
    DET_VARA: p.competencia || "—",
    DET_TRIBUNAL: tribunalDoNumero(p.autos) ?? "—",
    DET_AJUIZAMENTO: dataBr(p.ajuizamento) || "—",
    DET_L_INFO_1: p.juiz ? "JUIZ(A)" : "",
    DET_INFO_1: p.juiz,
    DET_L_INFO_2: "",
    DET_INFO_2: "",
    DET_L_INFO_3: "",
    DET_INFO_3: "",
    DET_RESUMO: p.status,
  };
  return { source: "SLIDE_DETALHE", tokens, ops: opsDetalhe(tokens) };
}

/** Caracteres por linha das partes no slide de processo (14pt numa coluna de 4,2"). */
const CHARS_PARTE = 31;
const LINHA_PARTE_IN = 0.24;

/**
 * Nome curto para colunas estreitas: "COOPERATIVA DE CREDITO … LTDA - SICOOB DIVICRED" vira o nome
 * depois do último " - "; sem isso, corta em ~55 caracteres numa palavra inteira.
 */
function nomeNaTabela(nome: string): string {
  const n = nome.trim();
  if (n.length <= 55) return n;
  const fim = n.split(/\s+-\s+/).pop()!.trim();
  if (fim !== n && fim.length >= 6) return fim;
  const corte = n.slice(0, 55);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), 40)).trim()}…`;
}

/** "A, B, C, D" → "A, B e outros": mais que duas partes não cabem na coluna. */
function partesResumidas(partes: string): string {
  const lista = partes.split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean);
  return lista.length > 2 ? `${lista.slice(0, 2).join(", ")} e outros` : partes;
}

/**
 * Layout do slide de processo: partes com mais de uma linha empurram os blocos de baixo (com
 * mais de duas, a fonte diminui), e rótulos vazios saem com o valor.
 */
function opsDetalhe(t: Record<string, string>): SlideOp[] {
  const ops: SlideOp[] = [];
  const linhas = (escala: number) =>
    Math.max(linhasDoTexto(t.DET_PARTE_A ?? "", CHARS_PARTE / escala), linhasDoTexto(t.DET_PARTE_B ?? "", CHARS_PARTE / escala));
  const escala = linhas(1) > 2 ? 0.85 : 1;
  const n = Math.min(linhas(escala), 3);
  if (escala < 1) ops.push({ kind: "fontScale", names: ["Reclamante Value", "Reclamadas Value"], scale: escala });
  if (n > 1) {
    ops.push({
      kind: "shift",
      names: ["Pedidos Label", "Pedidos Value", "Alegacoes Label", "Alegacoes Value"],
      dyIn: Math.round((n - 1) * LINHA_PARTE_IN * escala * 100) / 100,
    });
  }
  const vazios: string[] = [];
  if (!t.DET_L_BLOCO_1 && !t.DET_BLOCO_1) vazios.push("Pedidos Label", "Pedidos Value");
  if (!t.DET_L_BLOCO_2 && !t.DET_BLOCO_2) vazios.push("Alegacoes Label", "Alegacoes Value");
  if (!t.DET_L_INFO_1 && !t.DET_INFO_1) vazios.push("Contrato Label", "Contrato Value");
  if (!t.DET_L_INFO_2 && !t.DET_INFO_2) vazios.push("Cargo Label", "Cargo Value");
  if (!t.DET_L_INFO_3 && !t.DET_INFO_3) vazios.push("Remun Label", "Remun Value");
  if (!t.DET_RESUMO) vazios.push("Resumo Label", "Resumo Value");
  if (vazios.length) ops.push({ kind: "remove", names: vazios });
  return ops;
}

// ─── conclusão ────────────────────────────────────────────────────────────────

const SUPERSCRIPT = ["¹", "²", "³", "⁴"];

/** "dívida ativa estadual (R$ …) e federal (R$ …)" ou com "nenhum débito na PGFN". */
function notaAdministrativo(a: AnaliseTributario): string {
  const pgfn = a.pgfn.tributario + a.pgfn.previdenciario + a.pgfn.multa;
  if (a.pge > 0 && pgfn > 0) return `dívida ativa estadual de ${brl(a.pge)} e federal de ${brl(pgfn)}`;
  if (pgfn > 0) return "dívida ativa federal; nenhum débito estadual informado";
  return "dívida ativa estadual; nenhum débito na PGFN";
}

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
    let marca = "";
    if (p.r.id === "tributario") {
      const a = p.r.analise as AnaliseTributario;
      if (a.administrativo > 0) {
        const s = SUPERSCRIPT[notas.length]!;
        marca = s;
        if (a.processos === 0) {
          extra = ` · dívida ativa${s}`;
          notas.push(`${s} Sem execuções fiscais: o valor tributário é a dívida ativa (${brl(a.administrativo)}, ${notaAdministrativo(a)}).`);
        } else {
          extra = ` · judicial + administrativo${s}`;
          notas.push(
            `${s} O valor tributário soma o passivo judicial (${brl(a.passivoJudicial)}, ${a.processos} execuções fiscais) e o administrativo (${brl(a.administrativo)}, ${notaAdministrativo(a)}).`,
          );
        }
      }
    }
    if (p.r.id === "reestruturacao") {
      const s = SUPERSCRIPT[notas.length]!;
      extra = ` · passivo da recuperação judicial${s}`;
      marca = s;
      notas.push(`${s} ${p.r.notaConclusao ?? "Passivo total do edital do art. 52, §1º da LFRE; créditos concursais podem coincidir com processos das demais áreas."}`);
    }
    const parte = pct(total > 0 ? p.valor / total : 0);
    // Compacto: a linha do percentual sai, então a marca da nota vai junto do valor.
    tokens[`CONC_${p.key}_VALOR`] = compacto ? `${brl(p.valor)} · ${parte}${marca}` : brl(p.valor);
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

/** Empresas ou pessoas além da principal na capa. */
const MAX_EMPRESAS_CAPA = 4;

/** CPF (11 dígitos), ou sem documento e sem cara de empresa no nome = pessoa física. */
export function ehPessoaFisica(nome: string, documento: string): boolean {
  const d = documento.replace(/\D/g, "");
  if (d.length === 11) return true;
  if (d.length === 14) return false;
  return !/\b(ltda|s\.?\s?a|s\/a|eireli|me|epp|cia|companhia|sociedade|associacao|cooperativa|fundo|banco|holding|participacoes|comercio|industria|servicos|grupo|laboratorios?)\b/.test(
    normalizarTexto(nome),
  );
}

/** Linhas que o texto ocupa quebrando por palavra, com `max` caracteres por linha. */
function linhasDoTexto(texto: string, max: number): number {
  let linhas = 1;
  let atual = 0;
  for (const palavra of texto.trim().split(/\s+/)) {
    const comPalavra = atual ? atual + 1 + palavra.length : palavra.length;
    if (comPalavra > max && atual) {
      linhas += 1;
      atual = palavra.length;
    } else {
      atual = comPalavra;
    }
  }
  return linhas;
}

/**
 * A razão social da capa (24pt, ~22 caracteres por linha) cabe em 2 linhas antes do traço
 * dourado; nome mais longo sai com fonte menor em vez de passar por cima do traço e do CNPJ.
 */
export function escalaRazaoSocial(razaoSocial: string): number {
  for (const escala of [1, 0.9, 0.8, 0.75, 0.7]) {
    if (linhasDoTexto(razaoSocial, 22 / escala) <= 2) return escala;
  }
  return 0.7;
}

/** Área que concluiu o levantamento marcando "Sem processos ativos" (`due_area_tasks.sem_processos_ativos`). */
export type AreaSemProcessos = {
  area: DueAreaId;
  /** Responsável da tarefa da área. */
  responsavel?: string | null;
  /** Dia (dd/mm/aaaa, Brasília) em que a área concluiu. */
  em?: string | null;
};

export type ComposeInput = {
  draft: DueApresentacaoDraft;
  areas: AreaDados[];
  logo?: ImageAsset | null;
  hoje: Date;
  semProcessos?: AreaSemProcessos[];
};

export type ComposeResult = {
  spec: DeckSpec;
  resumos: ResumoArea[];
  avisos: string[];
  /** Áreas que concluíram sem processos ativos (não são pendência; ficam fora da apresentação). */
  concluidasSemProcessos: string[];
};

/** "Trabalhista: levantamento concluído em 16/11/2026 (Daniel …), sem processos ativos — não entra na apresentação." */
export function textoSemProcessos(s: AreaSemProcessos): string {
  const quando = s.em ? ` em ${s.em}` : "";
  const quem = s.responsavel?.trim() ? ` (${s.responsavel.trim()})` : "";
  return `${DUE_AREAS[s.area].titulo}: levantamento concluído${quando}${quem}, sem processos ativos — não entra na apresentação.`;
}

export function composeDeck(input: ComposeInput): ComposeResult {
  const { draft, hoje } = input;
  const avisos: string[] = [];
  const concluidasSemProcessos: string[] = [];
  const semProcessos = new Map((input.semProcessos ?? []).map((s) => [s.area, s]));
  const dadosPorArea = new Map(input.areas.map((a) => [a.id, a]));
  const incluidas = DUE_AREA_IDS.filter((id) => {
    const ad = draft.areas[id];
    if (!ad?.incluir) return false;
    if (id === "reestruturacao") return true;
    if (!dadosPorArea.has(id)) {
      // Área que marcou "Sem processos ativos" concluiu o levantamento: não é "sem planilha" (16/11/2026).
      const sp = semProcessos.get(id);
      if (sp) concluidasSemProcessos.push(textoSemProcessos(sp));
      else avisos.push(`${DUE_AREAS[id].titulo}: sem planilha anexada — a área fica fora da apresentação.`);
      return false;
    }
    return true;
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
      const sp = semProcessos.get(r.id);
      if (sp) concluidasSemProcessos.push(textoSemProcessos(sp));
      else avisos.push(`${DUE_AREAS[r.id].titulo}: nenhum processo ativo — a área ficou fora da apresentação.`);
      return false;
    }
    return true;
  });
  const ids = ativas.map((r) => r.id);

  const capa = draft.capa;
  const empresas = capa.empresas.filter((e) => e.razaoSocial.trim());
  const pf = ehPessoaFisica(capa.razaoSocial, capa.cnpj);
  const globals: Record<string, string> = {
    RAZAO_SOCIAL: capa.razaoSocial,
    CNPJ: formatarDocumento(capa.cnpj),
    CAPA_L_NOME: pf ? "NOME" : "RAZÃO SOCIAL",
    CAPA_L_DOC: pf ? "CPF:" : "CNPJ:",
    METODOLOGIA_ESFERAS: metodologiaEsferas(ids),
  };
  for (let i = 1; i <= MAX_EMPRESAS_CAPA; i++) {
    const e = empresas[i - 1];
    globals[`EMPRESA_${i}_RAZAO_SOCIAL`] = e?.razaoSocial ?? "";
    // Modelo anterior a 11/2026 ("CNPJ: {{EMPRESA_n_CNPJ}}"); o atual usa a linha inteira.
    globals[`EMPRESA_${i}_CNPJ`] = e ? formatarDocumento(e.cnpj) || "—" : "";
    globals[`EMPRESA_${i}_DOC`] = e?.cnpj ? `${ehPessoaFisica(e.razaoSocial, e.cnpj) ? "CPF" : "CNPJ"}: ${formatarDocumento(e.cnpj)}` : "";
  }

  const capaOps: SlideOp[] = [];
  const semEmpresa: string[] = [];
  for (let i = empresas.length + 1; i <= MAX_EMPRESAS_CAPA; i++) semEmpresa.push(`TXT_EMPRESA_${i}`, `ICO_EMPRESA_${i}`);
  // Pessoa física: sem o ícone de empresa, com o nome alinhado à esquerda.
  empresas.forEach((e, i) => {
    if (!ehPessoaFisica(e.razaoSocial, e.cnpj)) return;
    semEmpresa.push(`ICO_EMPRESA_${i + 1}`);
    capaOps.push({ kind: "shift", names: [`TXT_EMPRESA_${i + 1}`], dxIn: -0.39 });
  });
  // Sem documento da empresa principal (ex.: pessoa física sem CPF informado), a linha sai.
  if (!capa.cnpj.trim()) semEmpresa.push("CAPA_DOC_FUNDO", "CAPA_ROTULO_DOC", "TXT_CNPJ");
  if (semEmpresa.length) capaOps.push({ kind: "remove", names: semEmpresa });
  const escala = escalaRazaoSocial(capa.razaoSocial);
  if (escala < 1) capaOps.push({ kind: "fontScale", names: ["TXT_RAZAO_SOCIAL"], scale: escala });
  if (input.logo) {
    capaOps.push({ kind: "image", name: "IMG_LOGO_CLIENTE", image: input.logo }, { kind: "remove", names: ["IMG_ICONE_PESSOA"] });
  } else if (pf) {
    // Pessoa física sem logo: o círculo do cliente fica, com a silhueta de pessoa.
    capaOps.push({ kind: "remove", names: ["IMG_LOGO_CLIENTE"] });
  } else {
    capaOps.push(
      { kind: "remove", names: ["IMG_LOGO_CLIENTE", "CIRCULO_CLIENTE", "IMG_ICONE_PESSOA"] },
      { kind: "shift", names: ["CIRCULO_ESCRITORIO", "IMG_LOGO_ESCRITORIO"], dxIn: 1.6 },
    );
  }

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
      slides.push(...reestruturacaoSlides(draft.reestruturacao, capa.razaoSocial));
      avisos.push(...r.avisos.map((m) => `${def.titulo}: ${m}`));
      continue;
    }
    const dados = dadosPorArea.get(r.id)!;
    const cons = considerados(dados.processos);
    if (r.variante === "detalhe") {
      for (const p of porValor(cons, r.id).slice(0, MAX_DETALHES)) {
        const tokens = detalheTokens(r.id, p, textoFinal(ad, r, `resumo:${p.numero}`));
        slides.push({ source: "SLIDE_DETALHE", tokens, ops: opsDetalhe(tokens) });
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

  return { spec: { globals, slides }, resumos: ativas, avisos, concluidasSemProcessos };
}

