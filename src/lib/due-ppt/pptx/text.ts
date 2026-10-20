/**
 * Troca de marcadores {{TOKEN}} no texto dos slides.
 *
 * - O marcador pode estar quebrado em vários runs (o PowerPoint faz isso ao editar);
 *   o valor fica com a formatação do run onde o marcador começa.
 * - Parágrafo que é só o marcador e cujo valor tem "\n" vira um parágrafo por linha
 *   (mantém bullets/espaçamento do parágrafo original).
 * - `**trecho**` no valor sai em negrito; o resto do valor sai sem negrito.
 */
import { NS, createEl, insertAfter, kid, kids, desc, remove, setText, type XElement } from "./xml";

export const TOKEN_RE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export type TokenValues = Record<string, string | number | null | undefined>;

type Segment = { text: string; bold: boolean };

export function parseMarkup(value: string): Segment[] {
  const out: Segment[] = [];
  const parts = value.split("**");
  parts.forEach((text, i) => {
    if (text) out.push({ text, bold: i % 2 === 1 });
  });
  return out;
}

function runText(r: XElement): string {
  const t = kid(r, NS.a, "t");
  return t?.textContent ?? "";
}

function setRunText(r: XElement, text: string): void {
  let t = kid(r, NS.a, "t");
  if (!t) {
    t = createEl(r.ownerDocument!, NS.a, "t", r.prefix ?? "a");
    r.appendChild(t);
  }
  setText(t, text);
}

function setBold(r: XElement, bold: boolean): void {
  let rPr = kid(r, NS.a, "rPr");
  if (!rPr) {
    rPr = createEl(r.ownerDocument!, NS.a, "rPr", r.prefix ?? "a");
    r.insertBefore(rPr, r.firstChild);
  }
  rPr.setAttribute("b", bold ? "1" : "0");
}

function lookup(values: TokenValues, key: string, missing: Set<string>): string {
  const v = values[key];
  if (v == null) {
    missing.add(key);
    return "";
  }
  return String(v);
}

/** Substitui um run por vários (um por trecho de markup), mantendo o rPr. */
function splitRunByMarkup(run: XElement, text: string): void {
  if (!text.includes("**")) {
    setRunText(run, text);
    return;
  }
  const segs = parseMarkup(text);
  if (!segs.length) {
    setRunText(run, "");
    return;
  }
  let prev = run;
  segs.forEach((seg, i) => {
    const r = i === 0 ? run : (run.cloneNode(true) as XElement);
    setRunText(r, seg.text);
    setBold(r, seg.bold);
    if (i > 0) {
      insertAfter(r, prev);
      prev = r;
    }
  });
}

function stripContent(p: XElement): void {
  for (const tag of ["r", "br", "fld"]) for (const el of kids(p, NS.a, tag)) remove(el);
}

function appendRun(p: XElement, run: XElement): void {
  const end = kid(p, NS.a, "endParaRPr");
  if (end) p.insertBefore(run, end);
  else p.appendChild(run);
}

/** Expande um parágrafo-marcador em N parágrafos (uma linha cada). */
function expandParagraph(p: XElement, baseRun: XElement, value: string): void {
  const lines = value.split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const useMarkup = value.includes("**");
  const template = p.cloneNode(true) as XElement;
  stripContent(template);
  let prev: XElement | null = null;
  lines.forEach((line, i) => {
    const para = i === 0 ? p : (template.cloneNode(true) as XElement);
    if (i === 0) stripContent(para);
    const segs = useMarkup ? parseMarkup(line) : line ? [{ text: line, bold: false }] : [];
    for (const seg of segs) {
      const r = baseRun.cloneNode(true) as XElement;
      setRunText(r, seg.text);
      if (useMarkup) setBold(r, seg.bold);
      appendRun(para, r);
    }
    if (i > 0 && prev) insertAfter(para, prev);
    prev = para;
  });
}

/**
 * Preenche os marcadores dentro de `root` (slide, célula de tabela...).
 * Marcadores sem valor viram texto vazio e entram em `missing`.
 */
export function fillTokens(root: XElement, values: TokenValues, missing: Set<string>): void {
  const paragraphs = desc(root, NS.a, "p");
  for (const p of paragraphs) {
    if (!p.parentNode) continue; // parágrafo já removido
    const runs = kids(p, NS.a, "r");
    if (!runs.length) continue;
    let texts = runs.map(runText);
    const joined = texts.join("");
    if (!joined.includes("{{")) continue;
    const matches = [...joined.matchAll(TOKEN_RE)];
    if (!matches.length) continue;

    if (matches.length === 1 && joined.trim() === matches[0]![0]) {
      const value = lookup(values, matches[0]![1]!, missing);
      if (value.includes("\n") || value.includes("**")) {
        const start = joined.indexOf(matches[0]![0]);
        let acc = 0;
        let base = runs[0]!;
        for (let i = 0; i < runs.length; i++) {
          if (start < acc + texts[i]!.length) {
            base = runs[i]!;
            break;
          }
          acc += texts[i]!.length;
        }
        expandParagraph(p, base.cloneNode(true) as XElement, value);
        continue;
      }
    }

    // Troca da direita para a esquerda: posições anteriores continuam válidas.
    for (const m of matches.reverse()) {
      const start = m.index!;
      const end = start + m[0].length;
      const value = lookup(values, m[1]!, missing).replace(/\n+/g, " ");
      let acc = 0;
      let iStart = -1;
      let iEnd = -1;
      let localStart = 0;
      let localEnd = 0;
      for (let i = 0; i < runs.length; i++) {
        const len = texts[i]!.length;
        if (iStart < 0 && start < acc + len) {
          iStart = i;
          localStart = start - acc;
        }
        if (iStart >= 0 && end <= acc + len) {
          iEnd = i;
          localEnd = end - acc;
          break;
        }
        acc += len;
      }
      if (iStart < 0 || iEnd < 0) continue;
      const head = texts[iStart]!.slice(0, localStart);
      const tail = texts[iEnd]!.slice(localEnd);
      if (iStart === iEnd) {
        texts[iStart] = head + value + tail;
      } else {
        texts[iStart] = head + value;
        for (let i = iStart + 1; i < iEnd; i++) texts[i] = "";
        texts[iEnd] = tail;
      }
    }
    texts.forEach((t, i) => splitRunByMarkup(runs[i]!, t));
    texts = [];
  }
}

/** Texto plano de um shape/célula (para testes e conferência). */
export function plainText(root: XElement): string {
  return desc(root, NS.a, "p")
    .map((p) => desc(p, NS.a, "t").map((t) => t.textContent ?? "").join(""))
    .join("\n");
}
