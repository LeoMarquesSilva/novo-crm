/**
 * Lê `public/tipos-propostas.xlsx` e imprime no stdout um JSON agrupado
 * (revisão manual antes de atualizar `src/data/proposta-tipos-catalog.ts`).
 *
 * Colunas esperadas na 1.ª folha (1.ª linha = cabeçalhos):
 * Área | Tipo | Subtipo | ESCOPO | INVESTIMENTO
 *
 * Uso: pnpm run import:tipos-propostas
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const xlsxPath = path.join(root, "public", "tipos-propostas.xlsx");

function slug(s) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "item";
}

function normHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function main() {
  if (!fs.existsSync(xlsxPath)) {
    console.error(
      `[import-tipos-propostas] Ficheiro não encontrado: ${xlsxPath}\n` +
        "Coloque tipos-propostas.xlsx em crm/public/ e volte a executar.",
    );
    process.exit(1);
  }

  import("xlsx")
    .then((XLSX) => {
      const buf = fs.readFileSync(xlsxPath);
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (!rows.length) {
        console.error("Folha vazia.");
        process.exit(1);
      }
      const headers = (rows[0] || []).map(normHeader);
      const idx = (name) => headers.findIndex((h) => h.includes(name));
      const iArea = idx("area");
      const iTipo = idx("tipo");
      const iSub = idx("subtipo");
      const iEsc = idx("escopo");
      const iInv = idx("investimento");
      if (iArea < 0 || iTipo < 0 || iSub < 0) {
        console.error(
          "Cabeçalhos obrigatórios não encontrados (Área, Tipo, Subtipo). Encontrados:",
          headers,
        );
        process.exit(1);
      }

      /** area -> tipoId -> { label, subtipos } */
      const byArea = new Map();
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const area = String(row[iArea] ?? "").trim();
        const tipoLabel = String(row[iTipo] ?? "").trim();
        const subLabel = String(row[iSub] ?? "").trim();
        if (!area || !tipoLabel || !subLabel) continue;
        const escopo = String(iEsc >= 0 ? row[iEsc] ?? "" : "").trim();
        const invest = String(iInv >= 0 ? row[iInv] ?? "" : "").trim();
        const tipoId = slug(tipoLabel);
        const subId = slug(subLabel);
        if (!byArea.has(area)) byArea.set(area, new Map());
        const tipos = byArea.get(area);
        if (!tipos.has(tipoId)) {
          tipos.set(tipoId, { tipoId, label: tipoLabel, subtipos: [] });
        }
        tipos.get(tipoId).subtipos.push({
          subtipoId: subId,
          label: subLabel,
          escopoTemplate: escopo,
          investimentoTemplate: invest,
        });
      }

      const out = {};
      for (const [area, tiposMap] of byArea) {
        out[area] = [...tiposMap.values()];
      }

      console.log("// Gerado a partir de tipos-propostas.xlsx — copiar para proposta-tipos-catalog.ts após revisão.\n");
      console.log(JSON.stringify(out, null, 2));
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

main();
