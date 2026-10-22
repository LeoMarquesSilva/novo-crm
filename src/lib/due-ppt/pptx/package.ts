import PizZip from "pizzip";
import {
  NS,
  allKids,
  desc,
  firstDesc,
  isElement,
  kid,
  kids,
  parseXml,
  remove,
  serializeXml,
  type XDocument,
  type XElement,
} from "./xml";

export const REL = {
  slide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
  slideLayout: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
  notesSlide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide",
  image: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
  chart: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart",
  hyperlink: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
  package: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package",
} as const;

const CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const P14_SECTION_EXT = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";

/** Tipos de relação que somem quando o XML do slide não usa mais o rId. */
const PRUNABLE_REL_TYPES = new Set<string>([REL.slide, REL.image, REL.chart, REL.hyperlink]);

export type Rel = { id: string; type: string; target: string; external: boolean; path: string };

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function baseOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export function relsPathOf(partPath: string): string {
  return `${dirOf(partPath) ? `${dirOf(partPath)}/` : ""}_rels/${baseOf(partPath)}.rels`;
}

export function resolvePath(fromPart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (dirOf(fromPart) ? dirOf(fromPart).split("/") : []).concat(target.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

export function relativeTarget(fromPart: string, toPath: string): string {
  const from = dirOf(fromPart).split("/").filter(Boolean);
  const to = toPath.split("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...from.slice(i).map(() => ".."), ...to.slice(i)].join("/");
}

export class PptxPackage {
  readonly zip: PizZip;
  private readonly docs = new Map<string, XDocument>();

  constructor(data: ArrayBuffer | Uint8Array) {
    this.zip = new PizZip(data);
  }

  has(path: string): boolean {
    return this.docs.has(path) || this.zip.file(path) != null;
  }

  text(path: string): string {
    const f = this.zip.file(path);
    if (!f) throw new Error(`Parte não encontrada no PPT: ${path}`);
    return f.asText();
  }

  bytes(path: string): Uint8Array {
    const f = this.zip.file(path);
    if (!f) throw new Error(`Parte não encontrada no PPT: ${path}`);
    return f.asUint8Array();
  }

  xml(path: string): XDocument {
    let doc = this.docs.get(path);
    if (!doc) {
      doc = parseXml(this.text(path));
      this.docs.set(path, doc);
    }
    return doc;
  }

  setXml(path: string, doc: XDocument): void {
    this.docs.set(path, doc);
  }

  writeBytes(path: string, data: Uint8Array): void {
    this.docs.delete(path);
    this.zip.file(path, data);
  }

  deletePart(path: string): void {
    this.docs.delete(path);
    this.zip.remove(path);
  }

  files(): string[] {
    const out = new Set<string>(Object.keys(this.zip.files).filter((p) => !this.zip.files[p]!.dir));
    for (const p of this.docs.keys()) out.add(p);
    return [...out];
  }

  // ─── relações ───────────────────────────────────────────────────────────────

  private relsDoc(partPath: string, create = false): XDocument | null {
    const rp = relsPathOf(partPath);
    if (this.has(rp)) return this.xml(rp);
    if (!create) return null;
    const doc = parseXml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.pr}"></Relationships>`,
    );
    this.setXml(rp, doc);
    return doc;
  }

  rels(partPath: string): Rel[] {
    const doc = this.relsDoc(partPath);
    if (!doc) return [];
    return desc(doc, NS.pr, "Relationship").map((el) => {
      const external = el.getAttribute("TargetMode") === "External";
      const target = el.getAttribute("Target") ?? "";
      return {
        id: el.getAttribute("Id") ?? "",
        type: el.getAttribute("Type") ?? "",
        target,
        external,
        path: external ? target : resolvePath(partPath, target),
      };
    });
  }

  rel(partPath: string, id: string): Rel | null {
    return this.rels(partPath).find((r) => r.id === id) ?? null;
  }

  addRel(partPath: string, type: string, toPath: string): string {
    const doc = this.relsDoc(partPath, true)!;
    const used = new Set(desc(doc, NS.pr, "Relationship").map((e) => e.getAttribute("Id")));
    let n = used.size + 1;
    while (used.has(`rId${n}`)) n++;
    const id = `rId${n}`;
    const el = doc.createElementNS(NS.pr, "Relationship");
    el.setAttribute("Id", id);
    el.setAttribute("Type", type);
    el.setAttribute("Target", relativeTarget(partPath, toPath));
    doc.documentElement!.appendChild(el);
    return id;
  }

  removeRel(partPath: string, id: string): void {
    const doc = this.relsDoc(partPath);
    if (!doc) return;
    for (const el of desc(doc, NS.pr, "Relationship")) {
      if (el.getAttribute("Id") === id) remove(el);
    }
  }

  /** Tira relações de imagem/link/slide/gráfico que o XML do slide não usa mais. */
  pruneUnreferencedRels(partPath: string): void {
    const used = new Set<string>();
    const walk = (el: XElement) => {
      for (let i = 0; i < el.attributes.length; i++) {
        const a = el.attributes.item(i)!;
        if (a.namespaceURI === NS.r) used.add(a.value);
      }
      for (const c of allKids(el)) walk(c);
    };
    walk(this.xml(partPath).documentElement!);
    for (const r of this.rels(partPath)) {
      if (PRUNABLE_REL_TYPES.has(r.type) && !used.has(r.id)) this.removeRel(partPath, r.id);
    }
  }

  // ─── content types ──────────────────────────────────────────────────────────

  private ctDoc(): XDocument {
    return this.xml("[Content_Types].xml");
  }

  addOverride(partPath: string, contentType: string): void {
    const doc = this.ctDoc();
    const partName = `/${partPath}`;
    if (desc(doc, NS.ct, "Override").some((e) => e.getAttribute("PartName") === partName)) return;
    const el = doc.createElementNS(NS.ct, "Override");
    el.setAttribute("PartName", partName);
    el.setAttribute("ContentType", contentType);
    doc.documentElement!.appendChild(el);
  }

  ensureDefault(extension: string, contentType: string): void {
    const doc = this.ctDoc();
    const ext = extension.toLowerCase();
    if (desc(doc, NS.ct, "Default").some((e) => (e.getAttribute("Extension") ?? "").toLowerCase() === ext)) {
      return;
    }
    const el = doc.createElementNS(NS.ct, "Default");
    el.setAttribute("Extension", ext);
    el.setAttribute("ContentType", contentType);
    const first = firstDesc(doc, NS.ct, "Override");
    if (first) doc.documentElement!.insertBefore(el, first);
    else doc.documentElement!.appendChild(el);
  }

  // ─── slides ─────────────────────────────────────────────────────────────────

  private presentation(): XDocument {
    return this.xml("ppt/presentation.xml");
  }

  /** Slides na ordem da apresentação. */
  slidePaths(): string[] {
    const lst = firstDesc(this.presentation(), NS.p, "sldIdLst");
    if (!lst) return [];
    return kids(lst, NS.p, "sldId").map((el) => {
      const rid = el.getAttributeNS(NS.r, "id") ?? "";
      const rel = this.rel("ppt/presentation.xml", rid);
      if (!rel) throw new Error(`sldId sem relação: ${rid}`);
      return rel.path;
    });
  }

  /** Clona um slide (sem notas). Gráficos não são clonados — o slide de origem não pode ter gráfico. */
  cloneSlide(srcPath: string): string {
    const existing = this.files()
      .map((p) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(p))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => Number(m[1]));
    const n = Math.max(0, ...existing) + 1;
    const newPath = `ppt/slides/slide${n}.xml`;
    this.setXml(newPath, parseXml(serializeXml(this.xml(srcPath))));

    const srcRels = this.rels(srcPath);
    if (srcRels.some((r) => r.type === REL.chart)) {
      throw new Error(`Slide com gráfico não pode ser repetido: ${srcPath}`);
    }
    const relsDoc = parseXml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.pr}"></Relationships>`,
    );
    for (const r of srcRels) {
      if (r.type === REL.notesSlide) continue;
      const el = relsDoc.createElementNS(NS.pr, "Relationship");
      el.setAttribute("Id", r.id);
      el.setAttribute("Type", r.type);
      el.setAttribute("Target", r.target);
      if (r.external) el.setAttribute("TargetMode", "External");
      relsDoc.documentElement!.appendChild(el);
    }
    this.setXml(relsPathOf(newPath), relsDoc);
    this.addOverride(newPath, CT_SLIDE);

    const rid = this.addRel("ppt/presentation.xml", REL.slide, newPath);
    const pres = this.presentation();
    const lst = firstDesc(pres, NS.p, "sldIdLst")!;
    const ids = kids(lst, NS.p, "sldId").map((e) => Number(e.getAttribute("id")));
    const sldId = pres.createElementNS(NS.p, lst.prefix ? `${lst.prefix}:sldId` : "sldId");
    sldId.setAttribute("id", String(Math.max(255, ...ids) + 1));
    sldId.setAttributeNS(NS.r, "r:id", rid);
    lst.appendChild(sldId);
    return newPath;
  }

  /** Deixa só os slides informados, nessa ordem; os demais saem da apresentação. */
  setSlideOrder(paths: string[]): void {
    const pres = this.presentation();
    const lst = firstDesc(pres, NS.p, "sldIdLst")!;
    const byPath = new Map<string, XElement>();
    for (const el of kids(lst, NS.p, "sldId")) {
      const rid = el.getAttributeNS(NS.r, "id") ?? "";
      const rel = this.rel("ppt/presentation.xml", rid);
      if (rel) byPath.set(rel.path, el);
      remove(el);
    }
    const keep = new Set(paths);
    for (const p of paths) {
      const el = byPath.get(p);
      if (el) lst.appendChild(el);
    }
    for (const [p, el] of byPath) {
      if (!keep.has(p)) this.removeRel("ppt/presentation.xml", el.getAttributeNS(NS.r, "id") ?? "");
    }
    // Seções guardam ids de slide; com slides removidos/clonados o PowerPoint pediria reparo.
    const extLst = kid(pres.documentElement!, NS.p, "extLst");
    if (extLst) {
      for (const ext of kids(extLst, NS.p, "ext")) {
        if (ext.getAttribute("uri") === P14_SECTION_EXT) remove(ext);
      }
    }
  }

  /** Remove tudo que não é alcançável a partir de _rels/.rels. */
  collectGarbage(): string[] {
    const reachable = new Set<string>();
    const queue: string[] = [];
    for (const r of this.rels("")) {
      if (!r.external) queue.push(r.path);
    }
    // rels do pacote: _rels/.rels → resolvePath("", target)
    while (queue.length) {
      const p = queue.shift()!;
      if (reachable.has(p) || !this.has(p)) continue;
      reachable.add(p);
      for (const r of this.rels(p)) if (!r.external) queue.push(r.path);
    }
    const removed: string[] = [];
    for (const f of this.files()) {
      if (f === "[Content_Types].xml" || f === "_rels/.rels") continue;
      if (/(^|\/)_rels\/[^/]+\.rels$/.test(f)) {
        const owner = f.replace(/(^|\/)_rels\/([^/]+)\.rels$/, (_m, pre: string, name: string) => `${pre}${name}`);
        if (reachable.has(owner)) continue;
      } else if (reachable.has(f)) {
        continue;
      }
      this.deletePart(f);
      removed.push(f);
    }
    const ct = this.ctDoc();
    for (const o of desc(ct, NS.ct, "Override")) {
      const part = (o.getAttribute("PartName") ?? "").replace(/^\//, "");
      if (!this.has(part)) remove(o);
    }
    return removed;
  }

  /** Grava os XML alterados e devolve o .pptx. */
  generate(): Uint8Array {
    for (const [path, doc] of this.docs) this.zip.file(path, serializeXml(doc));
    return this.zip.generate({ type: "uint8array", compression: "DEFLATE" }) as Uint8Array;
  }
}

/** Nome do marcador SLIDE_* do slide (shape cujo nome começa com SLIDE_). */
export function slideMarker(doc: XDocument): string | null {
  for (const c of desc(doc, NS.p, "cNvPr")) {
    const name = c.getAttribute("name") ?? "";
    if (name.startsWith("SLIDE_")) return name;
  }
  return null;
}

export function isXElement(n: unknown): n is XElement {
  return isElement(n as XElement);
}
