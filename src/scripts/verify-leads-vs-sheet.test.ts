/**
 * Compara `public/CRM-BP-14-04.xlsx` (stage_name / Deal_id) com o CRM:
 * etapa efetiva = resolvePipelineEtapaFromDbAndRd (igual ao kanban).
 *
 * Execução: `npm run verify:sheet` (requer .env com Supabase).
 * Com falha se houver divergências: `VERIFY_SHEET_STRICT=1 npm run verify:sheet`
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  isRdDisplayLabelInPipelineMap,
  opportunityStageFromDisplayLabel,
  opportunityStageFromReconciliationDetails,
  resolvePipelineEtapaFromDbAndRd,
} from "@/lib/crm/rd-pipeline-stage-from-reconciliation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

describe("CRM-BP xlsx vs etapas no Supabase", () => {
  it(
    "relatório: planilha vs CRM (rd_deal_reconciliacao + oportunidades.etapa)",
    async () => {
      const xlsxPath = resolve(process.cwd(), "public/CRM-BP-14-04.xlsx");
      const buf = readFileSync(xlsxPath);
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });

      const supabase = createSupabaseAdminClient();
      const { data: reconRows, error: reconErr } = await supabase
        .from("rd_deal_reconciliacao")
        .select("rd_deal_id, oportunidade_id, detalhes, reconciled_at")
        .order("reconciled_at", { ascending: false });

      if (reconErr) {
        throw reconErr;
      }

      const reconByDeal = new Map<
        string,
        {
          oportunidade_id: string | null;
          detalhes: unknown;
          reconciled_at: string;
        }
      >();
      for (const r of reconRows ?? []) {
        if (!reconByDeal.has(r.rd_deal_id)) {
          reconByDeal.set(r.rd_deal_id, r);
        }
      }

      const sheetDealIds = rows
        .map((r) => String(r.Deal_id ?? "").trim())
        .filter(Boolean);

      const oppIdsNeeded = new Set<string>();
      for (const did of sheetDealIds) {
        const rec = reconByDeal.get(did);
        if (rec?.oportunidade_id) {
          oppIdsNeeded.add(rec.oportunidade_id);
        }
      }

      const oppIdList = [...oppIdsNeeded];
      const etapaByOppId = new Map<string, OpportunityStage>();
      const chunk = 500;
      for (let i = 0; i < oppIdList.length; i += chunk) {
        const slice = oppIdList.slice(i, i + chunk);
        const { data: opps, error: oppErr } = await supabase
          .from("oportunidades")
          .select("id, etapa")
          .in("id", slice);
        if (oppErr) {
          throw oppErr;
        }
        for (const o of opps ?? []) {
          etapaByOppId.set(o.id, o.etapa as OpportunityStage);
        }
      }

      const mismatches: string[] = [];
      const noRecon: string[] = [];
      const unmappedLabels = new Set<string>();
      let ok = 0;
      let skippedEmptyDeal = 0;

      for (const row of rows) {
        const dealId = String(row.Deal_id ?? "").trim();
        if (!dealId) {
          skippedEmptyDeal++;
          continue;
        }

        const stageName = String(row.stage_name ?? "").trim();
        const nome = String(row.Nome ?? "").trim();

        if (stageName && !isRdDisplayLabelInPipelineMap(stageName)) {
          unmappedLabels.add(stageName);
        }

        const sheetStage = opportunityStageFromDisplayLabel(stageName);
        const recon = reconByDeal.get(dealId);

        if (!recon?.oportunidade_id) {
          noRecon.push(`${dealId}\t${nome}\t${stageName}`);
          continue;
        }

        const dbEtapa =
          etapaByOppId.get(recon.oportunidade_id) ?? "cadastro_lead";
        const crmResolved = resolvePipelineEtapaFromDbAndRd(
          dbEtapa,
          true,
          recon.detalhes,
        );
        const rdOnly = opportunityStageFromReconciliationDetails(recon.detalhes);

        if (sheetStage !== crmResolved) {
          mismatches.push(
            [
              dealId,
              nome,
              `planilha→${sheetStage}`,
              `CRM→${crmResolved}`,
              `db→${dbEtapa}`,
              `RD_snap→${rdOnly ?? "—"}`,
              `rótulo:"${stageName}"`,
            ].join("\t"),
          );
        } else {
          ok++;
        }
      }

      // eslint-disable-next-line no-console -- relatório para o operador
      console.log("\n=== CRM-BP-14-04.xlsx vs CRM ===\n");
      // eslint-disable-next-line no-console
      console.log("Linhas na planilha (com Deal_id):", sheetDealIds.length);
      // eslint-disable-next-line no-console
      console.log("OK (etapa planilha = etapa CRM resolvida):", ok);
      // eslint-disable-next-line no-console
      console.log("Sem reconciliação ou sem oportunidade ligada:", noRecon.length);
      // eslint-disable-next-line no-console
      console.log("Divergências:", mismatches.length);
      if (unmappedLabels.size > 0) {
        // eslint-disable-next-line no-console
        console.log(
          "\nRótulos na planilha sem chave em RD_PIPELINE_STAGE_MAP (caem em cadastro_lead):",
        );
        // eslint-disable-next-line no-console
        console.log([...unmappedLabels].sort().join(" | "));
      }
      if (noRecon.length > 0) {
        // eslint-disable-next-line no-console
        console.log("\n--- Primeiros sem CRM (deal / nome / stage_name) ---");
        // eslint-disable-next-line no-console
        console.log(noRecon.slice(0, 30).join("\n"));
        if (noRecon.length > 30) {
          // eslint-disable-next-line no-console
          console.log(`... +${noRecon.length - 30} linhas`);
        }
      }
      if (mismatches.length > 0) {
        // eslint-disable-next-line no-console
        console.log("\n--- Divergências (deal / cols tab-separadas) ---");
        // eslint-disable-next-line no-console
        console.log(mismatches.slice(0, 80).join("\n"));
        if (mismatches.length > 80) {
          // eslint-disable-next-line no-console
          console.log(`... +${mismatches.length - 80} linhas`);
        }
      }
      // eslint-disable-next-line no-console
      console.log("\n(fim)\n");

      if (process.env.VERIFY_SHEET_STRICT === "1") {
        expect(
          mismatches,
          "Divergências entre planilha e CRM — ver log acima ou ajuste mapa / dados",
        ).toEqual([]);
      } else {
        expect(skippedEmptyDeal).toBeGreaterThanOrEqual(0);
      }
    },
    120_000,
  );
});
