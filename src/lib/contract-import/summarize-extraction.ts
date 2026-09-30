import { BILLING_KIND_LABELS, centsToMaskedBrl } from "@/components/crm/contracts/contract-setup-form-helpers";
import type { ContractImportExtraction } from "./schemas";
import type { SioeRateioSnapshot } from "./sioe-rateio";

export function summarizeImportedComponents(extraction: ContractImportExtraction): string[] {
  return extraction.components.map((component) => {
    const kind = BILLING_KIND_LABELS[component.kind] ?? component.kind;
    if (component.kind === "variavel_processo" || component.kind === "variavel_hora") {
      const unit = component.unitAmountCents != null ? centsToMaskedBrl(String(component.unitAmountCents)) : "—";
      const mode = component.chargeMode === "excedente" ? "só excedente" : "quantidade total";
      const qty = component.includedQuantity != null ? `, franquia ${component.includedQuantity}` : "";
      return `${kind}: ${unit} (${mode}${qty})`;
    }
    if (component.kind === "exito_percentual" && component.percentageBasisPoints != null) {
      return `${kind}: ${component.percentageBasisPoints / 100}%`;
    }
    if (component.amountCents != null) {
      return `${kind}: ${centsToMaskedBrl(String(component.amountCents))}`;
    }
    return component.description || kind;
  });
}

export function summarizeImportedAreas(extraction: ContractImportExtraction): string {
  if (!extraction.areas.length) return "Nenhuma área explícita no PDF";
  return extraction.areas
    .map((area) => {
      const extras = [
        area.includedProcesses != null ? `${area.includedProcesses} pastas` : null,
        area.includedHours != null ? `${area.includedHours}h` : null,
      ].filter(Boolean);
      return extras.length ? `${area.areaKey} (${extras.join(", ")})` : area.areaKey;
    })
    .join(" · ");
}

export function summarizeSioeRateio(snapshot: SioeRateioSnapshot | null | undefined): string | null {
  if (!snapshot?.shares.length) return null;
  return snapshot.shares
    .map((share) => `${share.areaKey} ${Math.round(share.percentageBasisPoints / 100)}%`)
    .join(" · ");
}
