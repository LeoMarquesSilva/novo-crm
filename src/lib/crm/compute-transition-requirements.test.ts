import { describe, expect, it } from "vitest";
import type { FieldDefinition } from "@/lib/crm/crm-field-schema";
import {
  countBusinessDaysFromTomorrowInclusive,
  dedupeConfeccaoPropostaDefinitionsByNormalizedLabel,
  filterConfeccaoPropostaTransitionDefinitions,
  filterPropostaEnviadaDuplicateLinkFields,
  listBlockingCustomFields,
} from "./compute-transition-requirements";

function def(overrides: Partial<FieldDefinition> & Pick<FieldDefinition, "field_code">): FieldDefinition {
  return {
    id: "1",
    field_code: overrides.field_code,
    label: overrides.label ?? overrides.field_code,
    field_type: overrides.field_type ?? "text",
    is_required: overrides.is_required ?? true,
    condition_json: overrides.condition_json ?? null,
    field_options: overrides.field_options ?? null,
    sort_order: overrides.sort_order ?? 0,
    stage_code: overrides.stage_code ?? "confeccao_proposta",
    pipeline_code: overrides.pipeline_code ?? "vendas",
    is_active: overrides.is_active ?? true,
  };
}

describe("filterConfeccaoPropostaTransitionDefinitions", () => {
  it("removes demais razoes, cp_* razao/cnpj e aliases legados para vendas confeccao_proposta", () => {
    const defs = [
      def({ field_code: "cp_demais_razoes" }),
      def({ field_code: "cp_razao_social" }),
      def({ field_code: "cp_cnpj" }),
      def({ field_code: "razao_social_cp" }),
      def({ field_code: "cnpj_cp" }),
    ];
    const filtered = filterConfeccaoPropostaTransitionDefinitions(defs, {
      pipeline: "vendas",
      nextStage: "confeccao_proposta",
    });
    expect(filtered.map((f) => f.field_code)).toEqual([]);
  });

  it("does not filter other stages", () => {
    const defs = [def({ field_code: "cp_razao_social", stage_code: "proposta_enviada" })];
    const filtered = filterConfeccaoPropostaTransitionDefinitions(defs, {
      pipeline: "vendas",
      nextStage: "proposta_enviada",
    });
    expect(filtered).toHaveLength(1);
  });
});

describe("dedupeConfeccaoPropostaDefinitionsByNormalizedLabel", () => {
  it("prefere field_code cp_* quando o label normalizado coincide", () => {
    const defs = [
      def({
        field_code: "areas_dup",
        label: "Áreas objeto",
        sort_order: 0,
      }),
      def({
        field_code: "cp_areas_objeto",
        label: "Areas objeto",
        sort_order: 1,
      }),
    ];
    const out = dedupeConfeccaoPropostaDefinitionsByNormalizedLabel(defs, {
      pipeline: "vendas",
      nextStage: "confeccao_proposta",
    });
    expect(out.map((f) => f.field_code)).toEqual(["cp_areas_objeto"]);
  });

  it("no-op for outras etapas", () => {
    const defs = [
      def({ field_code: "a", label: "X", stage_code: "reuniao" }),
      def({ field_code: "b", label: "X", stage_code: "reuniao" }),
    ];
    const out = dedupeConfeccaoPropostaDefinitionsByNormalizedLabel(defs, {
      pipeline: "vendas",
      nextStage: "reuniao",
    });
    expect(out).toHaveLength(2);
  });
});

describe("filterPropostaEnviadaDuplicateLinkFields", () => {
  it("remove campo configurável duplicado do link oficial (vendas / proposta_enviada)", () => {
    const defs = [
      def({ field_code: "link_proposta", label: "Link da Proposta [CP]", stage_code: "proposta_enviada" }),
      def({ field_code: "outro_campo", label: "Observação", stage_code: "proposta_enviada" }),
    ];
    const out = filterPropostaEnviadaDuplicateLinkFields(defs, {
      pipeline: "vendas",
      nextStage: "proposta_enviada",
    });
    expect(out.map((f) => f.field_code)).toEqual(["outro_campo"]);
  });

  it("no-op for outras etapas", () => {
    const defs = [def({ field_code: "link_proposta", stage_code: "confeccao_proposta" })];
    const out = filterPropostaEnviadaDuplicateLinkFields(defs, {
      pipeline: "vendas",
      nextStage: "confeccao_proposta",
    });
    expect(out).toHaveLength(1);
  });
});

describe("listBlockingCustomFields", () => {
  it("bloqueia cp_nome_focal quando só há um nome (sem sobrenome)", () => {
    const defs = [
      def({ field_code: "cp_nome_focal", label: "Nome do ponto focal [CP]", field_type: "text" }),
    ];
    const blocking = listBlockingCustomFields(defs, { cp_nome_focal: "João" });
    expect(blocking.map((f) => f.field_code)).toEqual(["cp_nome_focal"]);
  });

  it("não bloqueia cp_nome_focal com nome e sobrenome", () => {
    const defs = [
      def({ field_code: "cp_nome_focal", label: "Nome do ponto focal [CP]", field_type: "text" }),
    ];
    const blocking = listBlockingCustomFields(defs, { cp_nome_focal: "João Silva" });
    expect(blocking).toHaveLength(0);
  });
});

describe("countBusinessDaysFromTomorrowInclusive", () => {
  it("counts weekdays from day after fromYmd through toYmd inclusive", () => {
    expect(countBusinessDaysFromTomorrowInclusive("2025-03-10", "2025-03-12")).toBe(2);
    expect(countBusinessDaysFromTomorrowInclusive("2025-03-10", "2025-03-11")).toBe(1);
    expect(countBusinessDaysFromTomorrowInclusive("2025-03-10", "2025-03-10")).toBe(0);
  });

  it("skips weekend days in the range", () => {
    // Fri 2025-03-14 -> from tomorrow Sat (not counted), Sun (not), Mon (count 1), Tue (count 2)
    expect(countBusinessDaysFromTomorrowInclusive("2025-03-14", "2025-03-18")).toBe(2);
  });
});
