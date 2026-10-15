import { describe, expect, it } from "vitest";

import { authorizeCronRequest, isCronAuthorized } from "./cron-auth";

const SECRET = "segredo-de-teste-123";
const req = (headers: Record<string, string>) => new Request("http://localhost/api/cron/x", { headers });

describe("authorizeCronRequest", () => {
  it.each([undefined, "", "curto"])("segredo %j ausente ou curto → 503", (secret) => {
    expect(authorizeCronRequest(req({ authorization: `Bearer ${secret}` }), secret)?.status).toBe(503);
  });

  it.each([
    ["sem cabeçalho", {}],
    ["Bearer errado", { authorization: "Bearer outro-segredo-qualquer" }],
    ["tamanho diferente", { authorization: "Bearer x" }],
    ["x-cron-secret errado", { "x-cron-secret": "nao-confere" }],
  ])("%s → 401", (_label, headers) => {
    expect(authorizeCronRequest(req(headers), SECRET)?.status).toBe(401);
  });

  it.each([
    ["Bearer", { authorization: `Bearer ${SECRET}` }],
    ["bearer minúsculo", { authorization: `bearer ${SECRET}` }],
    ["x-cron-secret", { "x-cron-secret": SECRET }],
  ])("%s correto → segue", (_label, headers) => {
    expect(authorizeCronRequest(req(headers), SECRET)).toBeNull();
    expect(isCronAuthorized(req(headers), SECRET)).toBe(true);
  });
});
