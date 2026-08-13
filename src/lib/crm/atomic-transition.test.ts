import { describe, expect, it } from "vitest";

import { buildAtomicTransitionRpcArgs } from "./atomic-transition";

describe("buildAtomicTransitionRpcArgs", () => {
  it("leva a etapa lida ao banco como pré-condição de concorrência", () => {
    expect(
      buildAtomicTransitionRpcArgs({
        opportunityId: "11111111-1111-4111-8111-111111111111",
        expectedStage: "reuniao",
        nextStage: "confeccao_proposta",
        changedBy: "22222222-2222-4222-8222-222222222222",
        update: {
          updated_at: "2026-07-27T18:00:00.000Z",
          link_proposta: "https://example.test/proposta",
        },
        leadIntake: null,
        fieldValues: [
          {
            id: null,
            fieldDefinitionId: "33333333-3333-4333-8333-333333333333",
            value: "Tributário",
          },
        ],
      }),
    ).toEqual({
      p_opportunity_id: "11111111-1111-4111-8111-111111111111",
      p_expected_stage: "reuniao",
      p_next_stage: "confeccao_proposta",
      p_changed_by: "22222222-2222-4222-8222-222222222222",
      p_updated_at: "2026-07-27T18:00:00.000Z",
      p_link_proposta: "https://example.test/proposta",
      p_set_link_proposta: true,
      p_link_contrato: null,
      p_set_link_contrato: false,
      p_due_compilacao_entrada_em: null,
      p_due_revision_cycle: null,
      p_due_revisao_entrada_em: null,
      p_lead_intake: null,
      p_field_values: [
        {
          id: null,
          field_definition_id: "33333333-3333-4333-8333-333333333333",
          value_json: "Tributário",
        },
      ],
    });
  });

  it("diferencia link explicitamente nulo de link não informado", () => {
    const result = buildAtomicTransitionRpcArgs({
      opportunityId: "11111111-1111-4111-8111-111111111111",
      expectedStage: "contrato_elaborado",
      nextStage: "contrato_enviado",
      changedBy: "22222222-2222-4222-8222-222222222222",
      update: {
        updated_at: "2026-07-27T18:00:00.000Z",
        link_contrato: null,
      },
      leadIntake: null,
      fieldValues: [],
    });

    expect(result.p_set_link_contrato).toBe(true);
    expect(result.p_link_contrato).toBeNull();
    expect(result.p_set_link_proposta).toBe(false);
  });
});
