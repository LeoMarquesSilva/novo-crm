/**
 * Rascunho da apresentação da DUE (o que o usuário escolhe/edita no CRM).
 * Os números vêm sempre das planilhas (due_documents, kind planilha_area); aqui só
 * ficam escolhas, textos editados e o formulário da Reestruturação (que não tem
 * planilha). O logo do cliente é o último due_documents kind logo_cliente.
 */
import { z } from "zod";
import { DUE_AREA_IDS, type DueAreaId } from "./areas";

const texto = (max = 4000) => z.string().max(max).default("");
const valor = z.number().finite().nullable().default(null);

export const varianteSchema = z.enum(["auto", "painel", "detalhe", "lista"]);
export type VarianteEscolha = z.infer<typeof varianteSchema>;

export const areaDraftSchema = z.object({
  incluir: z.boolean().default(true),
  variante: varianteSchema.default("auto"),
  /** Textos editados (chave → texto). Ausente = usa o texto gerado. */
  textos: z.record(z.string().max(120), z.string().max(8000)).default({}),
});
export type AreaDraft = z.infer<typeof areaDraftSchema>;

export const reestruturacaoSchema = z.object({
  autos: texto(200),
  recuperandas: texto(2000),
  competencia: texto(1000),
  juiz: texto(200),
  relator: texto(200),
  administrador: texto(300),
  resumo: texto(1000),
  passivoTotal: valor,
  deferimento: texto(40),
  ajuizamento: texto(40),
  foro: texto(200),
  classes: z
    .array(z.object({ classe: texto(200), edital: valor, aj: valor }))
    .max(20)
    .default([]),
  extraconcursalEdital: valor,
  extraconcursalAj: valor,
  endividamentoResumo: texto(1000),
  pagamento: z
    .array(
      z.object({
        classe: texto(200),
        desagio: texto(200),
        carencia: texto(200),
        forma: texto(400),
        atualizacao: texto(300),
      }),
    )
    .max(20)
    .default([]),
  opcoes: z
    .array(
      z.object({
        rotulo: texto(60),
        titulo: texto(200),
        contrapartida: texto(1500),
        condicoes: texto(300),
        obs: texto(600),
      }),
    )
    .max(2)
    .default([]),
  medidas: z
    .array(
      z.object({
        categoria: texto(60),
        titulo: texto(200),
        destaque: texto(120),
        preve: texto(600),
        objetivo: texto(400),
      }),
    )
    .max(3)
    .default([]),
});
export type ReestruturacaoForm = z.infer<typeof reestruturacaoSchema>;

export const draftSchema = z.object({
  versao: z.literal(1).default(1),
  capa: z
    .object({
      razaoSocial: texto(300),
      cnpj: texto(40),
      empresas: z.array(z.object({ razaoSocial: texto(300), cnpj: texto(40) })).max(3).default([]),
    })
    .default({ razaoSocial: "", cnpj: "", empresas: [] }),
  areas: z.partialRecord(z.enum(DUE_AREA_IDS), areaDraftSchema).default({}),
  reestruturacao: reestruturacaoSchema.default(reestruturacaoSchema.parse({})),
});
export type DueApresentacaoDraft = z.infer<typeof draftSchema>;

export function emptyDraft(): DueApresentacaoDraft {
  return draftSchema.parse({});
}

export function areaDraft(draft: DueApresentacaoDraft, area: DueAreaId): AreaDraft {
  return draft.areas[area] ?? areaDraftSchema.parse({});
}
