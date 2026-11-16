/** Formatação dos números da apresentação DUE (padrão dos PPTs já entregues). */
import { isValidCnpj, isValidCpf } from "@/lib/crm/rd-migration/documents";

const NUM_2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM_1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NUM_0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function clean(s: string): string {
  // Intl usa espaço não separável em alguns ambientes; no PPT queremos espaço comum.
  return s.replace(/ | /g, " ");
}

/** "R$ 2.342.866,93" */
export function brl(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  const s = clean(NUM_2.format(Math.abs(v)));
  return `${v < 0 ? "-" : ""}R$ ${s}`;
}

/** "R$ 206.593" (sem centavos — tabela de top 5 do painel de crédito). */
export function brlInteiro(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  return `${v < 0 ? "-" : ""}R$ ${clean(NUM_0.format(Math.round(Math.abs(v))))}`;
}

/** "R$ 698,7 mil", "R$ 143,57 milhões", "R$ 1,2 bilhão". */
export function brlCompacto(value: number): string {
  const v = Math.abs(Number.isFinite(value) ? value : 0);
  const sinal = value < 0 ? "-" : "";
  if (v >= 1e9) {
    const n = v / 1e9;
    return `${sinal}R$ ${clean(NUM_2.format(n))} ${n < 2 ? "bilhão" : "bilhões"}`;
  }
  if (v >= 1e6) {
    const n = v / 1e6;
    return `${sinal}R$ ${clean(NUM_2.format(n))} ${n < 2 ? "milhão" : "milhões"}`;
  }
  if (v >= 1e3) return `${sinal}R$ ${clean(NUM_1.format(v / 1e3))} mil`;
  return `${sinal}${brl(v)}`;
}

/** Variação em milhões com sinal: "+R$ 18,9 mi", "−R$ 237,8 mi". */
export function brlVariacaoMi(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  const sinal = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sinal}R$ ${clean(NUM_1.format(Math.abs(v) / 1e6))} mi`;
}

/** Percentual com casas: pct(0.4271) → "42,7%"; pct(0.3, 0) → "30%". */
export function pct(ratio: number, casas = 1): string {
  const r = Number.isFinite(ratio) ? ratio : 0;
  const f = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return `${clean(f.format(r * 100))}%`;
}

/** Contagem com 2 dígitos, como nos painéis ("05", "31", "137"). */
export function qtd2(n: number): string {
  return String(Math.max(0, Math.round(n))).padStart(2, "0");
}

export function inteiro(n: number): string {
  return clean(NUM_0.format(Math.round(n)));
}

export function anosDecimal(anos: number): string {
  return `${clean(NUM_1.format(anos))} ${Math.abs(anos - 1) < 0.05 ? "ano" : "anos"}`;
}

/** dd/MM/aaaa a partir de ISO (yyyy-mm-dd...). */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** CNPJ/CPF só com dígitos → com máscara; o resto volta como veio. */
export function formatarDocumento(doc: string): string {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return (doc ?? "").trim();
}

/**
 * Cadastro do cliente vindo do RD guarda os documentos de todas as partes emendados, na ordem dos
 * nomes ("2169943080262125796872…" = 5 CPFs). Separa em `n` CPFs (11 dígitos) ou CNPJs (14) e só
 * devolve se todos forem válidos; senão, lista vazia.
 */
export function separarDocumentos(documento: string, n: number): string[] {
  const d = (documento ?? "").replace(/\D/g, "");
  if (n < 1 || !d) return [];
  for (const [tamanho, valido] of [
    [11, isValidCpf],
    [14, isValidCnpj],
  ] as const) {
    if (d.length !== tamanho * n) continue;
    const partes = Array.from({ length: n }, (_, i) => d.slice(i * tamanho, (i + 1) * tamanho));
    if (partes.every((p) => valido(p))) return partes.map(formatarDocumento);
  }
  return [];
}

/** Lista em português: ["a","b","c"] → "a, b e c". */
export function listaPt(itens: string[]): string {
  const xs = itens.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
}

/** Palavras que às vezes chegam sem acento nas planilhas; só as que não têm outra leitura. */
const ACENTOS: Record<string, string> = {
  acao: "ação", acoes: "ações", alienacao: "alienação", apreensao: "apreensão", avaliacao: "avaliação",
  citacao: "citação", civel: "cível", civeis: "cíveis", cobranca: "cobrança", conceicao: "conceição",
  decisao: "decisão", distribuicao: "distribuição", execucao: "execução", execucoes: "execuções",
  falencia: "falência", familia: "família", fiduciaria: "fiduciária", homologacao: "homologação",
  indenizacao: "indenização", intimacao: "intimação", joao: "joão", juridica: "jurídica", liquidacao: "liquidação",
  monitoria: "monitória", obrigacao: "obrigação", obrigacoes: "obrigações", peticao: "petição",
  prestacao: "prestação", publica: "pública", recuperacao: "recuperação", regiao: "região",
  reparacao: "reparação", rescisao: "rescisão", sao: "são", sentenca: "sentença", servicos: "serviços",
  titulo: "título", titulos: "títulos", unica: "única",
};

/**
 * Devolve os acentos de palavras comuns ("EXECUCAO DE TITULO" → "EXECUÇÃO DE TÍTULO"),
 * mantendo maiúsculas. Texto que já tem acento volta como veio.
 */
export function acentuar(texto: string): string {
  if (!texto || /[À-ÖØ-öø-ÿ]/.test(texto)) return texto;
  return texto.replace(/[A-Za-z]+/g, (w) => {
    const certo = ACENTOS[w.toLowerCase()];
    if (!certo) return w;
    if (w === w.toUpperCase()) return certo.toUpperCase();
    if (w[0] === w[0]!.toUpperCase()) return certo[0]!.toUpperCase() + certo.slice(1);
    return certo;
  });
}

/** "BANCO BRADESCO FINANCIAMENTOS S.A" → "Banco Bradesco Financiamentos S.A". */
export function tituloNome(nome: string): string {
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
  return nome
    .toLowerCase()
    .split(/(\s+)/)
    .map((parte, i) => {
      if (/^\s+$/.test(parte) || parte === "") return parte;
      if (i > 0 && minusculas.has(parte)) return parte;
      if (/^(s\.?a\.?|s\/a|ltda\.?|me|epp|eireli)$/i.test(parte)) return parte.toUpperCase().replace("LTDA", "Ltda");
      return parte.charAt(0).toUpperCase() + parte.slice(1);
    })
    .join("");
}
