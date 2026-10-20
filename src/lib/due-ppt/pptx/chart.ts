/**
 * Atualiza os dados de um gráfico nativo do PowerPoint: cache do gráfico
 * (o que aparece no slide) e, quando existe, a planilha embutida (o que abre em
 * "Editar dados"), para os dois não ficarem diferentes.
 */
import PizZip from "pizzip";
import { REL, type PptxPackage } from "./package";
import { findShape } from "./shapes";
import {
  NS,
  createEl,
  desc,
  firstDesc,
  kid,
  kids,
  parseXml,
  remove,
  serializeXml,
  setText,
  type XDocument,
  type XElement,
} from "./xml";

export type ChartData = {
  categories: string[];
  series: Array<{ name?: string; values: number[] }>;
};

function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetOfFormula(f: string | null | undefined): string {
  const m = /^(.*)!/.exec(f ?? "");
  return m ? m[1]! : "Planilha1";
}

function colOfFormula(f: string | null | undefined, fallback: string): string {
  const m = /!\$?([A-Z]+)\$?\d+/.exec(f ?? "");
  return m ? m[1]! : fallback;
}

function el(doc: XDocument, local: string, attrs: Record<string, string> = {}, text?: string): XElement {
  const e = createEl(doc, NS.c, local, "c");
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) setText(e, text);
  return e;
}

function strCacheOrLit(doc: XDocument, local: "strCache" | "strLit", values: string[]): XElement {
  const node = el(doc, local);
  node.appendChild(el(doc, "ptCount", { val: String(values.length) }));
  values.forEach((v, i) => {
    const pt = el(doc, "pt", { idx: String(i) });
    pt.appendChild(el(doc, "v", {}, v));
    node.appendChild(pt);
  });
  return node;
}

function numCacheOrLit(doc: XDocument, local: "numCache" | "numLit", values: number[], formatCode: string): XElement {
  const node = el(doc, local);
  node.appendChild(el(doc, "formatCode", {}, formatCode));
  node.appendChild(el(doc, "ptCount", { val: String(values.length) }));
  values.forEach((v, i) => {
    const pt = el(doc, "pt", { idx: String(i) });
    pt.appendChild(el(doc, "v", {}, String(Number.isFinite(v) ? v : 0)));
    node.appendChild(pt);
  });
  return node;
}

/** Troca o conteúdo de c:cat / c:val mantendo ref (se havia) ou literal. */
function rewriteAxisData(
  doc: XDocument,
  holder: XElement,
  kind: "str" | "num",
  values: string[] | number[],
  col: string,
  sheet: string,
  hasWorkbook: boolean,
): void {
  const oldF = firstDesc(holder, NS.c, "f")?.textContent;
  const oldFormat = firstDesc(holder, NS.c, "formatCode")?.textContent ?? "General";
  const wasRef = !!(kid(holder, NS.c, "strRef") || kid(holder, NS.c, "numRef") || kid(holder, NS.c, "multiLvlStrRef"));
  while (holder.firstChild) holder.removeChild(holder.firstChild);
  const n = values.length;
  if (wasRef && hasWorkbook) {
    const ref = el(doc, kind === "str" ? "strRef" : "numRef");
    const c = colOfFormula(oldF, col);
    ref.appendChild(el(doc, "f", {}, `${sheetOfFormula(oldF ?? `${sheet}!`)}!$${c}$2:$${c}$${n + 1}`));
    ref.appendChild(
      kind === "str"
        ? strCacheOrLit(doc, "strCache", values as string[])
        : numCacheOrLit(doc, "numCache", values as number[], oldFormat),
    );
    holder.appendChild(ref);
  } else {
    holder.appendChild(
      kind === "str"
        ? strCacheOrLit(doc, "strLit", values as string[])
        : numCacheOrLit(doc, "numLit", values as number[], oldFormat),
    );
  }
}

function setStaticLabel(dLbl: XElement, v: number): void {
  const ts = desc(dLbl, NS.a, "t");
  if (ts[0]) setText(ts[0], Number.isInteger(v) ? String(v) : v.toLocaleString("pt-BR"));
  ts.slice(1).forEach((t) => setText(t, ""));
}

/** Rosca/pizza: rótulo de percentual some quando a fatia é zero. */
function hideZeroPercentLabels(doc: XDocument): void {
  const charts = [...desc(doc, NS.c, "doughnutChart"), ...desc(doc, NS.c, "pieChart")];
  for (const chart of charts) {
    for (const dLbls of desc(chart, NS.c, "dLbls")) {
      if (kid(dLbls, NS.c, "delete")) continue;
      let numFmt = kid(dLbls, NS.c, "numFmt");
      if (!numFmt) {
        numFmt = el(doc, "numFmt");
        const firstNonLbl = kids(dLbls, NS.c, "dLbl").length ? null : dLbls.firstChild;
        dLbls.insertBefore(numFmt, firstNonLbl);
      }
      numFmt.setAttribute("formatCode", "0%;;;");
      numFmt.setAttribute("sourceLinked", "0");
    }
  }
}

function updateChartXml(doc: XDocument, data: ChartData, hasWorkbook: boolean): void {
  const n = data.categories.length;
  const series = desc(doc, NS.c, "ser");
  series.forEach((ser, i) => {
    const s = data.series[Math.min(i, data.series.length - 1)];
    if (!s) return;
    const values = data.categories.map((_, k) => s.values[k] ?? 0);

    const tx = kid(ser, NS.c, "tx");
    if (tx && s.name != null) {
      const v = firstDesc(tx, NS.c, "v");
      if (v) setText(v, s.name);
    }
    const cat = kid(ser, NS.c, "cat");
    if (cat) {
      const f = firstDesc(cat, NS.c, "f")?.textContent;
      rewriteAxisData(doc, cat, "str", data.categories, colOfFormula(f, "A"), sheetOfFormula(f), hasWorkbook);
    }
    const val = kid(ser, NS.c, "val");
    if (val) {
      const f = firstDesc(val, NS.c, "f")?.textContent;
      rewriteAxisData(doc, val, "num", values, colOfFormula(f, colLetter(i + 1)), sheetOfFormula(f), hasWorkbook);
    }
    // Cores por ponto: mantém só as que ainda existem.
    for (const dPt of kids(ser, NS.c, "dPt")) {
      const idx = Number(kid(dPt, NS.c, "idx")?.getAttribute("val") ?? "0");
      if (idx >= n) remove(dPt);
    }
    // Rótulos ajustados à mão por ponto (posição/texto fixo do exemplo) saem.
    // Rótulos ajustados à mão por ponto: some o que passou do fim, texto fixo vira o valor
    // novo e a posição manual (feita para os dados do exemplo) volta ao padrão.
    const dLbls = kid(ser, NS.c, "dLbls");
    if (dLbls) {
      for (const d of kids(dLbls, NS.c, "dLbl")) {
        const idx = Number(kid(d, NS.c, "idx")?.getAttribute("val") ?? "0");
        if (idx >= n) {
          remove(d);
          continue;
        }
        const layout = kid(d, NS.c, "layout");
        if (layout) remove(layout);
        const rich = firstDesc(d, NS.c, "rich");
        if (rich && !firstDesc(rich, NS.a, "fld")) setStaticLabel(d, values[idx] ?? 0);
      }
      // Rótulo fixo em todos os pontos do exemplo: os pontos novos ganham o mesmo rótulo.
      const pts = kids(dLbls, NS.c, "dLbl");
      const last = pts[pts.length - 1];
      const allStatic = pts.length > 0 && pts.every((d) => {
        const rich = firstDesc(d, NS.c, "rich");
        return !!rich && !firstDesc(rich, NS.a, "fld");
      });
      if (last && allStatic) {
        const have = new Set(pts.map((d) => Number(kid(d, NS.c, "idx")?.getAttribute("val") ?? "-1")));
        let anchor = last;
        for (let i = 0; i < n; i++) {
          if (have.has(i)) continue;
          const clone = last.cloneNode(true) as XElement;
          kid(clone, NS.c, "idx")?.setAttribute("val", String(i));
          const ext = kid(clone, NS.c, "extLst");
          if (ext) remove(ext);
          setStaticLabel(clone, values[i] ?? 0);
          dLbls.insertBefore(clone, anchor.nextSibling);
          anchor = clone;
        }
      }
    }
  });
  hideZeroPercentLabels(doc);
}

// ─── planilha embutida ────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function updateEmbeddedWorkbook(bytes: Uint8Array, data: ChartData): Uint8Array {
  const zip = new PizZip(bytes);
  const wbRels = parseXml(zip.file("xl/_rels/workbook.xml.rels")?.asText() ?? "");
  const wb = parseXml(zip.file("xl/workbook.xml")?.asText() ?? "");
  const firstSheet = firstDesc(wb, NS.s, "sheet");
  const rid = firstSheet?.getAttributeNS(NS.r, "id");
  const rel = desc(wbRels, NS.pr, "Relationship").find((r) => r.getAttribute("Id") === rid);
  if (!rel) return bytes;
  const sheetPath = `xl/${(rel.getAttribute("Target") ?? "").replace(/^\/?xl\//, "")}`;
  const sheet = parseXml(zip.file(sheetPath)?.asText() ?? "");

  // Cabeçalho: nomes das colunas da tabela do Excel (precisam bater, senão o Excel repara).
  const sheetRelsPath = sheetPath.replace(/([^/]+)$/, "_rels/$1.rels");
  let tablePath: string | null = null;
  let headers: string[] = ["", ...data.series.map((s, i) => s.name ?? `Série ${i + 1}`)];
  const sheetRels = zip.file(sheetRelsPath)?.asText();
  if (sheetRels) {
    const relDoc = parseXml(sheetRels);
    const tRel = desc(relDoc, NS.pr, "Relationship").find((r) => /\/table$/.test(r.getAttribute("Type") ?? ""));
    if (tRel) {
      tablePath = `xl/${(tRel.getAttribute("Target") ?? "").replace(/^\.\.\//, "")}`;
      const tDoc = parseXml(zip.file(tablePath)?.asText() ?? "");
      const cols = desc(tDoc, NS.s, "tableColumn").map((c) => c.getAttribute("name") ?? "");
      if (cols.length) headers = cols;
    }
  }
  const nCols = Math.max(headers.length, data.series.length + 1);
  const lastCol = colLetter(nCols - 1);
  const lastRow = data.categories.length + 1;

  const cell = (ref: string, v: string | number) =>
    typeof v === "number"
      ? `<c r="${ref}"><v>${Number.isFinite(v) ? v : 0}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`;
  let rowsXml = `<row r="1">${headers.map((h, i) => cell(`${colLetter(i)}1`, h)).join("")}</row>`;
  data.categories.forEach((cat, k) => {
    const r = k + 2;
    const cells = [cell(`A${r}`, cat), ...data.series.map((s, i) => cell(`${colLetter(i + 1)}${r}`, s.values[k] ?? 0))];
    rowsXml += `<row r="${r}">${cells.join("")}</row>`;
  });
  const sheetData = firstDesc(sheet, NS.s, "sheetData");
  if (!sheetData) return bytes;
  const fresh = parseXml(`<sheetData xmlns="${NS.s}">${rowsXml}</sheetData>`).documentElement!;
  sheetData.parentNode!.replaceChild(sheet.importNode(fresh, true), sheetData);
  const dim = firstDesc(sheet, NS.s, "dimension");
  if (dim) dim.setAttribute("ref", `A1:${lastCol}${lastRow}`);
  zip.file(sheetPath, serializeXml(sheet));

  if (tablePath) {
    const tDoc = parseXml(zip.file(tablePath)!.asText());
    const t = tDoc.documentElement!;
    t.setAttribute("ref", `A1:${lastCol}${lastRow}`);
    const af = firstDesc(tDoc, NS.s, "autoFilter");
    if (af) af.setAttribute("ref", `A1:${lastCol}${lastRow}`);
    const sort = firstDesc(tDoc, NS.s, "sortState");
    if (sort) remove(sort);
    zip.file(tablePath, serializeXml(tDoc));
  }
  // Fórmulas foram trocadas por valores: a cadeia de cálculo antiga faria o Excel reparar.
  if (zip.file("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
    const ct = parseXml(zip.file("[Content_Types].xml")!.asText());
    for (const o of desc(ct, "http://schemas.openxmlformats.org/package/2006/content-types", "Override")) {
      if (o.getAttribute("PartName") === "/xl/calcChain.xml") remove(o);
    }
    zip.file("[Content_Types].xml", serializeXml(ct));
    for (const r of desc(wbRels, NS.pr, "Relationship")) {
      if (/calcChain$/.test(r.getAttribute("Type") ?? "")) remove(r);
    }
    zip.file("xl/_rels/workbook.xml.rels", serializeXml(wbRels));
  }
  return zip.generate({ type: "uint8array", compression: "DEFLATE" }) as Uint8Array;
}

/** Atualiza o gráfico do graphicFrame `frameName` no slide. */
export function updateChart(pkg: PptxPackage, slidePath: string, frameName: string, data: ChartData): boolean {
  const slide = pkg.xml(slidePath);
  const frame = findShape(slide, frameName);
  if (!frame) return false;
  const chartRef = firstDesc(frame, NS.c, "chart");
  const rid = chartRef?.getAttributeNS(NS.r, "id");
  const rel = rid ? pkg.rel(slidePath, rid) : null;
  if (!rel || rel.type !== REL.chart) return false;
  const chartPath = rel.path;
  const chartDoc = pkg.xml(chartPath);

  const ext = firstDesc(chartDoc, NS.c, "externalData");
  const extRid = ext?.getAttributeNS(NS.r, "id");
  const wbRel = extRid ? pkg.rel(chartPath, extRid) : null;
  const hasWorkbook = !!wbRel && !wbRel.external && wbRel.type === REL.package && pkg.has(wbRel.path);

  updateChartXml(chartDoc, data, hasWorkbook);
  if (hasWorkbook && wbRel) {
    try {
      pkg.writeBytes(wbRel.path, updateEmbeddedWorkbook(pkg.bytes(wbRel.path), data));
    } catch {
      // Planilha embutida ilegível: o slide continua certo pelo cache.
    }
  }
  return true;
}
