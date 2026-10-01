import { describe, expect, it } from "vitest";

import { d4signDocumentOpenPath, d4signDocumentPortalUrl } from "./portal-url";

describe("d4signDocumentPortalUrl", () => {
  it("aponta para desk/viewblob e remove barra final da base", () => {
    expect(
      d4signDocumentPortalUrl(
        "https://secure.d4sign.com.br/",
        "2dfb5ffe-0dd1-4534-bd69-964815322cfd",
      ),
    ).toBe(
      "https://secure.d4sign.com.br/desk/viewblob/2dfb5ffe-0dd1-4534-bd69-964815322cfd",
    );
  });
});

describe("d4signDocumentOpenPath", () => {
  it("aponta para a rota do CRM que gera a visualização temporária", () => {
    expect(d4signDocumentOpenPath("2dfb5ffe-0dd1-4534-bd69-964815322cfd")).toBe(
      "/api/crm/d4sign/documents/2dfb5ffe-0dd1-4534-bd69-964815322cfd/open",
    );
  });
});
