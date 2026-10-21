/**
 * Mescla do que a IA leu dos PDFs da recuperação judicial com o formulário da
 * Reestruturação. A IA só preenche o que está vazio; quando o formulário já tem
 * outro valor, vira uma sugestão de substituição que o usuário marca se quiser.
 * Linhas das listas casam pela classe (I a IV) ou pelo título; o que não casa
 * entra como linha nova.
 */
import type { ReestruturacaoForm as Form } from "./draft";
import { brl, dataBr } from "./format";

export type SugestaoTipo = "preencher" | "substituir" | "adicionar";

export type SugestaoIa = {
  chave: string;
  rotulo: string;
  /** Valor da IA, pronto para mostrar. */
  valor: string;
  /** Valor que está no formulário (só em "substituir"). */
  atual?: string;
  tipo: SugestaoTipo;
};

type Valor = string | number | null;
type Linha = Record<string, Valor>;

const CAMPOS_SIMPLES = [
  ["autos", "Autos nº"],
  ["recuperandas", "Recuperandas"],
  ["competencia", "Competência"],
  ["juiz", "Juiz"],
  ["relator", "Relator prevento"],
  ["administrador", "Administrador judicial"],
  ["foro", "Foro"],
  ["ajuizamento", "Ajuizamento"],
  ["deferimento", "Deferimento do processamento"],
  ["resumo", "Resumo"],
  ["passivoTotal", "Passivo total"],
  ["extraconcursalEdital", "Extraconcursal (edital)"],
  ["extraconcursalAj", "Extraconcursal (AJ)"],
  ["endividamentoResumo", "Destaque do endividamento"],
] as const satisfies ReadonlyArray<readonly [keyof Form, string]>;

type CampoSimples = (typeof CAMPOS_SIMPLES)[number][0];

const DATAS = new Set<string>(["ajuizamento", "deferimento"]);

type Lista = "classes" | "pagamento" | "opcoes" | "medidas";

type ConfigLista = {
  max: number;
  campos: ReadonlyArray<readonly [string, string]>;
  /** Identificam a linha: só entram quando estão vazios no formulário (nunca substituem). */
  fixos: ReadonlyArray<string>;
  chave: (r: Linha) => string;
  nome: (r: Linha) => string;
  nova: string;
  resumo: (r: Linha) => string;
};

const str = (v: Valor) => (typeof v === "string" ? v : "");
const juntar = (partes: Array<string | false>) => partes.filter(Boolean).join(" · ");

const LISTAS: Record<Lista, ConfigLista> = {
  classes: {
    max: 20,
    campos: [
      ["classe", "nome"],
      ["edital", "edital"],
      ["aj", "relatório do AJ"],
    ],
    fixos: ["classe"],
    chave: (r) => chaveClasse(str(r.classe)),
    nome: (r) => str(r.classe) || "Classe",
    nova: "Nova classe",
    resumo: (r) =>
      juntar([
        str(r.classe),
        typeof r.edital === "number" && `edital ${brl(r.edital)}`,
        typeof r.aj === "number" && `AJ ${brl(r.aj)}`,
      ]),
  },
  pagamento: {
    max: 20,
    campos: [
      ["classe", "classe"],
      ["desagio", "deságio"],
      ["carencia", "carência"],
      ["forma", "forma e prazo"],
      ["atualizacao", "atualização e juros"],
    ],
    fixos: ["classe"],
    chave: (r) => chaveClasse(str(r.classe)),
    nome: (r) => `Plano · ${str(r.classe) || "classe"}`,
    nova: "Plano, nova classe",
    resumo: (r) => juntar([str(r.classe), str(r.desagio), str(r.carencia), str(r.forma), str(r.atualizacao)]),
  },
  opcoes: {
    max: 2,
    campos: [
      ["rotulo", "rótulo"],
      ["titulo", "título"],
      ["contrapartida", "contrapartida"],
      ["condicoes", "condições"],
      ["obs", "observação"],
    ],
    fixos: ["rotulo", "titulo"],
    chave: (r) => normalizar(str(r.titulo)),
    nome: (r) => `Forma especial · ${str(r.titulo) || str(r.rotulo) || "sem título"}`,
    nova: "Nova forma especial",
    resumo: (r) => juntar([str(r.titulo), str(r.condicoes)]),
  },
  medidas: {
    max: 3,
    campos: [
      ["categoria", "categoria"],
      ["titulo", "título"],
      ["destaque", "destaque"],
      ["preve", "o que prevê"],
      ["objetivo", "objetivo"],
    ],
    fixos: ["titulo"],
    chave: (r) => normalizar(str(r.titulo)),
    nome: (r) => `Medida · ${str(r.titulo) || str(r.categoria) || "sem título"}`,
    nova: "Nova medida",
    resumo: (r) => juntar([str(r.categoria), str(r.titulo), str(r.destaque)]),
  },
};

const ORDEM_LISTAS: Lista[] = ["classes", "pagamento", "opcoes", "medidas"];

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Classe III – Quirografários", "Quirografária", "classe 3" → "3". Outros nomes: o próprio nome normalizado. */
export function chaveClasse(nome: string): string {
  const t = normalizar(nome);
  const m = /classe\s*(iv|i{1,3}|[1-4])\b/.exec(t);
  if (m) return ({ i: "1", ii: "2", iii: "3", iv: "4" } as Record<string, string>)[m[1]!] ?? m[1]!;
  if (/trabalh/.test(t)) return "1";
  if (/garantia real/.test(t)) return "2";
  if (/quirograf/.test(t)) return "3";
  if (/me ?\/ ?epp|microempresa|pequeno porte/.test(t)) return "4";
  return t;
}

const vazio = (v: Valor) => v == null || (typeof v === "string" && !v.trim());

function iguais(a: Valor, b: Valor): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005;
  return normalizar(String(a ?? "")) === normalizar(String(b ?? ""));
}

function mostrar(campo: string, v: Valor): string {
  if (v == null) return "";
  if (typeof v === "number") return brl(v);
  if (DATAS.has(campo)) return dataBr(v) || v;
  return v.length > 160 ? `${v.slice(0, 159)}…` : v;
}

type Operacao = { sugestao: SugestaoIa; aplicar: (f: Form, destacados: Set<string>) => void };

function comparar(
  campo: string,
  rotulo: string,
  chave: string,
  atual: Valor,
  ia: Valor,
  aplicar: (f: Form) => void,
  podeSubstituir = true,
): Operacao | null {
  if (vazio(ia) || (!vazio(atual) && (!podeSubstituir || iguais(atual, ia)))) return null;
  const tipo: SugestaoTipo = vazio(atual) ? "preencher" : "substituir";
  return {
    sugestao: {
      chave,
      rotulo,
      valor: mostrar(campo, ia),
      ...(tipo === "substituir" ? { atual: mostrar(campo, atual) } : {}),
      tipo,
    },
    aplicar: (f, destacados) => {
      aplicar(f);
      destacados.add(chave);
    },
  };
}

const linhas = (f: Form, lista: Lista) => f[lista] as unknown as Linha[];

function operacoesLista(lista: Lista, atual: Form, ia: Form): Operacao[] {
  const cfg = LISTAS[lista];
  const atuais = linhas(atual, lista);
  const novas = linhas(ia, lista);
  const semConteudo = (r: Linha) => cfg.campos.every(([c]) => (c === "rotulo" ? true : vazio(r[c] ?? null)));
  const usados = new Set<number>();
  const par = new Map<number, number>(); // índice na IA → índice no formulário

  novas.forEach((r, j) => {
    const k = cfg.chave(r);
    if (!k) return;
    const i = atuais.findIndex((a, idx) => !usados.has(idx) && cfg.chave(a) === k);
    if (i >= 0) {
      usados.add(i);
      par.set(j, i);
    }
  });
  // Linha em branco no formulário (ex.: "Adicionar medida" sem preencher) recebe a primeira sobra da IA.
  novas.forEach((_, j) => {
    if (par.has(j)) return;
    const i = atuais.findIndex((a, idx) => !usados.has(idx) && semConteudo(a));
    if (i >= 0) {
      usados.add(i);
      par.set(j, i);
    }
  });

  const ops: Operacao[] = [];
  let livres = cfg.max - atuais.length;
  novas.forEach((r, j) => {
    const i = par.get(j);
    if (i == null) {
      if (livres <= 0) return;
      livres--;
      ops.push({
        sugestao: { chave: `${lista}+${j}`, rotulo: cfg.nova, valor: cfg.resumo(r), tipo: "adicionar" },
        aplicar: (f, destacados) => {
          const destino = linhas(f, lista);
          destino.push(structuredClone(r));
          destacados.add(`${lista}.${destino.length - 1}`);
        },
      });
      return;
    }
    const a = atuais[i]!;
    const nome = cfg.nome(semConteudo(a) ? r : a);
    for (const [campo, rotuloCampo] of cfg.campos) {
      const op = comparar(
        campo,
        `${nome} — ${rotuloCampo}`,
        `${lista}.${i}.${campo}`,
        a[campo] ?? null,
        r[campo] ?? null,
        (f) => {
          linhas(f, lista)[i]![campo] = r[campo] ?? null;
        },
        !cfg.fixos.includes(campo),
      );
      if (op) ops.push(op);
    }
  });
  return ops;
}

function setCampo(f: Form, campo: CampoSimples, v: Valor) {
  (f as unknown as Linha)[campo] = v;
}

function operacoes(atual: Form, ia: Form): Operacao[] {
  const ops: Operacao[] = [];
  for (const [campo, rotulo] of CAMPOS_SIMPLES) {
    const op = comparar(campo, rotulo, campo, atual[campo], ia[campo], (f) => setCampo(f, campo, ia[campo]));
    if (op) ops.push(op);
  }
  for (const lista of ORDEM_LISTAS) ops.push(...operacoesLista(lista, atual, ia));
  return ops;
}

/** O que a IA mudaria no formulário (vazio = nada novo nos PDFs). */
export function sugestoesIa(atual: Form, ia: Form): SugestaoIa[] {
  return operacoes(atual, ia).map((op) => op.sugestao);
}

/** Por padrão entra tudo, menos o que substituiria um valor já preenchido. */
export function aceitasPadrao(sugestoes: SugestaoIa[]): Set<string> {
  return new Set(sugestoes.filter((s) => s.tipo !== "substituir").map((s) => s.chave));
}

/**
 * Formulário com as sugestões aceitas aplicadas. `destacados` traz os caminhos
 * preenchidos pela IA: "autos", "classes.0.edital", ou a linha inteira ("medidas.2").
 */
export function aplicarSugestoes(
  atual: Form,
  ia: Form,
  aceitas: ReadonlySet<string>,
): { form: Form; destacados: Set<string> } {
  const form = structuredClone(atual);
  const destacados = new Set<string>();
  for (const op of operacoes(atual, ia)) {
    if (aceitas.has(op.sugestao.chave)) op.aplicar(form, destacados);
  }
  return { form, destacados };
}

/** O campo (ou a linha dele) veio da IA? */
export function destacado(destacados: ReadonlySet<string> | null | undefined, caminho: string): boolean {
  if (!destacados?.size) return false;
  if (destacados.has(caminho)) return true;
  const m = /^(\w+\.\d+)\./.exec(caminho);
  return !!m && destacados.has(m[1]!);
}
