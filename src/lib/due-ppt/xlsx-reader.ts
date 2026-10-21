/**
 * Leitor mínimo de .xlsx (valores das células, sem fórmulas/estilos), sem
 * dependência extra: o arquivo é um zip de XML.
 */
import PizZip from "pizzip";
import { NS, desc, firstDesc, kid, kids, parseXml } from "./pptx/xml";

export type CellValue = string | number | null;
export type SheetData = { name: string; rows: CellValue[][] };

function colIndex(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]!) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Formatos de data embutidos do Excel (14–22, 45–47) e os personalizados com d/m/y. */
function dateStyles(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const doc = parseXml(stylesXml);
  const custom = new Map<number, string>();
  for (const f of desc(doc, NS.s, "numFmt")) {
    custom.set(Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? "");
  }
  const cellXfs = firstDesc(doc, NS.s, "cellXfs");
  if (!cellXfs) return out;
  kids(cellXfs, NS.s, "xf").forEach((xf, i) => {
    const id = Number(xf.getAttribute("numFmtId") ?? "0");
    const code = custom.get(id) ?? "";
    const isDate =
      (id >= 14 && id <= 22) ||
      (id >= 45 && id <= 47) ||
      (code !== "" && /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, "")) && !/0\.0/.test(code));
    if (isDate) out.add(i);
  });
  return out;
}

/** Número de série do Excel → "dd/mm/aaaa". */
export function excelSerialToBr(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function readXlsx(data: ArrayBuffer | Uint8Array): SheetData[] {
  const zip = new PizZip(data);
  const wbXml = zip.file("xl/workbook.xml")?.asText();
  if (!wbXml) throw new Error("Arquivo não é uma planilha .xlsx válida.");
  const wb = parseXml(wbXml);
  const rels = parseXml(zip.file("xl/_rels/workbook.xml.rels")?.asText() ?? "<Relationships/>");
  const relTarget = new Map<string, string>();
  for (const r of desc(rels, NS.pr, "Relationship")) {
    relTarget.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");
  }

  const shared: string[] = [];
  const ssXml = zip.file("xl/sharedStrings.xml")?.asText();
  if (ssXml) {
    const ss = parseXml(ssXml);
    for (const si of desc(ss, NS.s, "si")) {
      shared.push(desc(si, NS.s, "t").map((t) => t.textContent ?? "").join(""));
    }
  }
  const dates = dateStyles(zip.file("xl/styles.xml")?.asText());

  const out: SheetData[] = [];
  for (const sheet of desc(wb, NS.s, "sheet")) {
    if (sheet.getAttribute("state") === "hidden" || sheet.getAttribute("state") === "veryHidden") continue;
    const rid = sheet.getAttributeNS(NS.r, "id") ?? "";
    const target = relTarget.get(rid);
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = zip.file(path)?.asText();
    if (!xml) continue;
    const doc = parseXml(xml);
    const rows: CellValue[][] = [];
    const sheetData = firstDesc(doc, NS.s, "sheetData");
    for (const row of sheetData ? kids(sheetData, NS.s, "row") : []) {
      const r = Number(row.getAttribute("r") ?? rows.length + 1) - 1;
      const cells: CellValue[] = [];
      for (const c of kids(row, NS.s, "c")) {
        const ref = c.getAttribute("r") ?? "";
        const idx = ref ? colIndex(ref) : cells.length;
        const t = c.getAttribute("t");
        const s = Number(c.getAttribute("s") ?? "-1");
        const v = kid(c, NS.s, "v")?.textContent ?? null;
        let value: CellValue = null;
        if (t === "s") value = v != null ? (shared[Number(v)] ?? "") : null;
        else if (t === "inlineStr") value = desc(c, NS.s, "t").map((x) => x.textContent ?? "").join("");
        else if (t === "str" || t === "e") value = v;
        else if (t === "b") value = v === "1" ? "Sim" : "Não";
        else if (v != null && v !== "") {
          const n = Number(v);
          value = Number.isFinite(n) ? (dates.has(s) ? excelSerialToBr(n) : n) : v;
        }
        // Planilhas exportadas às vezes declaram milhares de colunas vazias.
        if (idx > 200) continue;
        cells[idx] = value;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
      rows[r] = cells;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    out.push({ name: sheet.getAttribute("name") ?? `Planilha ${out.length + 1}`, rows });
  }
  return out;
}
