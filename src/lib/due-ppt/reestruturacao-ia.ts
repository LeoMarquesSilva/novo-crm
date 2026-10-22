/**
 * Leitura por IA das peças da recuperação judicial (edital do art. 52, §1º,
 * relatório do administrador judicial, plano) para o formulário da Reestruturação.
 * Aqui só fica o que é puro (recorte do texto, schema, prompts e parse da
 * resposta); a rota `reestruturacao-pdf` baixa os PDFs, extrai o texto e chama a IA.
 */
import { reestruturacaoSchema, type ReestruturacaoForm } from "./draft";
import { parseValor } from "./processos";

export const REEST_PDF_MAX_ARQUIVOS = 5;
export const REEST_PDF_MAX_BYTES = 50 * 1024 * 1024;
/** Pasta temporária no bucket due-documents (os PDFs saem de lá depois da leitura). */
export const REEST_PDF_PASTA = "reestruturacao-pdf/";
/** Teto do texto mandado à IA, somando todos os documentos. */
export const REEST_RECORTE_CHAR_CAP = 60_000;
export const REEST_IA_MAX_TOKENS = 6_000;

// ─── recorte ────────────────────────────────────────────────────────────────

export type TipoPeca = "edital" | "relatorio_aj" | "plano" | "decisao" | "outro";

const TIPO_ROTULO: Record<TipoPeca, string> = {
  edital: "edital do art. 52, §1º",
  relatorio_aj: "relatório / relação de credores do administrador judicial",
  plano: "plano de recuperação judicial",
  decisao: "decisão judicial",
  outro: "documento da recuperação judicial",
};

/** Minúsculas e sem acento, com o mesmo comprimento do original (os índices batem). */
function normalizar(texto: string): string {
  let out = "";
  for (const c of texto) {
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    out += base.length === c.length ? base : c;
  }
  return out;
}

function limparEspacos(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Qual peça é (pelo nome do arquivo e pelo começo do texto). */
export function tipoPeca(nome: string, texto: string): TipoPeca {
  const n = normalizar(nome);
  if (/plano|prj\b/.test(n)) return "plano";
  if (/edital/.test(n)) return "edital";
  if (/relatorio|rma\b|\baj\b|administrador|art\.? ?7/.test(n)) return "relatorio_aj";
  if (/decis|despacho|deferi/.test(n)) return "decisao";
  const inicio = normalizar(texto.slice(0, 5_000));
  if (/plano de recuperacao (judicial|extrajudicial)/.test(inicio)) return "plano";
  if (/\bedital\b/.test(inicio)) return "edital";
  if (/relatorio (mensal|de atividades|do administrador|circunstanciado)|relacao de credores do administrador|art\.? ?7.{0,6}§ ?2/.test(inicio)) {
    return "relatorio_aj";
  }
  if (/\bdecido\b|defiro o processamento|vistos\b/.test(inicio)) return "decisao";
  return "outro";
}

/** Termos que marcam trecho útil ao formulário (texto já normalizado) e seu peso. */
const TERMOS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g, 3],
  [/\bautos\b|processo n/g, 1],
  [/recuperand/g, 2],
  [/\bvara\b|\bjuizo\b|\bcomarca\b|\bforo\b/g, 1],
  [/\bjuiz|\bjuiza\b|magistrad/g, 1],
  [/relator|desembargad|camara reservada/g, 2],
  [/administrador(a)? judicial/g, 2],
  [/ajuizad|distribuid|pedido de recuperacao/g, 2],
  [/deferi|processamento da recuperacao/g, 2],
  [/classe (i{1,3}|iv|1|2|3|4)\b/g, 3],
  [/trabalhist|garantia real|quirograf|me ?\/ ?epp|microempresa|pequeno porte/g, 2],
  [/extraconcursa/g, 3],
  [/\btotal\b|subtotal|passivo (total|concursal|sujeito)/g, 3],
  [/art\.? ?52|art\.? ?7\b/g, 1],
  [/desagio/g, 3],
  [/carencia/g, 3],
  [/parcela|amortiza/g, 2],
  [/juros|correcao monetaria|atualizacao monetaria|\btr\b|ipca|\bcdi\b|selic/g, 2],
  [/credor(es)? (parceir|colaborad|estrategic|apoiador|fornecedor|financiador)/g, 3],
  [/opcao [ab12]\b|forma (especial|alternativa) de pagamento/g, 3],
  [/\bdip\b|\bupi\b|unidade produtiva|alienacao|venda de ativ|captacao|aporte|conversao de|reorganizacao societaria|leilao|dacao/g, 2],
  [/meios de recuperacao|art\.? ?50\b/g, 2],
];

const PREAMBULO = 3_000;
const ANTES = 200;
const DEPOIS = 700;
const TRECHO_MAX = 2_500;
const SEPARADOR = "\n[...]\n";

type Trecho = { inicio: number; fim: number; score: number };

/** Trechos em volta dos termos, unidos quando se encostam e cortados em pedaços de até TRECHO_MAX. */
function trechos(texto: string): Trecho[] {
  const norm = normalizar(texto);
  const hits: Array<{ i: number; termo: number; peso: number }> = [];
  TERMOS.forEach(([re, peso], termo) => {
    re.lastIndex = 0;
    for (const m of norm.matchAll(re)) hits.push({ i: m.index ?? 0, termo, peso });
  });
  if (!hits.length) return [];
  hits.sort((a, b) => a.i - b.i);

  const faixas: Array<{ inicio: number; fim: number }> = [];
  for (const h of hits) {
    const inicio = Math.max(0, h.i - ANTES);
    const fim = Math.min(texto.length, h.i + DEPOIS);
    const ultima = faixas[faixas.length - 1];
    if (ultima && inicio <= ultima.fim) ultima.fim = Math.max(ultima.fim, fim);
    else faixas.push({ inicio, fim });
  }

  const out: Trecho[] = [];
  for (const f of faixas) {
    for (let ini = f.inicio; ini < f.fim; ini += TRECHO_MAX) {
      const fim = Math.min(f.fim, ini + TRECHO_MAX);
      const dentro = hits.filter((h) => h.i >= ini && h.i < fim);
      const termos = new Map<number, number>();
      for (const h of dentro) termos.set(h.termo, h.peso);
      // Variedade de termos vale mais que repetição do mesmo termo.
      const score = [...termos.values()].reduce((s, p) => s + p, 0) + dentro.length * 0.05;
      out.push({ inicio: ini, fim, score });
    }
  }
  return out;
}

/** Preâmbulo + melhores trechos do documento, na ordem em que aparecem, dentro do orçamento. */
function recortarDocumento(texto: string, orcamento: number): string {
  if (texto.length <= orcamento) return texto;
  const preambulo = Math.min(PREAMBULO, Math.floor(orcamento / 3));
  const escolhidos: Trecho[] = [{ inicio: 0, fim: preambulo, score: Infinity }];
  let usado = preambulo;
  const candidatos = trechos(texto)
    .map((t) => ({ ...t, inicio: Math.max(t.inicio, preambulo) }))
    .filter((t) => t.fim > t.inicio)
    .sort((a, b) => b.score - a.score || a.inicio - b.inicio);
  for (const t of candidatos) {
    const custo = t.fim - t.inicio + SEPARADOR.length;
    if (usado + custo > orcamento) continue;
    escolhidos.push(t);
    usado += custo;
  }
  escolhidos.sort((a, b) => a.inicio - b.inicio);
  const faixas: Array<{ inicio: number; fim: number }> = [];
  for (const t of escolhidos) {
    const ultima = faixas[faixas.length - 1];
    if (ultima && t.inicio <= ultima.fim) ultima.fim = Math.max(ultima.fim, t.fim);
    else faixas.push({ inicio: t.inicio, fim: t.fim });
  }
  return faixas
    .map((f) => texto.slice(f.inicio, f.fim).trim())
    .filter(Boolean)
    .join(SEPARADOR);
}

export type DocumentoLido = { nome: string; texto: string; paginas?: number };
export type DocumentoRecortado = {
  nome: string;
  tipo: TipoPeca;
  caracteres: number;
  recortados: number;
};

/**
 * Junta os documentos num texto só para a IA, até `cap` caracteres. Documento
 * curto vai inteiro; o longo vai com o começo (onde ficam autos, juízo e
 * recuperandas) e os trechos com mais termos do formulário (classes, totais,
 * deságio, carência, credores parceiros, meios de recuperação…).
 */
export function recortarTrechos(
  docs: DocumentoLido[],
  cap = REEST_RECORTE_CHAR_CAP,
): { texto: string; documentos: DocumentoRecortado[] } {
  const preparados = docs.map((d, i) => {
    const texto = limparEspacos(d.texto);
    const tipo = tipoPeca(d.nome, texto);
    const paginas = d.paginas ? ` — ${d.paginas} página${d.paginas === 1 ? "" : "s"}` : "";
    const cabecalho = `=== Documento ${i + 1}: ${d.nome} (${TIPO_ROTULO[tipo]}${paginas}) ===`;
    return { nome: d.nome, tipo, texto, cabecalho, corpo: "" };
  });

  // Orçamento: o que sobra dos cabeçalhos, repartido; documento curto devolve a sobra aos outros.
  let restante = cap - preparados.reduce((s, p) => s + p.cabecalho.length + 2, 0) - 2 * preparados.length;
  const ordem = [...preparados].sort((a, b) => a.texto.length - b.texto.length);
  ordem.forEach((p, i) => {
    const orcamento = Math.max(0, Math.floor(restante / (ordem.length - i)));
    p.corpo = recortarDocumento(p.texto, orcamento);
    restante -= p.corpo.length;
  });

  let texto = preparados.map((p) => `${p.cabecalho}\n${p.corpo || "(sem texto legível)"}`).join("\n\n");
  if (texto.length > cap) texto = texto.slice(0, cap);
  return {
    texto,
    documentos: preparados.map((p) => ({
      nome: p.nome,
      tipo: p.tipo,
      caracteres: p.texto.length,
      recortados: p.corpo.length,
    })),
  };
}

// ─── schema da resposta (OpenAI structured outputs, strict) ──────────────────

const s = (description: string) => ({ type: "string", description }) as const;
const n = (description: string) => ({ type: ["number", "null"], description }) as const;
function obj(properties: Record<string, unknown>) {
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) } as const;
}

export const reestruturacaoJsonSchema = obj({
  autos: s("Número dos autos da recuperação judicial (formato CNJ, como no documento)."),
  recuperandas: s('Razões sociais das recuperandas separadas por " | ".'),
  competencia: s("Juízo / vara onde corre a recuperação judicial."),
  juiz: s("Nome do(a) juiz(a) que conduz o processo."),
  relator: s("Desembargador(a) relator(a) prevento no tribunal, se citado."),
  administrador: s("Administrador judicial (empresa e, se houver, o responsável)."),
  resumo: s('Marcos do processo em uma linha, separados por " • ", só com fatos dos documentos.'),
  passivoTotal: n("Total da relação de credores do edital do art. 52, §1º, em reais."),
  deferimento: s("Data da decisão que deferiu o processamento (yyyy-mm-dd)."),
  ajuizamento: s("Data do pedido / distribuição da recuperação judicial (yyyy-mm-dd)."),
  foro: s('Cidade – UF do juízo (ex.: "Campinas – SP").'),
  classes: {
    type: "array",
    description: "Classes de credores concursais (I a IV), sem extraconcursal.",
    items: obj({
      classe: s('Nome da classe (ex.: "Classe I – Trabalhista").'),
      edital: n("Valor da classe no edital do art. 52, §1º (relação da recuperanda), em reais."),
      aj: n("Valor da classe na relação / relatório do administrador judicial, em reais."),
    }),
  },
  extraconcursalEdital: n("Créditos extraconcursais informados pela recuperanda / edital, em reais."),
  extraconcursalAj: n("Créditos extraconcursais informados pelo administrador judicial, em reais."),
  endividamentoResumo: s("Uma frase curta destacando o principal da composição do endividamento."),
  pagamento: {
    type: "array",
    description: "Forma de pagamento de cada classe no plano.",
    items: obj({
      classe: s("Classe de credores."),
      desagio: s("Deságio (ex.: 50%)."),
      carencia: s("Carência (ex.: 12 meses da homologação)."),
      forma: s("Forma e prazo de pagamento."),
      atualizacao: s("Atualização monetária e juros."),
    }),
  },
  opcoes: {
    type: "array",
    description: "Até 2 formas especiais de pagamento (credor parceiro / colaborador / fornecedor…).",
    items: obj({
      rotulo: s('"OPÇÃO A" ou "OPÇÃO B".'),
      titulo: s("A quem se aplica (ex.: Credores colaboradores financeiros)."),
      contrapartida: s("Contrapartida exigida do credor."),
      condicoes: s('Condições em poucas palavras (ex.: "Deságio 15% • Carência 6 meses • 36 parcelas").'),
      obs: s("Observação relevante, se houver."),
    }),
  },
  medidas: {
    type: "array",
    description: "Até 3 principais meios de recuperação do plano (art. 50).",
    items: obj({
      categoria: s("Categoria curta em maiúsculas (ex.: CAPTAÇÃO, ALIENAÇÃO DE ATIVOS)."),
      titulo: s("Título da medida (ex.: Financiamento DIP)."),
      destaque: s('Número ou prazo de destaque (ex.: "Até R$ 150 milhões").'),
      preve: s("O que a medida prevê."),
      objetivo: s("Objetivo da medida."),
    }),
  },
});

export function buildReestruturacaoSystemPrompt(): string {
  return [
    "Você lê peças de uma recuperação judicial brasileira (edital do art. 52, §1º, da Lei 11.101/2005, relatório e relação de credores do administrador judicial, plano de recuperação judicial, decisões) e preenche o formulário de um slide de due diligence.",
    "",
    "Regras:",
    "- Use só o que está escrito nos trechos. Não deduza, não estime, não some valores por conta própria e não complete com conhecimento geral.",
    '- Campo sem informação nos trechos: texto "", número null, lista [].',
    "- Valores em reais como número (1234567.89): sem R$, sem separador de milhar.",
    "- Datas no formato yyyy-mm-dd.",
    "- classes: concursais, na ordem da lei (I trabalhista, II garantia real, III quirografários, IV ME/EPP). 'edital' é o valor da classe na relação de credores publicada com o edital do art. 52, §1º (lista da recuperanda); 'aj' é o valor na relação do administrador judicial (art. 7º, §2º) ou no relatório do AJ. Se só um aparece, o outro fica null. Extraconcursal não entra em classes: vai em extraconcursalEdital / extraconcursalAj.",
    "- passivoTotal: total da relação de credores do edital do art. 52, §1º, só se estiver escrito.",
    "- Havendo várias recuperandas, todas em recuperandas, separadas por \" | \".",
    "- pagamento: uma linha por classe, como está no plano.",
    "- opcoes: no máximo 2 formas especiais / alternativas de pagamento; medidas: no máximo 3 meios de recuperação, os de maior impacto.",
    "- Textos em português, curtos e objetivos, sem markdown.",
  ].join("\n");
}

export function buildReestruturacaoUserPrompt(recorte: string): string {
  return `Trechos dos documentos da recuperação judicial (recortes; não é o documento inteiro):\n\n${recorte}`;
}

// ─── parse da resposta ───────────────────────────────────────────────────────

function registro(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function txt(v: unknown, max: number): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  const t = String(v).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Valor em reais: número da IA ou texto "R$ 1.234,56"; sem dígito nenhum → null. */
export function valorIa(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string" || !/\d/.test(v)) return null;
  const n = parseValor(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Data em yyyy-mm-dd (aceita dd/mm/aaaa); inválida → "". */
export function dataIa(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  let ano: number, mes: number, dia: number;
  if (m) [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
    if (!m) return "";
    [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return "";
  if (ano < 1990 || ano > 2100) return "";
  return d.toISOString().slice(0, 10);
}

function linhas(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(registro) : [];
}

const vazio = (r: Record<string, string | number | null>) =>
  Object.values(r).every((x) => x == null || x === "");

/**
 * Resposta da IA → formulário da Reestruturação, validado por `reestruturacaoSchema`.
 * Tolera número em texto e data dd/mm/aaaa, corta textos no limite do schema,
 * descarta linhas vazias e respeita o máximo de linhas de cada lista.
 */
export function parseRespostaReestruturacao(raw: unknown): ReestruturacaoForm {
  const o = registro(raw);
  let extraconcursalEdital = valorIa(o.extraconcursalEdital);
  let extraconcursalAj = valorIa(o.extraconcursalAj);

  const classes = linhas(o.classes)
    .map((c) => ({ classe: txt(c.classe, 200), edital: valorIa(c.edital), aj: valorIa(c.aj) }))
    .filter((c) => {
      if (vazio(c)) return false;
      // A IA às vezes põe o extraconcursal como mais uma classe.
      if (/extra ?concursa/i.test(c.classe)) {
        extraconcursalEdital ??= c.edital;
        extraconcursalAj ??= c.aj;
        return false;
      }
      return true;
    })
    .slice(0, 20);

  const pagamento = linhas(o.pagamento)
    .map((p) => ({
      classe: txt(p.classe, 200),
      desagio: txt(p.desagio, 200),
      carencia: txt(p.carencia, 200),
      forma: txt(p.forma, 400),
      atualizacao: txt(p.atualizacao, 300),
    }))
    .filter((p) => !vazio(p))
    .slice(0, 20);

  const opcoes = linhas(o.opcoes)
    .map((x) => ({
      rotulo: txt(x.rotulo, 60),
      titulo: txt(x.titulo, 200),
      contrapartida: txt(x.contrapartida, 1500),
      condicoes: txt(x.condicoes, 300),
      obs: txt(x.obs, 600),
    }))
    .filter((x) => !vazio({ ...x, rotulo: "" }))
    .slice(0, 2)
    .map((x, i) => ({ ...x, rotulo: x.rotulo || `OPÇÃO ${i === 0 ? "A" : "B"}` }));

  const medidas = linhas(o.medidas)
    .map((x) => ({
      categoria: txt(x.categoria, 60),
      titulo: txt(x.titulo, 200),
      destaque: txt(x.destaque, 120),
      preve: txt(x.preve, 600),
      objetivo: txt(x.objetivo, 400),
    }))
    .filter((x) => !vazio(x))
    .slice(0, 3);

  return reestruturacaoSchema.parse({
    autos: txt(o.autos, 200),
    recuperandas: txt(o.recuperandas, 2000),
    competencia: txt(o.competencia, 1000),
    juiz: txt(o.juiz, 200),
    relator: txt(o.relator, 200),
    administrador: txt(o.administrador, 300),
    resumo: txt(o.resumo, 1000),
    passivoTotal: valorIa(o.passivoTotal),
    deferimento: dataIa(o.deferimento),
    ajuizamento: dataIa(o.ajuizamento),
    foro: txt(o.foro, 200),
    classes,
    extraconcursalEdital,
    extraconcursalAj,
    endividamentoResumo: txt(o.endividamentoResumo, 1000),
    pagamento,
    opcoes,
    medidas,
  });
}
