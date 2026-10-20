/**
 * Gera a apresentação da DUE pela linha de comando (mesmo código do CRM).
 * Útil para testar o modelo sem subir arquivos.
 *
 *   npx tsx scripts/due-ppt/gerar-apresentacao.ts \
 *     --modelo templates/due/MODELO-DUE-CRM.pptx --saida /tmp/due.pptx \
 *     --razao "EMPRESA LTDA" --cnpj "00.000.000/0001-00" \
 *     --civel civel.xlsx --trabalhista trab.xlsx --tributario trib.xlsx --rec_cred rc.xlsx \
 *     [--reestruturacao rj.json] [--logo logo.png] [--variante trabalhista=lista]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { DUE_AREA_IDS, type DueAreaId } from "../../src/lib/due-ppt/areas";
import { composeDeck, type AreaDados } from "../../src/lib/due-ppt/compose";
import { draftSchema } from "../../src/lib/due-ppt/draft";
import { buildDeck } from "../../src/lib/due-ppt/pptx/build";
import { detectarArea, normalizarPlanilha } from "../../src/lib/due-ppt/processos";
import { readXlsx } from "../../src/lib/due-ppt/xlsx-reader";

function args(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i]!.startsWith("--")) continue;
    const k = a[i]!.slice(2);
    const v = a[i + 1] && !a[i + 1]!.startsWith("--") ? a[++i]! : "1";
    m.set(k, [...(m.get(k) ?? []), v]);
  }
  return m;
}

const opt = args();
const one = (k: string) => opt.get(k)?.[0];
const modelo = one("modelo") ?? "templates/due/MODELO-DUE-CRM.pptx";
const saida = one("saida") ?? "due.pptx";

const areas: AreaDados[] = [];
const areasDraft: Record<string, unknown> = {};
for (const id of DUE_AREA_IDS.filter((a) => a !== "reestruturacao")) {
  for (const file of opt.get(id) ?? []) {
    const sheets = readXlsx(readFileSync(file));
    const guess = detectarArea(basename(file), sheets);
    if (guess && guess !== id) console.warn(`aviso: ${file} parece ser ${guess}, usado como ${id}`);
    const n = normalizarPlanilha(sheets);
    n.avisos.forEach((a) => console.warn(`${id}: ${a}`));
    const prev = areas.find((a) => a.id === id);
    if (prev) {
      prev.processos.push(...n.processos);
      prev.extras.pge = n.extras.pge ?? prev.extras.pge;
      prev.extras.pgfn = n.extras.pgfn ?? prev.extras.pgfn;
    } else areas.push({ id, processos: n.processos, extras: n.extras });
    areasDraft[id] = { incluir: true };
  }
}
for (const v of opt.get("variante") ?? []) {
  const [id, variante] = v.split("=") as [DueAreaId, string];
  areasDraft[id] = { ...(areasDraft[id] as object), variante };
}
const rjFile = one("reestruturacao");
if (rjFile) areasDraft.reestruturacao = { incluir: true };

const draft = draftSchema.parse({
  capa: {
    razaoSocial: one("razao") ?? "",
    cnpj: one("cnpj") ?? "",
    empresas: (opt.get("empresa") ?? []).map((e) => {
      const [razaoSocial, cnpj] = e.split("|");
      return { razaoSocial, cnpj: cnpj ?? "" };
    }),
  },
  areas: areasDraft,
  reestruturacao: rjFile ? JSON.parse(readFileSync(rjFile, "utf8")) : undefined,
});

const logoFile = one("logo");
const logo = logoFile
  ? { bytes: new Uint8Array(readFileSync(logoFile)), contentType: (/\.png$/i.test(logoFile) ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg" }
  : null;

const { spec, resumos, avisos } = composeDeck({ draft, areas, logo, hoje: new Date() });
const result = buildDeck(new Uint8Array(readFileSync(modelo)), spec);
writeFileSync(saida, result.bytes);
for (const r of resumos) {
  console.log(`${r.id}: ${r.variante} — ${r.considerados}/${r.total} processos, passivo ${r.passivo ?? "-"}, crédito ${r.credito ?? "-"}`);
}
[...avisos, ...result.warnings].forEach((w) => console.warn(`aviso: ${w}`));
console.log(`ok: ${result.slideCount} slides → ${saida}`);
