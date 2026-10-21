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
