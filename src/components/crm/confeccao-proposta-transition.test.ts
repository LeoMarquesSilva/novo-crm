import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "@/components/crm/dynamic-form";

import {
  buildTransitionFieldPayload,
  prepareConfeccaoFieldValues,
  visibleTransitionCustomFields,
  withConfeccaoQualificacao,
} from "./confeccao-proposta-transition";

function def(field_code: string, extra: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: field_code,
    field_code,
    label: `${field_code} [CP]`,
    field_type: "text",
    is_required: false,
    condition_json: null,
    field_options: [],
    sort_order: 0,
    stage_code: "confeccao_proposta",
    pipeline_code: "vendas",
    is_active: true,
    ...extra,
  } as FieldDefinition;
}

// Como estão no banco: o link da DUE só vale com "Realizou Due Diligence?" = Sim.
const defs = [
  def("cp_proposta_empresas_json", { field_type: "textarea", is_required: true }),
  def("cp_escopo_detalhe_json", { field_type: "textarea" }),
  def("cp_realizou_due", { field_type: "select" }),
  def("cp_link_arquivo_due", {
    field_type: "url",
    is_required: true,
    condition_json: { type: "field_equals", field: "cp_realizou_due", value: "Sim" },
  }),
  def("cp_campo_extra"),
  def("cp_inativo", { is_active: false }),
];

describe("campos do modal Reunião → Confecção de Proposta", () => {
  const codes = (values: Record<string, string>, reuniaoConfeccao = true) =>
    visibleTransitionCustomFields(defs, values, { nextStage: "confeccao_proposta", reuniaoConfeccao }).map(
      (f) => f.field_code,
    );

  it("sem DUE não mostra o link do arquivo DUE nem os JSON do bloco dedicado", () => {
    expect(codes({ cp_realizou_due: "Nao" })).toEqual(["cp_campo_extra"]);
  });

  it("com DUE realizada pede o link", () => {
    expect(codes({ cp_realizou_due: "Sim" })).toContain("cp_link_arquivo_due");
  });

  it("fora do passo Reunião → Confecção só respeita condição e campo ativo", () => {
    expect(codes({ cp_realizou_due: "Nao" }, false)).toEqual([
      "cp_proposta_empresas_json",
      "cp_escopo_detalhe_json",
      "cp_realizou_due",
      "cp_campo_extra",
    ]);
  });

  it("confecção de contrato não pede campos no modal", () => {
    expect(
      visibleTransitionCustomFields(defs, {}, { nextStage: "confeccao_contrato", reuniaoConfeccao: false }),
    ).toEqual([]);
  });

  it("grava os campos visíveis e os do bloco dedicado que têm valor", () => {
    const values = prepareConfeccaoFieldValues({
      fieldValues: { cp_campo_extra: " x ", cp_link_arquivo_due: "https://due", cp_areas_objeto: '["Cível"]' },
      empresasIntake: [{ index: 0, razao_social: "ACME", tipo_documento: "CNPJ", documento: "1" }],
    });
    const payload = buildTransitionFieldPayload({
      visibleFields: visibleTransitionCustomFields(defs, values, {
        nextStage: "confeccao_proposta",
        reuniaoConfeccao: true,
      }),
      values,
      reuniaoConfeccao: true,
    });
    expect(payload).toEqual({
      cp_campo_extra: "x",
      cp_areas_objeto: ["Cível"],
      cp_proposta_empresas_json: JSON.stringify({ primaryIndex: 0, extras: [] }),
    });
  });
});

describe("contratantes no avanço para a proposta", () => {
  const empresasIntake = [
    { index: 1, razao_social: "VINICIUS", tipo_documento: "CPF" as const, documento: "111.444.777-35" },
    { index: 2, razao_social: "ANDRE", tipo_documento: "CPF" as const, documento: "123.456.789-09" },
  ];

  it("sem escolha, grava as outras pessoas do cadastro como contratantes e as cita na qualificação", () => {
    const values = withConfeccaoQualificacao({
      customValues: { cp_proposta_empresas_json: JSON.stringify({ primaryIndex: 1, extras: [] }) },
      empresasIntake,
    });
    expect(JSON.parse(String(values.cp_proposta_empresas_json))).toEqual({
      primaryIndex: 1,
      extras: [],
      contratantes: [2],
    });
    expect(values.cp_qualificacao).toContain("— Contratante (cadastro): ANDRE (CPF 123.456.789-09)");
  });

  it("respeita quem foi desmarcado", () => {
    const values = withConfeccaoQualificacao({
      customValues: { cp_proposta_empresas_json: JSON.stringify({ primaryIndex: 1, extras: [], contratantes: [] }) },
      empresasIntake,
    });
    expect(JSON.parse(String(values.cp_proposta_empresas_json)).contratantes).toEqual([]);
    expect(values.cp_qualificacao).not.toContain("ANDRE");
  });
});
