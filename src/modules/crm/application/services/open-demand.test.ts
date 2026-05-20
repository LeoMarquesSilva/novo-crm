import { describe, expect, it } from "vitest";
import { validateOpenDemand } from "@/modules/crm/application/services/open-demand";

describe("validateOpenDemand", () => {
  it("accepts novo_lead without client", () => {
    const result = validateOpenDemand({ type: "novo_lead" });
    expect(result.valid).toBe(true);
  });

  it("requires client for novo_contrato", () => {
    const result = validateOpenDemand({ type: "novo_contrato" });
    expect(result.valid).toBe(false);
  });

  it("requires contract for aditivo", () => {
    const result = validateOpenDemand({
      type: "aditivo",
      clientId: "cli_1",
    });
    expect(result.valid).toBe(false);
  });
});
