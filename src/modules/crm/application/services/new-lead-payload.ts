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
    contexto_comercial: z.string().optional().nullable(),
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
  });

export type NewLeadPayload = z.infer<typeof newLeadPayloadSchema>;
