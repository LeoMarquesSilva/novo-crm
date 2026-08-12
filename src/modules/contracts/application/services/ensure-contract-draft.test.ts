import { describe, expect, it } from "vitest";

type Draft = {
  id: string;
  opportunityId: string;
  clientId: string | null;
  title: string;
  version: {
    number: number;
    status: "rascunho";
    originSnapshot: Record<string, unknown>;
  };
};

describe("ensureContractDraft", () => {
  it("returns the existing logical draft without replacing its fields", async () => {
    const { ensureContractDraft } = await import("./ensure-contract-draft");
    const drafts = new Map<string, Draft>();
    let sequence = 0;
    const repository = {
      async findByOpportunityId(opportunityId: string) {
        return drafts.get(opportunityId) ?? null;
      },
      async createDraft(input: {
        opportunityId: string;
        clientId: string | null;
        title: string;
      }) {
        const draft: Draft = {
          id: `contract-${++sequence}`,
          ...input,
          version: { number: 1, status: "rascunho", originSnapshot: {} },
        };
        drafts.set(input.opportunityId, draft);
        return draft;
      },
    };

    const first = await ensureContractDraft(repository, {
      opportunityId: "opportunity-1",
      clientId: null,
      title: "Rascunho original",
    });
    first.title = "Título preenchido pelo jurídico";
    first.version.originSnapshot = { clause: "preservada" };

    const second = await ensureContractDraft(repository, {
      opportunityId: "opportunity-1",
      clientId: "client-late",
      title: "Título importado depois",
    });

    expect(second).toEqual({
      id: "contract-1",
      opportunityId: "opportunity-1",
      clientId: null,
      title: "Título preenchido pelo jurídico",
      version: {
        number: 1,
        status: "rascunho",
        originSnapshot: { clause: "preservada" },
      },
    });
    expect(drafts.size).toBe(1);
  });
});
