import { describe, expect, it } from "vitest";

import { normalizeSidebarFavoriteHrefs } from "./sidebar-route-aliases";

describe("normalizeSidebarFavoriteHrefs", () => {
  it("migra favoritos antigos e elimina duplicatas", () => {
    expect(
      normalizeSidebarFavoriteHrefs([
        "/crm/documentos",
        "/crm/due-diligence",
        "/crm/admin/documentos",
      ]),
    ).toEqual(["/crm/due-diligence", "/crm/admin/modelo-proposta"]);
  });
});
