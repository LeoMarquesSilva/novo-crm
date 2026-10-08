import { z } from "zod";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";

/** Mesmas opções que `cp_areas_objeto` e `PROPOSAL_SCOPE_OPTIONS` (`crm-areas.ts`). */
export const leadAreas = CRM_PRACTICE_AREAS;

export const leadTypes = [
  "Indicacao",
  "Lead Ativa",
  "Lead Digital",
  "Lead Passiva",
  "Cross Selling",
] as const;

export const indicationTypes = [
  "Fundo",
  "Consultor",
  "Cliente",
  "Contador",
  "Sindicatos",
  "Conselhos profissionais",
  "Colaborador",
  "Outros parceiros",
] as const;

/** Subtipo de Lead Digital. A chave gravada é o próprio rótulo. */
export const leadDigitalPlatforms = ["Instagram", "LinkedIn", "Site"] as const;

const companySchema = z.object({
  tipo_documento: z.enum(["CPF", "CNPJ"]),
  razao_social: z.string().trim().min(1, "Razão social é obrigatória."),
  documento: z.string().trim().min(1, "CPF/CNPJ é obrigatório."),
});

export const newLeadPayloadSchema = z
  .object({
    solicitante: z.string().trim().min(1),
    email: z.string().email(),
    cadastrado_por: z.string().email(),
    due_diligence: z.enum(["Sim", "Nao"]),
    data_entrega_due: z.string().optional().nullable(),
    horario_entrega_due: z.string().optional().nullable(),
    empresas: z.array(companySchema).min(1),
    areas_analise: z.array(z.enum(leadAreas)).min(1),
    local_reuniao: z.string().trim().min(1),
    data_reuniao: z.string().optional().nullable(),
    horario_reuniao: z.string().optional().nullable(),
    tipo_de_lead: z.enum(leadTypes),
    tipo_indicacao: z.enum(indicationTypes).optional().nullable(),
    nome_indicacao: z.string().optional().nullable(),
    plataforma: z.enum(leadDigitalPlatforms).optional().nullable(),
    area_cross_selling: z.enum(leadAreas).optional().nullable(),
    decisor: z.string().trim().optional().nullable(),
    contexto_comercial: z.string().optional().nullable(),
    /** Cliente da carteira quando o CNPJ/CPF já existe na base. */
    cliente_id: z.string().uuid().optional().nullable(),
    /** Contrato base quando a demanda for aditivo. */
    contrato_base_id: z.string().uuid().optional().nullable(),
    relacao_contrato: z.enum(["novo", "aditivo"]).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.due_diligence === "Sim") {
      if (!value.data_entrega_due) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data_entrega_due"],
          message: "Data de entrega é obrigatória quando houver due diligence.",
        });
      }

      if (!value.horario_entrega_due) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["horario_entrega_due"],
          message: "Horário de entrega é obrigatório quando houver due diligence.",
        });
      }

      if (!value.data_reuniao) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data_reuniao"],
          message:
            "Data da reunião é obrigatória quando houver due diligence.",
        });
      }

      if (value.data_entrega_due && value.data_reuniao) {
        const dueDate = new Date(`${value.data_entrega_due}T00:00:00`);
        const meetingDate = new Date(`${value.data_reuniao}T00:00:00`);
        const minMeetingDate = new Date(dueDate);

        do {
          minMeetingDate.setDate(minMeetingDate.getDate() + 1);
        } while ([0, 6].includes(minMeetingDate.getDay()));

        if (meetingDate < minMeetingDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data_reuniao"],
            message:
              "Data da reunião deve ser no próximo dia útil (ou posterior) após o prazo da base.",
          });
        }
      }
    }

    if (value.cliente_id && value.relacao_contrato === "aditivo" && !value.contrato_base_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contrato_base_id"],
        message: "Selecione o contrato base para aditivo.",
      });
    }

    if (value.tipo_de_lead === "Indicacao") {
      if (!value.tipo_indicacao) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tipo_indicacao"],
          message: "Tipo de indicação é obrigatório para lead por indicação.",
        });
      }

      if (!value.nome_indicacao?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nome_indicacao"],
          message: "Nome da indicação é obrigatório para lead por indicação.",
        });
      }
    }

    if (value.tipo_de_lead === "Lead Digital" && !value.plataforma) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plataforma"],
        message: "Plataforma é obrigatória para Lead Digital.",
      });
    }

    if (value.tipo_de_lead === "Cross Selling" && !value.area_cross_selling) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["area_cross_selling"],
        message: "Área é obrigatória para Cross Selling.",
      });
    }
  });

export type NewLeadPayload = z.infer<typeof newLeadPayloadSchema>;
