/**
 * XML do pacote Office. Usamos @xmldom/xmldom no navegador e nos testes para a
 * serialização sair igual nos dois lados (o XMLSerializer nativo de cada
 * navegador varia em detalhes de namespace).
 */
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";

export type XDocument = Document;
export type XElement = Element;
export type XNode = Node;

export const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  pr: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  s: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  a16: "http://schemas.microsoft.com/office/drawing/2014/main",
} as const;

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export function parseXml(text: string): XDocument {
  return new DOMParser().parseFromString(text, "text/xml");
}

export function serializeXml(doc: XDocument): string {
  let out = new XMLSerializer().serializeToString(doc);
  if (!out.startsWith("<?xml")) out = `${XML_DECL}\r\n${out}`;
  return out;
}

export function isElement(n: XNode | null | undefined): n is XElement {
  return !!n && n.nodeType === 1;
}

/** Filhos diretos com namespace/nome locais. */
export function kids(el: XElement, ns: string, local: string): XElement[] {
  const out: XElement[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (isElement(n) && n.namespaceURI === ns && n.localName === local) out.push(n);
  }
  return out;
}

export function kid(el: XElement, ns: string, local: string): XElement | null {
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (isElement(n) && n.namespaceURI === ns && n.localName === local) return n;
  }
  return null;
}

export function allKids(el: XElement): XElement[] {
  const out: XElement[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (isElement(n)) out.push(n);
  return out;
}

/** Descendentes (em ordem de documento). */
export function desc(el: XElement | XDocument, ns: string, local: string): XElement[] {
  return Array.from(el.getElementsByTagNameNS(ns, local)) as XElement[];
}

export function firstDesc(el: XElement | XDocument, ns: string, local: string): XElement | null {
  const list = el.getElementsByTagNameNS(ns, local);
  return list.length > 0 ? (list.item(0) as XElement) : null;
}

export function remove(el: XNode): void {
  el.parentNode?.removeChild(el);
}

export function insertAfter(newEl: XNode, ref: XNode): void {
  const parent = ref.parentNode;
  if (!parent) return;
  if (ref.nextSibling) parent.insertBefore(newEl, ref.nextSibling);
  else parent.appendChild(newEl);
}

/** Cria elemento com o mesmo prefixo usado no documento para aquele namespace. */
export function createEl(doc: XDocument, ns: string, local: string, prefix: string): XElement {
  return doc.createElementNS(ns, `${prefix}:${local}`);
}

export function textOf(el: XElement): string {
  return el.textContent ?? "";
}

export function setText(el: XElement, text: string): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(el.ownerDocument!.createTextNode(text));
}

export function intAttr(el: XElement | null, name: string, fallback = 0): number {
  if (!el) return fallback;
  const v = el.getAttribute(name);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
