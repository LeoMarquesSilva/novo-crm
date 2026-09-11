import { z } from "zod";

/** Only CRM field codes are accepted, never raw OOXML/template overrides. */
export const proposalRenderRequestSchema = z.object({
  templateId: z.string().uuid().optional(),
  generatedAt: z.iso.datetime({ offset: true }).optional(),
  responsavel: z.string().trim().max(160).optional(),
});

export const proposalDraftRequestSchema = proposalRenderRequestSchema.extend({
  format: z.enum(["docx", "pdf"]).default("docx"),
  draftValues: z.record(z.string().regex(/^cp_[a-z0-9_]+$/), z.string().max(200_000)).optional(),
});

export const PROPOSAL_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PROPOSAL_PDF_UNAVAILABLE = "PDF temporariamente indisponível: é necessária a conversão do Word oficial para PDF.";
