import { describe, expect, it } from "vitest";
import {
  encodePartnerSignRefreshSource,
  orderPendingPriorityRefresh,
  parsePartnerSignRefreshSource,
  type PriorityRefreshDoc,
} from "./partner-sign-refresh-queue";

function doc(uuid: string, fetchedAt: string | null): PriorityRefreshDoc {
  return {
    uuid_doc: uuid,
    name_document: uuid,
    d4sign_status: "3",
    details_fetched_at: fetchedAt,
  };
}

describe("orderPendingPriorityRefresh", () => {
  it("coloca na frente quem ainda não foi lido depois do clique, do mais antigo ao mais novo", () => {
    const ordered = orderPendingPriorityRefresh(
      [
        doc("novo", "2026-10-07T18:00:00.000Z"),
        doc("antigo", "2026-10-07T12:00:00.000Z"),
        doc("lido", "2026-10-07T19:00:00.000Z"),
      ],
      [
        { uuid: "novo", partnerEmail: "gustavo@bpplaw.com.br", requestedAt: "2026-10-07T18:30:00.000Z" },
        { uuid: "antigo", partnerEmail: null, requestedAt: "2026-10-07T18:10:00.000Z" },
        { uuid: "lido", partnerEmail: "gustavo@bpplaw.com.br", requestedAt: "2026-10-07T18:20:00.000Z" },
      ],
    );
    expect(ordered.map((item) => item.uuid_doc)).toEqual(["antigo", "novo"]);
  });

  it("um clique novo depois da leitura volta o contrato para a fila", () => {
    const ordered = orderPendingPriorityRefresh(
      [doc("doc", "2026-10-07T18:00:00.000Z")],
      [
        { uuid: "doc", partnerEmail: null, requestedAt: "2026-10-07T17:00:00.000Z" },
        { uuid: "doc", partnerEmail: "gustavo@bpplaw.com.br", requestedAt: "2026-10-07T18:30:00.000Z" },
      ],
    );
    expect(ordered.map((item) => item.uuid_doc)).toEqual(["doc"]);
  });

  it("leitura ausente também entra na fila", () => {
    const ordered = orderPendingPriorityRefresh([doc("doc", null)], [
      { uuid: "doc", partnerEmail: null, requestedAt: "2026-10-07T18:30:00.000Z" },
    ]);
    expect(ordered).toHaveLength(1);
  });
});

describe("parsePartnerSignRefreshSource", () => {
  it("separa uuid e e-mail e aceita a marca antiga só com uuid", () => {
    expect(parsePartnerSignRefreshSource(encodePartnerSignRefreshSource("abc", "gustavo@bpplaw.com.br"))).toEqual({
      uuid: "abc",
      partnerEmail: "gustavo@bpplaw.com.br",
    });
    expect(parsePartnerSignRefreshSource("abc")).toEqual({ uuid: "abc", partnerEmail: null });
  });
});
