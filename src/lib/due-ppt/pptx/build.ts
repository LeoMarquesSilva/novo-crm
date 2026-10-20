/**
 * Monta o PPT a partir do modelo do CRM e de uma "receita" (DeckSpec): quais
 * slides entram, em que ordem, com quais valores. Não conhece regra de negócio
 * da DUE — isso fica em ../compose.ts.
 */
import { updateChart, type ChartData } from "./chart";
import { replaceImage, type ImageAsset } from "./image";
import { PptxPackage, slideMarker } from "./package";
import {
  absBox,
  box,
  findByPrefix,
  findShape,
  inch,
  moveBy,
  removeShape,
  setPos,
  setSize,
  union,
  type Box,
} from "./shapes";
import { fillTable, type TableRows } from "./table";
import { fillTokens, type TokenValues } from "./text";
import { NS, allKids, desc, type XDocument, type XElement } from "./xml";

export type SlideOp =
  /** Remove shapes pelo nome exato ou prefixo (terminado em "*"). */
  | { kind: "remove"; names: string[] }
  /** Slots numerados `${prefix}_${i}_*`: mantém `count`, reespaça e ajusta a linha vertical. */
  | { kind: "slots"; prefix: string; count: number; line?: string; maxBottomIn?: number }
  /** Linhas `${prefix}_*` empilhadas na ordem dada; as fora da lista saem. */
  | {
      kind: "stack";
      order: string[];
      all: string[];
      bottomLimitShape?: string;
      /** Linha compacta: tira os shapes `${prefix}_${remove}` e sobe os `${prefix}_${pull}` para `pullOffsetIn` abaixo do topo. */
      compact?: { remove: string[]; pull: string[]; pullOffsetIn: number };
    }
  /** Barra proporcional: largura de `bar` = largura de `track` × ratio. */
  | { kind: "bar"; track: string; bar: string; ratio: number }
  /** Grupos (cards) em uma linha centralizada; os fora da lista saem. */
  | { kind: "cardRow"; order: string[]; all: string[]; keepTemplateLayoutWhen?: number }
  /** Rótulos alinhados às barras de um gráfico de barras horizontais (de cima para baixo). */
  | { kind: "pills"; prefix: string; count: number }
  /**
   * Colunas `${prefix}_${i}_*` lado a lado: mantém `count` e divide entre elas, em partes
   * iguais, a faixa que as colunas ocupam no modelo (cada shape fica com a largura da coluna).
   * Divisórias `${prefix}_DIV_${i}` vão para a fronteira entre a coluna i e a i+1.
   */
  | { kind: "columns"; prefix: string; count: number }
  /** Multiplica o tamanho da fonte (onde o texto define `sz`), arredondando para meio ponto. */
  | { kind: "fontScale"; names: string[]; scale: number }
  | { kind: "image"; name: string; image: ImageAsset }
  | { kind: "moveTo"; name: string; xIn?: number; yIn?: number }
  | { kind: "shift"; names: string[]; dxIn?: number; dyIn?: number };

export type SlideSpec = {
  /** Marcador SLIDE_* do slide no modelo. Repetir o marcador clona o slide. */
  source: string;
  tokens?: TokenValues;
  tables?: Record<string, TableRows>;
  charts?: Record<string, ChartData>;
  ops?: SlideOp[];
};

export type DeckSpec = {
  globals: TokenValues;
  slides: SlideSpec[];
};

export type BuildResult = { bytes: Uint8Array; warnings: string[]; slideCount: number };

// ─── operações de layout ──────────────────────────────────────────────────────

function matchNames(doc: XDocument, names: string[]): XElement[] {
  const out: XElement[] = [];
  for (const n of names) {
    if (n.endsWith("*")) out.push(...findByPrefix(doc, n.slice(0, -1)));
    else {
      const s = findShape(doc, n);
      if (s) out.push(s);
    }
  }
  return out;
}

function slotShapes(doc: XDocument, prefix: string, i: number): XElement[] {
  return findByPrefix(doc, `${prefix}_${i}_`);
}

function opSlots(doc: XDocument, op: Extract<SlideOp, { kind: "slots" }>, warn: (m: string) => void) {
  let available = 0;
  while (slotShapes(doc, op.prefix, available + 1).length) available++;
  if (op.count > available) warn(`${op.prefix}: ${op.count} itens para ${available} posições no modelo.`);
  const count = Math.min(op.count, available);
  for (let i = count + 1; i <= available; i++) slotShapes(doc, op.prefix, i).forEach(removeShape);

  const tops = Array.from({ length: count }, (_, k) => union(slotShapes(doc, op.prefix, k + 1).map(box)));
  if (count >= 2) {
    const first = tops[0]!;
    let step = tops[1]!.y - first.y;
    if (op.maxBottomIn != null) {
      const last = tops[count - 1]!;
      const limit = inch(op.maxBottomIn);
      if (first.y + (count - 1) * step + last.h > limit) step = (limit - last.h - first.y) / (count - 1);
    }
    for (let k = 1; k < count; k++) {
      const dy = first.y + k * step - tops[k]!.y;
      slotShapes(doc, op.prefix, k + 1).forEach((s) => moveBy(s, 0, dy));
    }
  }
  if (op.line) {
    const line = findShape(doc, op.line);
    if (line) {
      const lastConn = count ? findShape(doc, `${op.prefix}_${count}_CONECTOR`) : null;
      const lb = box(line);
      const bottom = lastConn ? box(lastConn).y + box(lastConn).h / 2 : lb.y;
      const h = bottom - lb.y;
      if (h < inch(0.05)) removeShape(line);
      else setSize(line, undefined, h);
    }
  }
}

function rowShapes(doc: XDocument, prefix: string): XElement[] {
  return findByPrefix(doc, `${prefix}_`);
}

function opStack(doc: XDocument, op: Extract<SlideOp, { kind: "stack" }>) {
  const boxes = new Map<string, Box>();
  for (const p of op.all) {
    const shapes = rowShapes(doc, p);
    if (shapes.length) boxes.set(p, union(shapes.map(box)));
  }
  if (!boxes.size) return;
  const tops = [...boxes.values()].map((b) => b.y).sort((a, b) => a - b);
  const start = tops[0]!;
  let rowH = Math.max(...[...boxes.values()].map((b) => b.h));
  // Passo do modelo: menor distância entre linhas que não se sobrepõem.
  let step = Infinity;
  for (let i = 1; i < tops.length; i++) {
    const d = tops[i]! - tops[i - 1]!;
    if (d >= rowH * 0.8) step = Math.min(step, d);
  }
  if (!Number.isFinite(step)) step = rowH + inch(0.15);
  const gap = step - rowH;

  const keep = op.order.filter((p) => boxes.has(p));
  for (const p of op.all) if (!keep.includes(p)) rowShapes(doc, p).forEach(removeShape);

  if (op.compact) {
    const c = op.compact;
    let compactH = 0;
    for (const p of keep) {
      const top = boxes.get(p)!.y;
      for (const suf of c.remove) {
        const shp = findShape(doc, `${p}_${suf}`);
        if (shp) removeShape(shp);
      }
      for (const suf of c.pull) {
        const shp = findShape(doc, `${p}_${suf}`);
        if (shp) setPos(shp, undefined, top + inch(c.pullOffsetIn));
      }
      const b = union(rowShapes(doc, p).map(box));
      boxes.set(p, b);
      compactH = Math.max(compactH, b.h);
    }
    rowH = compactH;
    step = rowH + Math.max(gap, inch(0.12));
  }

  if (op.bottomLimitShape && keep.length > 1) {
    const limitShape = findShape(doc, op.bottomLimitShape);
    if (limitShape) {
      const limit = box(limitShape).y - inch(0.1);
      const maxStep = (limit - rowH - start) / (keep.length - 1);
      if (maxStep < step) step = maxStep;
    }
  }
  keep.forEach((p, i) => {
    const dy = start + i * step - boxes.get(p)!.y;
    rowShapes(doc, p).forEach((s) => moveBy(s, 0, dy));
  });
}

function opBar(doc: XDocument, op: Extract<SlideOp, { kind: "bar" }>) {
  const track = findShape(doc, op.track);
  const bar = findShape(doc, op.bar);
  if (!track || !bar) return;
  const ratio = Math.max(0, Math.min(1, Number.isFinite(op.ratio) ? op.ratio : 0));
  setSize(bar, Math.max(inch(0.04), box(track).w * ratio));
}

/** Card principal do grupo: maior retângulo sem rotação. */
function cardBox(group: XElement): Box {
  let best: { area: number; b: Box } | null = null;
  const walk = (el: XElement) => {
    for (const c of allKids(el)) {
      if (c.localName === "sp") {
        const xfrm = desc(c, NS.a, "xfrm")[0];
        const rot = xfrm?.getAttribute("rot");
        if (!rot || rot === "0") {
          const b = absBox(c);
          if (!best || b.w * b.h > best.area) best = { area: b.w * b.h, b };
        }
      } else if (c.localName === "grpSp") walk(c);
    }
  };
  walk(group);
  return (best as { area: number; b: Box } | null)?.b ?? absBox(group);
}

function opCardRow(doc: XDocument, op: Extract<SlideOp, { kind: "cardRow" }>) {
  const groups = new Map<string, XElement>();
  for (const n of op.all) {
    const g = findShape(doc, n);
    if (g) groups.set(n, g);
  }
  const keep = op.order.filter((n) => groups.has(n));
  for (const [n, g] of groups) if (!keep.includes(n)) removeShape(g);
  if (op.keepTemplateLayoutWhen != null && keep.length >= op.keepTemplateLayoutWhen) return;
  if (!keep.length) return;
  const cards = keep.map((n) => ({ n, g: groups.get(n)!, b: cardBox(groups.get(n)!) }));
  // Referência: posição/espaçamento dos cards da linha principal do modelo.
  const rowY = Math.max(...cards.map((c) => c.b.y));
  const cardW = Math.max(...cards.map((c) => c.b.w));
  const step = cardW + inch(0.77);
  const slideW = inch(13.333);
  const total = (keep.length - 1) * step + cardW;
  const x0 = (slideW - total) / 2;
  cards.forEach((c, i) => moveBy(c.g, x0 + i * step - c.b.x, rowY - c.b.y));
}

function opPills(doc: XDocument, op: Extract<SlideOp, { kind: "pills" }>) {
  const pills: XElement[] = [];
  for (let i = 1; ; i++) {
    const s = findShape(doc, `${op.prefix}_${i}`);
    if (!s) break;
    pills.push(s);
  }
  if (!pills.length) return;
  const boxes = pills.map(box);
  const n = pills.length;
  const step = n > 1 ? (boxes[n - 1]!.y - boxes[0]!.y) / (n - 1) : boxes[0]!.h * 1.3;
  const bandTop = boxes[0]!.y + boxes[0]!.h / 2 - step / 2;
  const bandH = step * n;
  const count = Math.min(op.count, n);
  pills.forEach((p, i) => {
    if (i >= count) {
      removeShape(p);
      return;
    }
    const center = bandTop + ((i + 0.5) * bandH) / count;
    setPos(p, undefined, center - boxes[i]!.h / 2);
  });
}

function opColumns(doc: XDocument, op: Extract<SlideOp, { kind: "columns" }>, warn: (m: string) => void) {
  let available = 0;
  while (slotShapes(doc, op.prefix, available + 1).length) available++;
  if (!available) return;
  if (op.count > available) warn(`${op.prefix}: ${op.count} itens para ${available} posições no modelo.`);
  const count = Math.max(0, Math.min(op.count, available));
  const band = union(Array.from({ length: available }, (_, k) => slotShapes(doc, op.prefix, k + 1).map(box)).flat());
  for (let i = count + 1; i <= available; i++) slotShapes(doc, op.prefix, i).forEach(removeShape);
  for (let i = Math.max(1, count); i < available; i++) {
    const div = findShape(doc, `${op.prefix}_DIV_${i}`);
    if (div) removeShape(div);
  }
  if (!count) return;
  const w = band.w / count;
  for (let k = 0; k < count; k++) {
    for (const s of slotShapes(doc, op.prefix, k + 1)) {
      setPos(s, band.x + k * w);
      setSize(s, w);
    }
    const div = k ? findShape(doc, `${op.prefix}_DIV_${k}`) : null;
    if (div) setPos(div, band.x + k * w - box(div).w / 2);
  }
}

function opFontScale(doc: XDocument, op: Extract<SlideOp, { kind: "fontScale" }>) {
  for (const shp of matchNames(doc, op.names)) {
    for (const tag of ["rPr", "endParaRPr", "defRPr"]) {
      for (const pr of desc(shp, NS.a, tag)) {
        const sz = Number(pr.getAttribute("sz"));
        if (sz) pr.setAttribute("sz", String(Math.max(100, Math.round((sz * op.scale) / 50) * 50)));
      }
    }
  }
}

// ─── montagem ─────────────────────────────────────────────────────────────────

export function buildDeck(template: ArrayBuffer | Uint8Array, spec: DeckSpec): BuildResult {
  const pkg = new PptxPackage(template);
  const warnings: string[] = [];
  const warn = (m: string) => {
    if (!warnings.includes(m)) warnings.push(m);
  };

  const byMarker = new Map<string, string>();
  for (const path of pkg.slidePaths()) {
    const marker = slideMarker(pkg.xml(path));
    if (marker && !byMarker.has(marker)) byMarker.set(marker, path);
  }

  // 1ª passada: decide o arquivo de cada slide (clona antes de qualquer edição).
  const used = new Set<string>();
  const plan: Array<{ path: string; spec: SlideSpec }> = [];
  for (const s of spec.slides) {
    const src = byMarker.get(s.source);
    if (!src) {
      warn(`O modelo não tem o slide ${s.source}.`);
      continue;
    }
    const path = used.has(src) ? pkg.cloneSlide(src) : src;
    used.add(src);
    plan.push({ path, spec: s });
  }

  // 2ª passada: preenche.
  const missing = new Set<string>();
  for (const { path, spec: s } of plan) {
    const doc = pkg.xml(path);
    for (const [name, rows] of Object.entries(s.tables ?? {})) {
      if (!fillTable(doc, name, rows, missing)) warn(`Tabela ${name} não encontrada em ${s.source}.`);
    }
    for (const [name, data] of Object.entries(s.charts ?? {})) {
      if (!updateChart(pkg, path, name, data)) warn(`Gráfico ${name} não encontrado em ${s.source}.`);
    }
    for (const op of s.ops ?? []) {
      switch (op.kind) {
        case "remove":
          matchNames(doc, op.names).forEach(removeShape);
          break;
        case "slots":
          opSlots(doc, op, warn);
          break;
        case "stack":
          opStack(doc, op);
          break;
        case "bar":
          opBar(doc, op);
          break;
        case "cardRow":
          opCardRow(doc, op);
          break;
        case "pills":
          opPills(doc, op);
          break;
        case "columns":
          opColumns(doc, op, warn);
          break;
        case "fontScale":
          opFontScale(doc, op);
          break;
        case "image":
          if (!replaceImage(pkg, path, op.name, op.image)) warn(`Imagem ${op.name} não encontrada.`);
          break;
        case "shift":
          matchNames(doc, op.names).forEach((shp) => moveBy(shp, inch(op.dxIn ?? 0), inch(op.dyIn ?? 0)));
          break;
        case "moveTo": {
          const shp = findShape(doc, op.name);
          if (shp) setPos(shp, op.xIn != null ? inch(op.xIn) : undefined, op.yIn != null ? inch(op.yIn) : undefined);
          break;
        }
      }
    }
    fillTokens(doc.documentElement!, { ...spec.globals, ...(s.tokens ?? {}) }, missing);
    pkg.pruneUnreferencedRels(path);
  }
  if (missing.size) warn(`Campos sem valor no modelo: ${[...missing].sort().join(", ")}`);

  pkg.setSlideOrder(plan.map((p) => p.path));
  pkg.collectGarbage();
  return { bytes: pkg.generate(), warnings, slideCount: plan.length };
}
