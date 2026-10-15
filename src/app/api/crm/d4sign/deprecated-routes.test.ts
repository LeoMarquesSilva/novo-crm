import { describe, expect, it } from "vitest";

import { GET as viosClient } from "@/app/api/integrations/vios/client/route";
import { POST as importPost } from "./import/route";
import { GET as syncGet, POST as syncPost } from "./sync/route";
import { GET as vaultGet } from "./vault/route";

describe("rotas descontinuadas", () => {
  it.each([
    ["vault GET", vaultGet],
    ["sync GET", syncGet],
    ["sync POST", syncPost],
    ["import POST", importPost],
    ["vios client GET", viosClient],
  ])("%s responde 410 sem chamar integração", async (_label, handler) => {
    const res = await handler();
    expect(res.status).toBe(410);
  });
});
