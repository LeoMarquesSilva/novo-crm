import { NS, desc, intAttr, kid, remove, type XDocument, type XElement } from "./xml";

export const EMU_PER_INCH = 914400;
export const inch = (n: number) => Math.round(n * EMU_PER_INCH);

export type Box = { x: number; y: number; w: number; h: number };

/** Shape (p:sp, p:pic, p:graphicFrame, p:grpSp, p:cxnSp) dono do cNvPr. */
function shapeOfCNvPr(cnv: XElement): XElement | null {
  const nv = cnv.parentNode as XElement | null;
  return (nv?.parentNode as XElement | null) ?? null;
}

export function shapeName(shape: XElement): string {
  for (const c of desc(shape, NS.p, "cNvPr")) {
    if (shapeOfCNvPr(c) === shape) return c.getAttribute("name") ?? "";
  }
  return "";
}

export function findShapes(doc: XDocument, predicate: (name: string) => boolean): XElement[] {
  const out: XElement[] = [];
  for (const c of desc(doc, NS.p, "cNvPr")) {
    const name = c.getAttribute("name") ?? "";
    if (!predicate(name)) continue;
    const s = shapeOfCNvPr(c);
    if (s && s.localName !== "cSld") out.push(s);
  }
  return out;
}

export function findShape(doc: XDocument, name: string): XElement | null {
  return findShapes(doc, (n) => n === name)[0] ?? null;
}

export function findByPrefix(doc: XDocument, prefix: string): XElement[] {
  return findShapes(doc, (n) => n.startsWith(prefix));
}

function xfrmOf(shape: XElement): XElement | null {
  switch (shape.localName) {
    case "graphicFrame":
      return kid(shape, NS.p, "xfrm");
    case "grpSp": {
      const pr = kid(shape, NS.p, "grpSpPr");
      return pr ? kid(pr, NS.a, "xfrm") : null;
    }
    default: {
      const pr = kid(shape, NS.p, "spPr");
      return pr ? kid(pr, NS.a, "xfrm") : null;
    }
  }
}

export function box(shape: XElement): Box {
  const x = xfrmOf(shape);
  const off = x ? kid(x, NS.a, "off") : null;
  const ext = x ? kid(x, NS.a, "ext") : null;
  return { x: intAttr(off, "x"), y: intAttr(off, "y"), w: intAttr(ext, "cx"), h: intAttr(ext, "cy") };
}

/** Caixa em coordenadas do slide, compondo os grupos acima do shape. */
export function absBox(shape: XElement): Box {
  let b = box(shape);
  let parent = shape.parentNode as XElement | null;
  while (parent && parent.localName === "grpSp") {
    const x = xfrmOf(parent);
    if (!x) break;
    const off = kid(x, NS.a, "off");
    const ext = kid(x, NS.a, "ext");
    const chOff = kid(x, NS.a, "chOff");
    const chExt = kid(x, NS.a, "chExt");
    const sx = intAttr(chExt, "cx", 1) ? intAttr(ext, "cx") / intAttr(chExt, "cx", 1) : 1;
    const sy = intAttr(chExt, "cy", 1) ? intAttr(ext, "cy") / intAttr(chExt, "cy", 1) : 1;
    b = {
      x: intAttr(off, "x") + (b.x - intAttr(chOff, "x")) * sx,
      y: intAttr(off, "y") + (b.y - intAttr(chOff, "y")) * sy,
      w: b.w * sx,
      h: b.h * sy,
    };
    parent = parent.parentNode as XElement | null;
  }
  return b;
}

export function setPos(shape: XElement, x?: number, y?: number): void {
  const off = xfrmOf(shape) ? kid(xfrmOf(shape)!, NS.a, "off") : null;
  if (!off) return;
  if (x != null) off.setAttribute("x", String(Math.round(x)));
  if (y != null) off.setAttribute("y", String(Math.round(y)));
}

export function setSize(shape: XElement, w?: number, h?: number): void {
  const ext = xfrmOf(shape) ? kid(xfrmOf(shape)!, NS.a, "ext") : null;
  if (!ext) return;
  if (w != null) ext.setAttribute("cx", String(Math.max(0, Math.round(w))));
  if (h != null) ext.setAttribute("cy", String(Math.max(0, Math.round(h))));
}

export function moveBy(shape: XElement, dx: number, dy: number): void {
  const b = box(shape);
  setPos(shape, b.x + dx, b.y + dy);
}

export function removeShape(shape: XElement): void {
  remove(shape);
}

export function union(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
