import { describe, expect, it } from "vitest";
import {
  canAccessPartnerSignatures,
  classifyPartnerDoc,
  countPartnerTabs,
  daysSince,
  partnerDocTab,
  resolvePartnerEmail,
  signerIsPending,
  toPartnerSigners,
  type PartnerDocRow,
} from "./partner-signatures";

const partners = toPartnerSigners([
  {
    email: "gustavo@bpplaw.com.br",
    name: "Gustavo Bismarchi Motta",
    oab: "",
    foreign: "0",
    aliases: ["gustavo@bismarchipires.com.br"],
  },
  {
    email: "ricardo@bpplaw.com.br",
    name: "Ricardo Viscardi Pires",
    oab: "",
    foreign: "0",
    aliases: ["ricardo@bismarchipires.com.br"],
  },
]);

const G = "gustavo@bpplaw.com.br";
const R = "ricardo@bpplaw.com.br";

function row(overrides: Partial<PartnerDocRow>): PartnerDocRow {
  return {
    uuid_doc: "doc-1",
    name_document: "Contrato X",
    d4sign_status: "3",
    created_at_d4sign: null,
    finalized_at: null,
    folder_area: null,
    folder_name: null,
    signers: [],
    client_name: null,
    ...overrides,
  };
}

describe("signerIsPending", () => {
  it("interpreta os formatos de `signed`", () => {
    expect(signerIsPending({ signed: null })).toBe(true);
    expect(signerIsPending({ signed: false })).toBe(true);
    expect(signerIsPending({ signed: "0" })).toBe(true);
    expect(signerIsPending({ signed: 0 })).toBe(true);
    expect(signerIsPending({ signed: true })).toBe(false);
    expect(signerIsPending({ signed: "1" })).toBe(false);
    expect(signerIsPending({ signed: 1 })).toBe(false);
  });
});

describe("resolvePartnerEmail / canAccessPartnerSignatures", () => {
  it("normaliza alias de domínio antigo e caixa", () => {
    expect(resolvePartnerEmail("Gustavo@BismarchiPires.com.br", partners)).toBe(G);
    expect(resolvePartnerEmail("ricardo@bpplaw.com.br", partners)).toBe(R);
    expect(resolvePartnerEmail("cliente@x.com", partners)).toBeNull();
    expect(resolvePartnerEmail(null, partners)).toBeNull();
  });

  it("libera admin e sócios, bloqueia os demais", () => {
    expect(canAccessPartnerSignatures({ role: "admin", email: "a@x.com", partners })).toBe(true);
    expect(canAccessPartnerSignatures({ role: "comercial", email: "ricardo@bismarchipires.com.br", partners })).toBe(true);
    expect(canAccessPartnerSignatures({ role: "financeiro", email: "fin@x.com", partners })).toBe(false);
    expect(canAccessPartnerSignatures({ role: null, email: null, partners })).toBe(false);
  });
});

describe("classifyPartnerDoc", () => {
  it("ignora documento sem signers ou sem sócio", () => {
    expect(classifyPartnerDoc(row({ signers: [] }), partners)).toBeNull();
    expect(classifyPartnerDoc(row({ signers: null }), partners)).toBeNull();
    expect(
      classifyPartnerDoc(row({ signers: [{ email: "cliente@x.com", signed: "0" }] }), partners),
    ).toBeNull();
  });

  it("mapeia alias para o sócio canônico", () => {
    const doc = classifyPartnerDoc(
      row({ signers: [{ email: "gustavo@bismarchipires.com.br", signed: "0", key_signer: "k1" }] }),
      partners,
    );
    expect(doc?.partners[G]).toMatchObject({
      signerEmail: "gustavo@bismarchipires.com.br",
      keySigner: "k1",
      signed: false,
    });
  });

  it("separa pendências por sócio quando os dois assinam", () => {
    const doc = classifyPartnerDoc(
      row({
        signers: [
          { email: G, signed: "1", signed_at: "2026-09-01T10:00:00Z" },
          { email: R, signed: "0" },
          { email: "cliente@x.com", signed: "0" },
        ],
      }),
      partners,
    )!;
    expect(partnerDocTab(doc, G)).toBe("aguardando_outros");
    expect(partnerDocTab(doc, R)).toBe("pendente");
    expect(partnerDocTab(doc, "all")).toBe("pendente");
  });

  it("retorna null na aba quando o sócio filtrado não assina o documento", () => {
    const doc = classifyPartnerDoc(row({ signers: [{ email: G, signed: "0" }] }), partners)!;
    expect(partnerDocTab(doc, R)).toBeNull();
  });

  it("finalizado e cancelado vencem a pendência do signer", () => {
    const signers = [{ email: G, signed: "0" }];
    const done = classifyPartnerDoc(row({ d4sign_status: "1", signers }), partners)!;
    expect(partnerDocTab(done, G)).toBe("finalizado");
    for (const status of ["4", "6", "7"]) {
      const cancelled = classifyPartnerDoc(row({ d4sign_status: status, signers }), partners)!;
      expect(partnerDocTab(cancelled, G)).toBe("cancelado");
    }
  });
});

describe("countPartnerTabs", () => {
  it("conta por aba e por sócio", () => {
    const docs = [
      row({ uuid_doc: "a", signers: [{ email: G, signed: "0" }] }),
      row({ uuid_doc: "b", signers: [{ email: G, signed: "0" }, { email: R, signed: "0" }] }),
      row({ uuid_doc: "c", d4sign_status: "1", signers: [{ email: R, signed: "1" }] }),
    ]
      .map((r) => classifyPartnerDoc(r, partners))
      .filter((d) => d !== null);

    expect(countPartnerTabs(docs, G)).toEqual({ pendente: 2, aguardando_outros: 0, finalizado: 0, cancelado: 0 });
    expect(countPartnerTabs(docs, R)).toEqual({ pendente: 1, aguardando_outros: 0, finalizado: 1, cancelado: 0 });
    expect(countPartnerTabs(docs, "all")).toEqual({ pendente: 2, aguardando_outros: 0, finalizado: 1, cancelado: 0 });
  });
});

describe("daysSince", () => {
  it("conta dias inteiros e trata ausência", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(daysSince("2026-09-27T11:00:00Z", now)).toBe(3);
    expect(daysSince(null, now)).toBe(0);
    expect(daysSince("2026-10-05T00:00:00Z", now)).toBe(0);
  });
});
