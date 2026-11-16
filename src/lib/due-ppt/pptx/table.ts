import { findShape } from "./shapes";
import { fillTokens, plainText, type TokenValues } from "./text";
import { NS, desc, firstDesc, insertAfter, kids, remove, type XDocument, type XElement } from "./xml";

export type TableRows = Array<Record<string, string>>;

function uniqueIds(tr: XElement): void {
  for (const el of desc(tr, NS.a16, "rowId")) {
    el.setAttribute("val", String(100000000 + Math.floor(Math.random() * 4000000000)));
  }
}

/**
 * Preenche a tabela `name`: as linhas com `{{row.*}}` são o molde; cada item vira
 * uma cópia (alternando os moldes, se houver mais de um). Cabeçalho e linhas de
 * total ficam onde estão. Devolve false se a tabela não existe.
 */
export function fillTable(doc: XDocument, name: string, rows: TableRows, missing: Set<string>): boolean {
  const frame = findShape(doc, name);
  if (!frame) return false;
  const tbl = firstDesc(frame, NS.a, "tbl");
  if (!tbl) return false;
  const trs = kids(tbl, NS.a, "tr");
  const templates = trs.filter((tr) => plainText(tr).includes("{{row."));
  if (!templates.length) return true;

  let anchor: XElement = templates[0]!;
  const created: XElement[] = [];
  rows.forEach((row, i) => {
    const tr = templates[i % templates.length]!.cloneNode(true) as XElement;
    const values: TokenValues = {};
    for (const [k, v] of Object.entries(row)) values[`row.${k}`] = v;
    fillTokens(tr, values, missing);
    uniqueIds(tr);
    if (created.length === 0) tbl.insertBefore(tr, anchor);
    else insertAfter(tr, anchor);
    anchor = tr;
    created.push(tr);
  });
  for (const t of templates) remove(t);
  return true;
}

/**
 * Mantém só as colunas `keep` (índices a partir de 0) da tabela `name`; a largura das que
 * saem é repartida entre as que ficam, na proporção de cada uma. Devolve false se não achar.
 */
export function keepColumns(doc: XDocument, name: string, keep: number[]): boolean {
  const frame = findShape(doc, name);
  const tbl = frame ? firstDesc(frame, NS.a, "tbl") : null;
  const grid = tbl ? firstDesc(tbl, NS.a, "tblGrid") : null;
  if (!tbl || !grid) return false;
  const cols = kids(grid, NS.a, "gridCol");
  const larguras = cols.map((c) => Number(c.getAttribute("w")) || 0);
  const total = larguras.reduce((s, w) => s + w, 0);
  const ficam = larguras.filter((_, i) => keep.includes(i)).reduce((s, w) => s + w, 0);
  if (!ficam) return false;
  cols.forEach((c, i) => {
    if (keep.includes(i)) c.setAttribute("w", String(Math.round((larguras[i]! * total) / ficam)));
    else remove(c);
  });
  for (const tr of kids(tbl, NS.a, "tr")) {
    kids(tr, NS.a, "tc").forEach((tc, i) => {
      if (!keep.includes(i)) remove(tc);
    });
  }
  return true;
}

/** Altura mínima (EMU) das linhas da tabela, menos o cabeçalho; texto maior ainda cresce a linha. */
export function setBodyRowHeight(doc: XDocument, name: string, emu: number): boolean {
  const frame = findShape(doc, name);
  const tbl = frame ? firstDesc(frame, NS.a, "tbl") : null;
  if (!tbl) return false;
  kids(tbl, NS.a, "tr").slice(1).forEach((tr) => tr.setAttribute("h", String(Math.round(emu))));
  return true;
}

/**
 * Tira as colunas cujo cabeçalho (1ª linha) contém `texto` — ex.: o campo de uma coluna que a
 * área não usa. Modelo sem essa coluna fica como está. Devolve false se a tabela não existe.
 */
export function dropColumnsByHeader(doc: XDocument, name: string, texto: string): boolean {
  const frame = findShape(doc, name);
  const tbl = frame ? firstDesc(frame, NS.a, "tbl") : null;
  const head = tbl ? kids(tbl, NS.a, "tr")[0] : null;
  if (!tbl || !head) return false;
  const cells = kids(head, NS.a, "tc");
  const sai = cells.map((tc, i) => (plainText(tc).includes(texto) ? i : -1)).filter((i) => i >= 0);
  if (!sai.length) return true;
  return keepColumns(doc, name, cells.map((_, i) => i).filter((i) => !sai.includes(i)));
}
