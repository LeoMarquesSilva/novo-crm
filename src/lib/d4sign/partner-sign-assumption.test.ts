import { describe, expect, it } from "vitest";
import { classifyPartnerDoc, partnerDocTab, toPartnerSigners } from "./partner-signatures";
import {
  overlayPartnerSignAssumptions,
  reconcilePartnerSignAssumptions,
  type PartnerSignAssumption,
} from "./partner-sign-assumption";

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

function doc(fetchedAt: string | null, gustavoSigned = false) {
  return classifyPartnerDoc(
    {
      uuid_doc: "doc-1",
      name_document: "Contrato BAST",
      d4sign_status: "3",
      created_at_d4sign: null,
      finalized_at: null,
      folder_area: null,
      folder_name: null,
      client_name: null,
      details_fetched_at: fetchedAt,
      signers: [
        { email: G, signed: gustavoSigned ? "1" : "0" },
        { email: R, signed: "0" },
      ],
    },
    partners,
  )!;
}

function assumption(overrides: Partial<PartnerSignAssumption> = {}): PartnerSignAssumption {
  return {
    uuid: "doc-1",
    partnerEmail: G,
    clickedAt: "2026-10-07T18:40:00.000Z",
    fetchedAtAtClick: "2026-10-07T17:31:28.000Z",
    ...overrides,
  };
}

describe("reconcilePartnerSignAssumptions", () => {
  it("mantém enquanto a leitura dos signatários não muda", () => {
    const result = reconcilePartnerSignAssumptions([doc("2026-10-07T17:31:28.000Z")], [assumption()]);
    expect(result.kept).toHaveLength(1);
    expect(result.reverted).toHaveLength(0);
    expect(result.confirmed).toHaveLength(0);
  });

  it("mantém quando o aviso só zera a data da leitura", () => {
    const result = reconcilePartnerSignAssumptions([doc(null)], [assumption()]);
    expect(result.kept).toHaveLength(1);
    expect(result.reverted).toHaveLength(0);
  });

  it("confirma quando o sócio já consta como assinado", () => {
    const result = reconcilePartnerSignAssumptions(
      [doc("2026-10-07T18:56:00.000Z", true)],
      [assumption()],
    );
    expect(result.confirmed).toHaveLength(1);
    expect(result.kept).toHaveLength(0);
  });

  it("devolve para pendente se a leitura nova ainda mostra pendente", () => {
    const result = reconcilePartnerSignAssumptions([doc("2026-10-07T18:56:00.000Z")], [assumption()]);
    expect(result.reverted).toHaveLength(1);
    expect(result.kept).toHaveLength(0);
  });
});

describe("overlayPartnerSignAssumptions", () => {
  it("tira o sócio dos pendentes sem marcar o outro", () => {
    const open = doc("2026-10-07T17:31:28.000Z");
    const { doc: view, provisionalEmails } = overlayPartnerSignAssumptions(open, [assumption()]);
    expect(provisionalEmails).toEqual([G]);
    expect(partnerDocTab(view, G)).toBe("aguardando_outros");
    expect(partnerDocTab(view, R)).toBe("pendente");
    expect(partnerDocTab(view, "all")).toBe("pendente");
    expect(view.signers.every((signer) => signer.signed !== true && signer.signed !== "1")).toBe(true);
  });

  it("não cobre um sócio que já assinou de verdade", () => {
    const { provisionalEmails } = overlayPartnerSignAssumptions(doc(null, true), [assumption()]);
    expect(provisionalEmails).toEqual([]);
  });
});
