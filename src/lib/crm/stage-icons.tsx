import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileCheck,
  FilePen,
  FileText,
  Handshake,
  PartyPopper,
  Receipt,
  Send,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

export const OPPORTUNITY_STAGE_ICONS: Record<OpportunityStage, LucideIcon> = {
  cadastro_lead: UserPlus,
  levantamento_dados: ClipboardList,
  compilacao: FileText,
  revisao: Eye,
  due_diligence_finalizada: ClipboardCheck,
  reuniao: Calendar,
  confeccao_proposta: FilePen,
  proposta_enviada: Send,
  confeccao_contrato: FileText,
  contrato_elaborado: FileCheck,
  contrato_enviado: Send,
  contrato_assinado: Handshake,
  aguardando_cadastro: Sparkles,
  cadastro_novo_cliente: Users,
  inclusao_faturamento: Receipt,
  boas_vindas: PartyPopper,
  reuniao_kickoff: Calendar,
};

export function getStageIcon(etapa: OpportunityStage | string): LucideIcon {
  return OPPORTUNITY_STAGE_ICONS[etapa as OpportunityStage] ?? Sparkles;
}
