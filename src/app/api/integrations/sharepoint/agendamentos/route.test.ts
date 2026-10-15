import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("POST sharepoint/agendamentos", () => {
  it("sem segredo configurado responde 503 sem citar a variável", async () => {
    vi.stubEnv("SHAREPOINT_INTEGRATION_SECRET", "");
    const res = await POST(new Request("http://localhost", { method: "POST", body: "{}" }));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("SHAREPOINT_");
  });

  it("segredo errado → 401", async () => {
    vi.stubEnv("SHAREPOINT_INTEGRATION_SECRET", "segredo-certo");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-sharepoint-integration-secret": "segredo-errado" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
  });
});
