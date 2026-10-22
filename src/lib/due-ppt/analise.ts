/**
 * Números de cada área a partir dos processos normalizados. As regras seguem
 * os PPTs já entregues (ex.: Cível Sul Fluminense, Trabalhista ALEA S.A.).
 */
import { normalizarTexto } from "./areas";
import { brl, brlCompacto, listaPt, pct, tituloNome } from "./format";
import type { ExtrasTributario, Processo } from "./processos";

export type Agrupado = { nome: string; qtd: number; valor: number };

// Ordem do andamento do processo.
const ORDEM_FASES = ["conhecimento", "recursal", "liquidacao", "execucao", "cumprimento de sentenca"];

export function isArquivado(p: Processo): boolean {
  const s = normalizarTexto(p.situacao);
  return s.startsWith("arquiv") || s.startsWith("baixad") || s.startsWith("extint") || s.startsWith("encerr");
}

export function isSuspenso(p: Processo): boolean {
  return normalizarTexto(p.situacao).startsWith("suspen");
}

function soma(ps: Processo[], f: (p: Processo) => number): number {
  return ps.reduce((s, p) => s + (f(p) || 0), 0);
}

function nomeFase(raw: string): string {
  const n = normalizarTexto(raw);
  if (!n) return "Não informada";
  if (n.startsWith("conhec")) return "Conhecimento";
  if (n.startsWith("liquid")) return "Liquidação";
  if (n.startsWith("execu")) return "Execução";
  if (n.startsWith("recurs")) return "Recursal";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function agruparFases(ps: Processo[], valor: (p: Processo) => number): Agrupado[] {
  const map = new Map<string, Agrupado>();
  for (const p of ps) {
    const nome = nomeFase(p.fase);
    const g = map.get(nome) ?? { nome, qtd: 0, valor: 0 };
    g.qtd += 1;
    g.valor += valor(p) || 0;
    map.set(nome, g);
  }
  const ordem = (n: string) => {
    const i = ORDEM_FASES.indexOf(normalizarTexto(n));
    return i < 0 ? 99 : i;
  };
  return [...map.values()].sort((a, b) => ordem(a.nome) - ordem(b.nome) || b.qtd - a.qtd);
}

/** Junta grupos além de `max` em "Outras". */
export function limitarGrupos(gs: Agrupado[], max: number, rotuloOutros = "Outras fases"): Agrupado[] {
  if (gs.length <= max) return gs;
  const head = gs.slice(0, max - 1);
  const rest = gs.slice(max - 1);
  return [
    ...head,
    { nome: rotuloOutros, qtd: rest.reduce((s, g) => s + g.qtd, 0), valor: rest.reduce((s, g) => s + g.valor, 0) },
  ];
}

function ano(p: Processo): number | null {
  return p.dataDistribuicao ? Number(p.dataDistribuicao.slice(0, 4)) : (p.anoDistribuicao ?? null);
}

/** Data usada no tempo de tramitação; planilha só com o ano conta do meio daquele ano. */
function inicioTramitacao(p: Processo): string | null {
  if (p.dataDistribuicao) return p.dataDistribuicao;
  return p.anoDistribuicao ? `${p.anoDistribuicao}-07-01` : null;
}

/** "BUSCA E APREENSÃO EM ALIENAÇÃO FIDUCIÁRIA" → "busca e apreensão em alienação fiduciária". */
function classeMinuscula(classe: string): string {
  return classe.toLowerCase();
}

/** Primeiro nome da lista de partes ("A, B, C" → "A"). */
export function primeiraParte(partes: string): string {
  return partes.split(/\s*[,;|]\s*/)[0]?.trim() ?? partes;
}

// ─── Cível ────────────────────────────────────────────────────────────────────

export type AnaliseCivel = {
  total: number;
  ativos: number;
  suspensos: number;
  arquivados: number;
  passivo: number;
  media: number;
  maior: number;
  /** Tribunais dos não arquivados, do que tem mais processos para o que tem menos. */
  tribunais: TribunalCivel[];
  /** Quadro "Processos por região": até 4 tribunais ("SP · TJSP"); com mais, os 3 maiores + "Outros". */
  regioes: Agrupado[];
  fases: Agrupado[];
  socios: Agrupado[];
  top: Array<{ parte: string; processo: string; valor: number; classe: string }>;
  /** A planilha não diz o polo do cliente: todo processo conta como passivo. */
  semPoloCliente: boolean;
  leitura: string;
};

export type TribunalCivel = { sigla: string; uf: string | null; qtd: number };

const SEM_TRIBUNAL = "Não informado";

/** Sigla pelo número CNJ: justiça estadual (J=8) → TJ + UF; federal (J=4) → TRF + região. */
function tribunalDoNumero(numero: string): string | null {
  const m = /\d{7}-?\d{2}\.?\d{4}\.?(\d)\.?(\d{2})\.?\d{4}/.exec(numero);
  if (!m) return null;
  if (m[1] === "4") return `TRF${Number(m[2])}`;
  const uf = ufDoProcesso(numero);
  return uf ? (uf === "DF" ? "TJDFT" : `TJ${uf}`) : null;
}

/** "TJ-SP" → "TJSP"; coluna vazia → sigla pelo número CNJ. */
function siglaTribunal(p: Processo): string {
  const t = p.tribunal.trim().toUpperCase();
  if (!t) return tribunalDoNumero(p.numero) ?? SEM_TRIBUNAL;
  return /^(TJ|TRF|TRT)[\s-]*[A-Z0-9]+$/.test(t) ? t.replace(/[\s-]/g, "") : t;
}

/** UF do tribunal: a da sigla (TJSP, TJDFT) ou a mais comum nos processos (coluna UF ou número CNJ). */
function ufDoTribunal(sigla: string, ps: Processo[]): string | null {
  const ufs = Object.values(UF_TR);
  const tj = /^TJ([A-Z]{2})T?$/.exec(sigla);
  if (tj && ufs.includes(tj[1]!)) return tj[1]!;
  const cont = new Map<string, number>();
  for (const p of ps) {
    const col = p.uf.trim().toUpperCase();
    const uf = ufs.includes(col) ? col : ufDoProcesso(p.numero);
    if (uf) cont.set(uf, (cont.get(uf) ?? 0) + 1);
  }
  return [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function rotuloTribunal(t: TribunalCivel): string {
  return t.uf ? `${t.uf} · ${t.sigla}` : t.sigla;
}

export function analisarCivel(processos: Processo[]): AnaliseCivel {
  const considerados = processos.filter((p) => !isArquivado(p));
  const semPoloCliente = considerados.every((p) => p.poloCliente == null);
  const passivos = semPoloCliente ? considerados : considerados.filter((p) => p.poloCliente === "PASSIVO");
  const passivo = soma(passivos, (p) => p.valorCausa);
  const valores = considerados.map((p) => p.valorCausa);

  const porTribunal = new Map<string, Processo[]>();
  for (const p of considerados) {
    const t = siglaTribunal(p);
    porTribunal.set(t, [...(porTribunal.get(t) ?? []), p]);
  }
  const tribunais: TribunalCivel[] = [...porTribunal.entries()]
    .map(([sigla, ps]) => ({ sigla, uf: sigla === SEM_TRIBUNAL ? null : ufDoTribunal(sigla, ps), qtd: ps.length }))
    .sort((a, b) => b.qtd - a.qtd);
  const regioes = limitarGrupos(
    tribunais.map((t) => ({ nome: rotuloTribunal(t), qtd: t.qtd, valor: 0 })),
    4,
    "Outros",
  );

  const socioMap = new Map<string, Agrupado>();
  for (const p of considerados) {
    const nome = p.socioPoloPassivo === "SIM" ? "Sim" : p.socioPoloPassivo === "NAO" ? "Não" : "Não informado";
    const g = socioMap.get(nome) ?? { nome, qtd: 0, valor: 0 };
    g.qtd += 1;
    g.valor += p.valorCausa;
    socioMap.set(nome, g);
  }
  const ordemSocio = ["Sim", "Não", "Não informado"];
  const socios = [...socioMap.values()].sort((a, b) => ordemSocio.indexOf(a.nome) - ordemSocio.indexOf(b.nome));

  const top = [...passivos]
    .sort((a, b) => b.valorCausa - a.valorCausa)
    .slice(0, 5)
    .map((p) => ({ parte: p.poloAtivo, processo: p.numero, valor: p.valorCausa, classe: p.classe }));

  const fases = agruparFases(considerados, (p) => p.valorCausa);
  const linhas: string[] = [];
  const faseTop = [...fases].sort((a, b) => b.qtd - a.qtd)[0];
  if (faseTop && considerados.length) {
    linhas.push(
      `Carteira concentrada na fase de ${faseTop.nome.toLowerCase()}: ${faseTop.qtd} dos ${considerados.length} processos.`,
    );
  }
  const maiorCaso = top[0];
  if (maiorCaso && passivo > 0) {
    linhas.push(
      `Maior exposição: ${classeMinuscula(maiorCaso.classe) || "processo"} movido por ${tituloNome(primeiraParte(maiorCaso.parte))} (${brlCompacto(maiorCaso.valor)}, ${pct(maiorCaso.valor / passivo, 0)} do potencial passivo).`,
    );
  }

  return {
    total: processos.length,
    ativos: considerados.length - considerados.filter(isSuspenso).length,
    suspensos: considerados.filter(isSuspenso).length,
    arquivados: processos.length - considerados.length,
    passivo,
    media: valores.length ? soma(considerados, (p) => p.valorCausa) / valores.length : 0,
    maior: valores.length ? Math.max(...valores) : 0,
    tribunais,
    regioes,
    fases,
    socios,
    top,
    semPoloCliente,
    leitura: linhas.join("\n"),
  };
}

// ─── Trabalhista ──────────────────────────────────────────────────────────────
//
// Regras tiradas dos slides que a área trabalhista montou (ALEA, Antonini, Sedna — out/2026),
// conferidos contra as planilhas e confirmados com o advogado da área (20/10/2026):
// ver docs/DUE-APRESENTACAO-AUTOMATICA.md.

type CategoriaPedido = { rotulo: string; texto: string; re: RegExp; destaque: boolean };

/**
 * Pedidos que a área conta no gráfico, procurados em cada assunto da coluna "Assuntos"
 * (ou "Pedidos") de todos os processos; entram os de maior incidência. Saneamento da área:
 * quem pede multa 477 ou aviso prévio pede verbas rescisórias, mesmo sem esse assunto
 * cadastrado. `destaque: false` = fica fora do texto "principais pedidos" (a multa 477 é
 * acessória das verbas rescisórias). Na ordem desta lista ficam os empates.
 */
export const PEDIDOS_TRABALHISTAS: CategoriaPedido[] = [
  { rotulo: "Horas extras", texto: "horas extras", re: /horas? extras?/, destaque: true },
  { rotulo: "Verbas rescisórias", texto: "verbas rescisórias", re: /verbas rescis|477|aviso previo/, destaque: true },
  { rotulo: "Multa 477 CLT", texto: "multa do art. 477 da CLT", re: /477/, destaque: false },
  { rotulo: "Dano moral", texto: "danos morais", re: /moral/, destaque: true },
  { rotulo: "Vínculo de emprego", texto: "vínculo de emprego", re: /relacao de emprego|vinculo (de emprego|empregaticio)/, destaque: true },
  { rotulo: "Insalubridade", texto: "insalubridade", re: /insalub/, destaque: true },
  { rotulo: "Periculosidade", texto: "periculosidade", re: /periculos/, destaque: true },
  { rotulo: "Rescisão indireta", texto: "rescisão indireta", re: /rescisao indireta/, destaque: true },
  { rotulo: "Intervalo", texto: "intervalo intrajornada", re: /intervalo/, destaque: true },
  { rotulo: "Acúmulo função", texto: "acúmulo de função", re: /acumulo/, destaque: true },
  { rotulo: "Desvio de função", texto: "desvio de função", re: /desvio de funcao/, destaque: true },
  { rotulo: "Acidente", texto: "acidente de trabalho", re: /acidente|doenca (ocupacional|profissional)/, destaque: true },
  { rotulo: "Adicional noturno", texto: "adicional noturno", re: /noturn/, destaque: true },
  { rotulo: "Equiparação salarial", texto: "equiparação salarial", re: /equiparacao|isonomia/, destaque: true },
  { rotulo: "Justa causa", texto: "reversão da justa causa", re: /justa causa/, destaque: true },
  { rotulo: "Estabilidade", texto: "estabilidade/reintegração", re: /estabilidade|reintegra/, destaque: true },
  { rotulo: "Dano material", texto: "danos materiais", re: /\bmateria(l|is)\b/, destaque: true },
];

/** A área mostra de 10 a 12 pedidos; o gráfico do modelo foi desenhado para 9. */
export const MAX_PEDIDOS_GRAFICO = 10;

function assuntosDoProcesso(texto: string): string[] {
  return normalizarTexto(texto)
    .split(/\s*[,;]\s*/)
    .filter(Boolean);
}

/** Assuntos que viram um trecho legível no destaque da leitura executiva. */
const ASSUNTO_DESTAQUE: Array<[RegExp, string]> = [
  [/acidente|doenca ocupacional/, "acidente de trabalho"],
  [/reconhecimento de relacao de emprego|vinculo/, "vínculo empregatício"],
  [/comiss/, "diferenças de comissão"],
  [/dano moral|assedio moral/, "danos morais"],
  [/horas? extras?/, "horas extras"],
  [/insalub/, "adicional de insalubridade"],
  [/periculos/, "adicional de periculosidade"],
  [/equiparacao|isonomia/, "equiparação salarial"],
  [/rescisao indireta/, "rescisão indireta"],
  [/justa causa/, "reversão de justa causa"],
  [/estabilidade|reintegracao/, "estabilidade/reintegração"],
  [/verbas rescis/, "verbas rescisórias"],
];

function pedidosDoProcesso(p: Processo): string[] {
  const texto = normalizarTexto(`${p.assuntos}, ${p.pedidos}`);
  const out: string[] = [];
  for (const [re, frase] of ASSUNTO_DESTAQUE) {
    if (re.test(texto) && !out.includes(frase)) out.push(frase);
    if (out.length === 2) break;
  }
  return out;
}

export type AnaliseTrabalhista = {
  total: number;
  /** Não arquivados: a área soma os suspensos em "Ativos". */
  ativos: number;
  /** Quantos dos ativos estão com situação "Suspenso" (só informativo no CRM). */
  suspensos: number;
  arquivados: number;
  passivo: number;
  /** Média do valor da causa de todos os processos da planilha (padrão da área). */
  media: number;
  maior: number;
  maiorProcesso: Processo | null;
  /** Não arquivados com "Valor envolvido" zero na planilha (acordo quitado, execução extinta…). */
  zerados: Processo[];
  fases: Agrupado[];
  porAno: Array<{ ano: string; qtd: number }>;
  pedidos: Array<{ rotulo: string; texto: string; qtd: number; destaque: boolean }>;
  obsAno: string;
  obsPedidos: string;
  leitura: string;
};

/**
 * Exposição do processo: a coluna "Valor envolvido" como a área preencheu (zero inclusive:
 * é saldo de acordo quitado, execução extinta etc.). Sem essa coluna, o valor da causa.
 */
export function valorEnvolvido(p: Processo): number {
  if (p.valorEnvolvido == null) return isArquivado(p) ? 0 : p.valorCausa;
  return p.valorEnvolvido;
}

export function analisarTrabalhista(processos: Processo[]): AnaliseTrabalhista {
  const considerados = processos.filter((p) => !isArquivado(p));
  const suspensos = considerados.filter(isSuspenso).length;
  const passivo = soma(considerados, valorEnvolvido);
  const maiorProcesso = [...considerados].sort((a, b) => valorEnvolvido(b) - valorEnvolvido(a))[0] ?? null;

  // Histórico de ajuizamento e perfil de pedidos: a base inteira (inclusive arquivados).
  const anos = new Map<number, number>();
  for (const p of processos) {
    const a = ano(p);
    if (a) anos.set(a, (anos.get(a) ?? 0) + 1);
  }
  const anosOrd = [...anos.keys()].sort((a, b) => a - b);
  const porAno: Array<{ ano: string; qtd: number }> = [];
  if (anosOrd.length) {
    for (let a = anosOrd[0]!; a <= anosOrd[anosOrd.length - 1]!; a++) porAno.push({ ano: String(a), qtd: anos.get(a) ?? 0 });
  }

  const usaAssuntos = processos.some((p) => p.assuntos);
  const assuntos = processos.map((p) => assuntosDoProcesso(usaAssuntos ? p.assuntos : p.pedidos));
  const pedidos = PEDIDOS_TRABALHISTAS.map((c) => ({
    rotulo: c.rotulo,
    texto: c.texto,
    destaque: c.destaque,
    qtd: assuntos.filter((itens) => itens.some((x) => c.re.test(x))).length,
  }))
    .filter((c) => c.qtd > 0)
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, MAX_PEDIDOS_GRAFICO);

  const pico = [...porAno].sort((a, b) => b.qtd - a.qtd)[0];
  const obsAno = pico
    ? `Observa-se que houve um pico no ajuizamento de reclamações trabalhistas no ano de **${pico.ano} (${pico.qtd})**`
    : "";
  const principais = pedidos
    .filter((p) => p.destaque)
    .slice(0, 3)
    .map((p) => p.texto);
  const obsPedidos = principais.length
    ? `Observa-se que os principais pedidos das reclamações trabalhistas são: **${listaPt(principais)}.**`
    : "";

  const fases = agruparFases(considerados, valorEnvolvido);
  const faseTop = [...fases].sort((a, b) => b.qtd - a.qtd)[0];
  const partes: string[] = [];
  if (faseTop) partes.push(`Carteira concentrada na fase de ${faseTop.nome.toLowerCase()}.`);
  if (principais.length) partes.push(`Os principais pedidos estão ligados a ${listaPt(principais)}.`);
  if (maiorProcesso) {
    const pedidosMaior = pedidosDoProcesso(maiorProcesso);
    const v = valorEnvolvido(maiorProcesso);
    const qualValor = Math.abs(v - maiorProcesso.valorCausa) < 0.01 ? "valor da causa" : "valor envolvido";
    partes.push(
      `Destaque para o processo n. ${maiorProcesso.numero} (${tituloNome(primeiraParte(maiorProcesso.poloAtivo))})${pedidosMaior.length ? `, em que há pedido de ${listaPt(pedidosMaior)},` : ""} com ${qualValor} de ${brl(v)}.`,
    );
  }

  return {
    total: processos.length,
    ativos: considerados.length,
    suspensos,
    arquivados: processos.length - considerados.length,
    passivo,
    media: processos.length ? soma(processos, (p) => p.valorCausa) / processos.length : 0,
    maior: maiorProcesso ? valorEnvolvido(maiorProcesso) : 0,
    maiorProcesso,
    zerados: considerados.filter((p) => p.valorEnvolvido === 0),
    fases,
    porAno,
    pedidos,
    obsAno,
    obsPedidos,
    leitura: partes.join(" "),
  };
}

// ─── Tributário ───────────────────────────────────────────────────────────────

const UF_TR: Record<string, string> = {
  "01": "AC", "02": "AL", "03": "AP", "04": "AM", "05": "BA", "06": "CE", "07": "DF", "08": "ES", "09": "GO",
  "10": "MA", "11": "MT", "12": "MS", "13": "MG", "14": "PA", "15": "PB", "16": "PR", "17": "PE", "18": "PI",
  "19": "RJ", "20": "RN", "21": "RS", "22": "RO", "23": "RR", "24": "SC", "25": "SE", "26": "SP", "27": "TO",
};

/** UF pelo número CNJ (justiça estadual: J=8, TR = código do estado). */
export function ufDoProcesso(numero: string): string | null {
  const m = /\d{7}-?\d{2}\.?\d{4}\.?(\d)\.?(\d{2})\.?\d{4}/.exec(numero);
  if (!m) return null;
  if (m[1] === "8") return UF_TR[m[2]!] ?? null;
  return null;
}

export type AnaliseTributario = {
  processos: number;
  tramitacao: number;
  suspensos: number;
  passivoJudicial: number;
  origens: Array<{ origem: string; valor: number; qtd: number }>;
  pgfn: { tributario: number; previdenciario: number; multa: number };
  pge: number;
  administrativo: number;
  /** judicial + administrativo (é o que entra na conclusão). */
  passivoTotal: number;
  maior: Processo | null;
  pontos: string;
  leitura: string;
};

function origemTributaria(p: Processo): string {
  const a = normalizarTexto(p.poloAtivo);
  const uf = ufDoProcesso(p.numero);
  if (/uniao|fazenda nacional|pgfn|receita federal/.test(a)) return "União (PGFN)";
  if (/municip|prefeitura/.test(a)) return `Municípios${uf ? ` (${uf})` : ""}`;
  // Nome do estado vem do texto original (com acento): "Fazenda Pública do Estado de São Paulo".
  const est = /estado (do|de|da) (.+)$/i.exec(p.poloAtivo.trim());
  if (est || /fazenda (publica )?estadual|fazenda do estado/.test(a)) {
    return est ? `Estado ${est[1]!.toLowerCase()} ${tituloNome(est[2]!)}` : `Estado${uf ? ` (${uf})` : ""}`;
  }
  return p.poloAtivo ? tituloNome(p.poloAtivo) : "Não informado";
}

export function analisarTributario(processos: Processo[], extras: ExtrasTributario): AnaliseTributario {
  const considerados = processos.filter((p) => !isArquivado(p));
  const suspensos = considerados.filter(isSuspenso).length;
  const passivoJudicial = soma(considerados, (p) => p.valorCausa);
  const origemMap = new Map<string, { origem: string; valor: number; qtd: number }>();
  for (const p of considerados) {
    const o = origemTributaria(p);
    const g = origemMap.get(o) ?? { origem: o, valor: 0, qtd: 0 };
    g.valor += p.valorCausa;
    g.qtd += 1;
    origemMap.set(o, g);
  }
  const origens = [...origemMap.values()].sort((a, b) => b.valor - a.valor);
  const pgfn = extras.pgfn ?? { tributario: 0, previdenciario: 0, multa: 0 };
  const pgfnTotal = pgfn.tributario + pgfn.previdenciario + pgfn.multa;
  const pge = extras.pge ?? 0;
  const administrativo = pgfnTotal + pge;
  const maior = [...considerados].sort((a, b) => b.valorCausa - a.valorCausa)[0] ?? null;

  const pontos: string[] = [];
  const top = origens[0];
  if (top && passivoJudicial > 0) {
    pontos.push(`Maior concentração: ${top.origem} (${pct(top.valor / passivoJudicial, 2)} do valor).`);
  }
  if (maior && maior.valorCausa > 0) {
    const a = ano(maior);
    pontos.push(`Maior execução fiscal${a ? ` (${a})` : ""}: ${brlCompacto(maior.valorCausa)}.`);
  }
  pontos.push(
    suspensos === 0
      ? "Todos os processos judiciais estão em tramitação."
      : `${suspensos} processo(s) suspenso(s); ${considerados.length - suspensos} em tramitação.`,
  );
  pontos.push(
    pgfnTotal > 0
      ? `Débitos inscritos em dívida ativa federal (PGFN): ${brlCompacto(pgfnTotal)}.`
      : "Nenhum débito inscrito em dívida ativa federal (PGFN).",
  );
  pontos.push("Relevância de análise de oportunidades de transação e parcelamento.");

  const partes: string[] = [];
  partes.push(
    `Foram identificados ${considerados.length} processos judiciais de natureza tributária (execuções fiscais)${suspensos === 0 ? ", todos em tramitação" : ""}, com potencial passivo de ${brlCompacto(passivoJudicial)}.`,
  );
  const adm: string[] = [];
  if (pge > 0) adm.push(`${brlCompacto(pge)} em dívida ativa estadual`);
  if (pgfnTotal > 0) adm.push(`${brlCompacto(pgfnTotal)} em dívida ativa federal`);
  if (adm.length || extras.pge != null || extras.pgfn != null) {
    partes.push(
      `Na esfera administrativa, há ${adm.length ? listaPt(adm) : "nenhum débito inscrito"}${pgfnTotal === 0 ? " e nenhum débito na PGFN" : ""}, o que demanda avaliação estratégica quanto a riscos, contingências e oportunidades de regularização.`,
    );
  }

  return {
    processos: considerados.length,
    tramitacao: considerados.length - suspensos,
    suspensos,
    passivoJudicial,
    origens,
    pgfn,
    pge,
    administrativo,
    passivoTotal: passivoJudicial + administrativo,
    maior,
    pontos: pontos.join("\n"),
    leitura: partes.join(" "),
  };
}

// ─── Recuperação de crédito ───────────────────────────────────────────────────

export const FAIXAS_VALOR = [
  { rotulo: "Até R$ 50mil", max: 50_000 },
  { rotulo: "R$ 50 mil a R$ 100 mil", max: 100_000 },
  { rotulo: "R$ 100 mil a R$ 500 mil", max: 500_000 },
  { rotulo: "R$ 500 mil a R$ 1 milhão", max: 1_000_000 },
  { rotulo: "Acima de R$ 1 milhão", max: Infinity },
];

export const FAIXAS_TEMPO = [
  { rotulo: "Até 1 ano", max: 1 },
  { rotulo: "De 1 a 3 anos", max: 3 },
  { rotulo: "De 3 a 5 anos", max: 5 },
  { rotulo: "Acima de 5 anos", max: Infinity },
];

export type AnaliseRecCred = {
  total: number;
  ativos: number;
  arquivados: number;
  valorCausa: number;
  media: number;
  porTipo: Array<{ classe: string; valor: number; qtd: number }>;
  faixas: number[];
  porAno: Array<{ ano: string; valor: number; qtd: number }>;
  tempo: number[];
  tempoMedioAnos: number;
  top: Array<{ devedor: string; processo: string; valor: number }>;
  topTotal: number;
  topPct: number;
};

export function analisarRecCred(processos: Processo[], hoje: Date): AnaliseRecCred {
  const ativos = processos.filter((p) => !isArquivado(p));
  const valorCausa = soma(ativos, (p) => p.valorCausa);

  const tipos = new Map<string, { classe: string; valor: number; qtd: number }>();
  for (const p of ativos) {
    const k = (p.classe || "Não informada").toUpperCase();
    const g = tipos.get(k) ?? { classe: k, valor: 0, qtd: 0 };
    g.valor += p.valorCausa;
    g.qtd += 1;
    tipos.set(k, g);
  }
  const porTipo = [...tipos.values()].sort((a, b) => b.valor - a.valor);

  const faixas = FAIXAS_VALOR.map(() => 0);
  for (const p of ativos) {
    const i = FAIXAS_VALOR.findIndex((f) => p.valorCausa <= f.max);
    faixas[i < 0 ? faixas.length - 1 : i]! += 1;
  }

  const anoMap = new Map<number, { valor: number; qtd: number }>();
  for (const p of ativos) {
    const a = ano(p);
    if (!a) continue;
    const g = anoMap.get(a) ?? { valor: 0, qtd: 0 };
    g.valor += p.valorCausa;
    g.qtd += 1;
    anoMap.set(a, g);
  }
  const anos = [...anoMap.keys()].sort((a, b) => a - b);
  const porAno: AnaliseRecCred["porAno"] = [];
  if (anos.length) {
    for (let a = anos[0]!; a <= anos[anos.length - 1]!; a++) {
      porAno.push({ ano: String(a), valor: anoMap.get(a)?.valor ?? 0, qtd: anoMap.get(a)?.qtd ?? 0 });
    }
  }

  const tempo = FAIXAS_TEMPO.map(() => 0);
  const idades: number[] = [];
  for (const p of ativos) {
    const inicio = inicioTramitacao(p);
    if (!inicio) continue;
    const anosTram = (hoje.getTime() - new Date(`${inicio}T00:00:00Z`).getTime()) / (365.25 * 86400000);
    if (!Number.isFinite(anosTram) || anosTram < 0) continue;
    idades.push(anosTram);
    const i = FAIXAS_TEMPO.findIndex((f) => anosTram <= f.max);
    tempo[i < 0 ? tempo.length - 1 : i]! += 1;
  }

  const top = [...ativos]
    .sort((a, b) => b.valorCausa - a.valorCausa)
    .slice(0, 5)
    .map((p) => ({ devedor: p.poloPassivo, processo: p.numero, valor: p.valorCausa }));
  const topTotal = top.reduce((s, t) => s + t.valor, 0);

  return {
    total: processos.length,
    ativos: ativos.length,
    arquivados: processos.length - ativos.length,
    valorCausa,
    media: ativos.length ? valorCausa / ativos.length : 0,
    porTipo,
    faixas,
    porAno,
    tempo,
    tempoMedioAnos: idades.length ? idades.reduce((s, x) => s + x, 0) / idades.length : 0,
    top,
    topTotal,
    topPct: valorCausa > 0 ? topTotal / valorCausa : 0,
  };
}
