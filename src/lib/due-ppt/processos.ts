/**
 * Normaliza as planilhas que chegam dos levantamentos (exportações das
 * plataformas de pesquisa processual + planilhas montadas pelas áreas).
 * Os nomes de coluna variam um pouco entre áreas; aqui viram um formato só.
 */
import { normalizarTexto, type DueAreaId } from "./areas";
import type { CellValue, SheetData } from "./xlsx-reader";

export type Processo = {
  numero: string;
  situacao: string;
  fase: string;
  classe: string;
  poloAtivo: string;
  poloPassivo: string;
  /** Polo em que o cliente diligenciado está (ATIVO/PASSIVO), quando a planilha informa. */
  poloCliente: "ATIVO" | "PASSIVO" | null;
  socioPoloPassivo: "SIM" | "NAO" | null;
  /** yyyy-mm-dd */
  dataDistribuicao: string | null;
  comarca: string;
  vara: string;
  tribunal: string;
  instancia: string;
  uf: string;
  valorCausa: number;
  valorEnvolvido: number | null;
  valorAcordo: number;
  valorLiquidacao: number;
  origemValor: string;
  pedidos: string;
  assuntos: string;
  cargos: string;
  ultimoMovimento: string;
  indicativoBloqueio: boolean | null;
  indicativoRevelia: boolean | null;
  dataAcordo: string | null;
  dataArquivamento: string | null;
  documento: string;
  nome: string;
};

export type ExtrasTributario = {
  /** Dívida ativa estadual (aba PGE). */
  pge: number | null;
  /** Dívida ativa federal (aba PGFN), por natureza. */
  pgfn: { tributario: number; previdenciario: number; multa: number } | null;
};

export type PlanilhaNormalizada = {
  processos: Processo[];
  extras: ExtrasTributario;
  colunas: string[];
  avisos: string[];
};

type Campo = keyof Processo;

const ALIASES: Array<[Campo, string[]]> = [
  ["numero", ["numero do processo", "numero processo", "n do processo", "no do processo", "processo", "numero"]],
  ["situacao", ["situacao", "status processo", "status do processo", "situacao do processo", "status"]],
  ["fase", ["fase", "fase processual"]],
  ["classe", ["classe", "tipo de acao", "tipo da acao", "classe processual", "tipo"]],
  ["poloAtivo", ["partes polo ativo", "polo ativo", "parte ativa", "autor", "reclamante", "exequente", "credor"]],
  ["poloPassivo", ["partes polo passivo", "polo passivo", "parte passiva", "reu", "reclamada", "reclamadas", "executado"]],
  ["poloCliente", ["polo do cliente"]],
  ["socioPoloPassivo", ["socio no polo passivo", "socio no polo passivo?"]],
  ["dataDistribuicao", ["data da distribuicao", "data distribuicao", "data de distribuicao", "distribuicao", "data do ajuizamento", "ajuizamento"]],
  ["comarca", ["comarca"]],
  ["vara", ["vara", "orgao julgador"]],
  ["tribunal", ["tribunal"]],
  ["instancia", ["instancia", "grau"]],
  ["uf", ["uf", "estado"]],
  ["valorCausa", ["valor de causa", "valor da causa", "valor de causa (r$)", "valor"]],
  ["valorEnvolvido", ["valor envolvido"]],
  ["valorAcordo", ["valor de acordo", "valor do acordo"]],
  ["valorLiquidacao", ["valor de liquidacao"]],
  ["origemValor", ["origem valor", "origem do valor"]],
  ["pedidos", ["pedidos"]],
  ["assuntos", ["assuntos", "assunto"]],
  ["cargos", ["tipo de cargos", "cargo", "cargos"]],
  ["ultimoMovimento", ["ultimo movimento", "ultima movimentacao", "ultimos andamentos"]],
  ["indicativoBloqueio", ["indicativo de bloqueio", "indicativo de bloqueio?"]],
  ["indicativoRevelia", ["indicativo de revelia", "indicativo de revelia?"]],
  ["dataAcordo", ["data do acordo"]],
  ["dataArquivamento", ["data do arquivamento"]],
  ["documento", ["cpf/cnpj", "cnpjs", "cnpj"]],
  ["nome", ["nome", "razao social"]],
];

function headerKey(raw: CellValue): string {
  return normalizarTexto(raw).replace(/\(r\$\)/g, "").replace(/[?:]/g, "").replace(/\s+/g, " ").trim();
}

function mapHeaders(row: CellValue[]): Map<Campo, number> {
  const out = new Map<Campo, number>();
  const keys = row.map(headerKey);
  for (const [campo, aliases] of ALIASES) {
    for (const alias of aliases) {
      const a = alias.replace(/[?:]/g, "").trim();
      const idx = keys.findIndex((k, i) => k === a && ![...out.values()].includes(i));
      if (idx >= 0) {
        out.set(campo, idx);
        break;
      }
    }
  }
  return out;
}

export function parseValor(v: CellValue): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!s || /^(n\/?f|n\/?a|-|—)$/i.test(s)) return 0;
  // 1.234.567,89 | 1234567.89 | 1,234,567.89
  let n: number;
  if (/,\d{1,2}$/.test(s)) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/\.\d{1,2}$/.test(s) && s.split(".").length === 2) n = Number(s.replace(/,/g, ""));
  else n = Number(s.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function parseData(v: CellValue): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function texto(v: CellValue): string {
  if (v == null) return "";
  const s = String(v).trim();
  return /^(n\/?f|n\/?a)$/i.test(s) ? "" : s;
}

function simNao(v: CellValue): boolean | null {
  const n = normalizarTexto(v);
  if (!n) return null;
  if (n.startsWith("s")) return true;
  if (n.startsWith("n")) return false;
  return null;
}

/** Linha de cabeçalho: a primeira (até a 15ª) que reconhece ≥ 3 colunas, incluindo o número do processo. */
function findHeader(rows: CellValue[][]): { index: number; map: Map<Campo, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const map = mapHeaders(rows[i] ?? []);
    if (map.size >= 3 && map.has("numero")) return { index: i, map };
  }
  return null;
}

function pareceProcesso(numero: string): boolean {
  return /\d{4,}/.test(numero) && !/^total/i.test(numero);
}

function lerProcessos(sheet: SheetData): { processos: Processo[]; colunas: string[] } | null {
  const header = findHeader(sheet.rows);
  if (!header) return null;
  const { index, map } = header;
  const get = (row: CellValue[], campo: Campo): CellValue => {
    const i = map.get(campo);
    return i == null ? null : (row[i] ?? null);
  };
  const processos: Processo[] = [];
  for (const row of sheet.rows.slice(index + 1)) {
    const numero = texto(get(row, "numero"));
    if (!pareceProcesso(numero)) continue;
    const polo = normalizarTexto(get(row, "poloCliente"));
    const socio = simNao(get(row, "socioPoloPassivo"));
    processos.push({
      numero,
      situacao: texto(get(row, "situacao")),
      fase: texto(get(row, "fase")),
      classe: texto(get(row, "classe")),
      poloAtivo: texto(get(row, "poloAtivo")),
      poloPassivo: texto(get(row, "poloPassivo")),
      poloCliente: polo.startsWith("pass") ? "PASSIVO" : polo.startsWith("ativ") ? "ATIVO" : null,
      socioPoloPassivo: socio == null ? null : socio ? "SIM" : "NAO",
      dataDistribuicao: parseData(get(row, "dataDistribuicao")),
      comarca: texto(get(row, "comarca")),
      vara: texto(get(row, "vara")),
      tribunal: texto(get(row, "tribunal")),
      instancia: texto(get(row, "instancia")),
      uf: texto(get(row, "uf")),
      valorCausa: parseValor(get(row, "valorCausa")),
      valorEnvolvido: map.has("valorEnvolvido") ? parseValor(get(row, "valorEnvolvido")) : null,
      valorAcordo: parseValor(get(row, "valorAcordo")),
      valorLiquidacao: parseValor(get(row, "valorLiquidacao")),
      origemValor: texto(get(row, "origemValor")),
      pedidos: texto(get(row, "pedidos")),
      assuntos: texto(get(row, "assuntos")),
      cargos: texto(get(row, "cargos")),
      ultimoMovimento: texto(get(row, "ultimoMovimento")),
      indicativoBloqueio: simNao(get(row, "indicativoBloqueio")),
      indicativoRevelia: simNao(get(row, "indicativoRevelia")),
      dataAcordo: parseData(get(row, "dataAcordo")),
      dataArquivamento: parseData(get(row, "dataArquivamento")),
      documento: texto(get(row, "documento")),
      nome: texto(get(row, "nome")),
    });
  }
  const colunas = (sheet.rows[index] ?? []).map((c) => String(c ?? "")).filter(Boolean);
  return { processos, colunas };
}

/** Abas de dívida ativa (PGE/PGFN): pares rótulo × valor, com linha TOTAL opcional. */
function lerDividaAtiva(sheet: SheetData): { total: number; linhas: Array<{ rotulo: string; valor: number }> } {
  const linhas: Array<{ rotulo: string; valor: number }> = [];
  let total: number | null = null;
  for (const row of sheet.rows) {
    const rotulo = texto(row[0] ?? null);
    const valorCell = row.slice(1).find((c) => c != null && c !== "");
    if (!rotulo || valorCell == null) continue;
    const valor = parseValor(valorCell);
    if (!valor && typeof valorCell === "string" && !/\d/.test(valorCell)) continue; // cabeçalho
    if (/^total/i.test(rotulo)) total = valor;
    else linhas.push({ rotulo, valor });
  }
  return { total: total ?? linhas.reduce((s, l) => s + l.valor, 0), linhas };
}

export function normalizarPlanilha(sheets: SheetData[]): PlanilhaNormalizada {
  const processos: Processo[] = [];
  const colunas = new Set<string>();
  const avisos: string[] = [];
  const extras: ExtrasTributario = { pge: null, pgfn: null };
  for (const sheet of sheets) {
    const nome = normalizarTexto(sheet.name);
    if (/\bpge\b|estadual/.test(nome)) {
      extras.pge = (extras.pge ?? 0) + lerDividaAtiva(sheet).total;
      continue;
    }
    if (/\bpgfn\b|federal/.test(nome)) {
      const { linhas } = lerDividaAtiva(sheet);
      const acc = extras.pgfn ?? { tributario: 0, previdenciario: 0, multa: 0 };
      for (const l of linhas) {
        const r = normalizarTexto(l.rotulo);
        if (r.includes("previd")) acc.previdenciario += l.valor;
        else if (r.includes("multa") || r.includes("trabalh") || r.includes("fgts")) acc.multa += l.valor;
        else acc.tributario += l.valor;
      }
      extras.pgfn = acc;
      continue;
    }
    const lido = lerProcessos(sheet);
    if (!lido) continue;
    processos.push(...lido.processos);
    lido.colunas.forEach((c) => colunas.add(c));
  }
  if (!processos.length && extras.pge == null && extras.pgfn == null) {
    avisos.push("Nenhum processo encontrado: confira se a planilha tem a coluna \"Número do processo\".");
  }
  // Mesma pasta em duas planilhas/abas: conta uma vez.
  const vistos = new Set<string>();
  const unicos = processos.filter((p) => {
    const k = p.numero.replace(/\D/g, "");
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  if (unicos.length < processos.length) {
    avisos.push(`${processos.length - unicos.length} processo(s) repetido(s) ignorado(s).`);
  }
  return { processos: unicos, extras, colunas: [...colunas], avisos };
}

/** Palpite da área pelo nome do arquivo e pelas colunas. */
export function detectarArea(filename: string, sheets: SheetData[]): DueAreaId | null {
  const f = normalizarTexto(filename);
  if (/rec(\.|uperacao)?\s*(de\s*)?cred/.test(f)) return "rec_cred";
  if (/trabalh/.test(f)) return "trabalhista";
  if (/tribut|fiscal/.test(f)) return "tributario";
  if (/civel/.test(f)) return "civel";
  if (/reestrut|recuperacao judicial|insolv/.test(f)) return "reestruturacao";
  const names = sheets.map((s) => normalizarTexto(s.name)).join(" ");
  if (/tribut|pge|pgfn/.test(names)) return "tributario";
  for (const s of sheets) {
    const header = findHeader(s.rows);
    if (!header) continue;
    const keys = (s.rows[header.index] ?? []).map(headerKey);
    if (keys.includes("valor envolvido") || keys.includes("pedidos")) return "trabalhista";
    if (keys.includes("polo do cliente")) return "civel";
    if (keys.includes("status processo") || keys.some((k) => k.includes("tipo de acao"))) return "tributario";
    const tribunais = s.rows.slice(header.index + 1, header.index + 30).map((r) => normalizarTexto(r[header.map.get("tribunal") ?? -1]));
    if (tribunais.some((t) => t.startsWith("trt"))) return "trabalhista";
  }
  return null;
}
