export type UserRole = "admin" | "comercial" | "controladoria" | "financeiro";

export type DemandType = "novo_lead" | "novo_contrato" | "aditivo";

export type OpportunityStage =
  | "cadastro_lead"
  | "levantamento_dados"
  | "compilacao"
  | "revisao"
  | "due_diligence_finalizada"
  | "reuniao"
  | "confeccao_proposta"
  | "proposta_enviada"
  | "confeccao_contrato"
  | "contrato_elaborado"
  | "contrato_enviado"
  | "contrato_assinado"
  | "aguardando_cadastro"
  | "cadastro_novo_cliente"
  | "inclusao_faturamento"
  | "boas_vindas"
  | "reuniao_kickoff";

export interface Cliente {
  id: string;
  razaoSocial: string;
  documento: string;
  emailPrincipal: string;
  telefonePrincipal: string;
}

export interface Contrato {
  id: string;
  clienteId: string;
  titulo: string;
  status: "rascunho" | "enviado" | "assinado";
}

export interface Oportunidade {
  id: string;
  clienteId?: string;
  contratoBaseId?: string;
  tipo: DemandType;
  etapa: OpportunityStage;
  haveraDueDiligence: boolean;
  solicitante: string;
  criadoEm: string;
  /** Última atualização da oportunidade no banco (útil para SLA / dias na etapa). */
  atualizadoEm?: string;
  /** Nome do solicitante conforme campo customizado do RD (quando disponível). */
  solicitanteRd?: string | null;
  /**
   * Aproximação de “tempo parado”: dias corridos desde a referência usada.
   * Leads do RD usam `deal.updated_at` da API quando disponível no último sync;
   * demais usam `oportunidades.updated_at` no CRM (ver docs RD: oportunidade / deal).
   */
  diasNaEtapa?: number | null;
  /** Há reconciliação com oportunidade no RD Station CRM (import/webhook). */
  origemRd?: boolean;
  /** `deal.updated_at` retornado pelo RD no último sync (ISO), quando existir. */
  rdDealAtualizadoEm?: string | null;
  /** E-mail do responsável no RD (campo "Cadastro realizado por"). */
  rdOwnerEmail?: string | null;
  /** Usuário interno associado ao e-mail do RD (quando encontrado). */
  ownerUserId?: string | null;
  ownerUserName?: string | null;
  /** Foto do responsável interno (`app_users.avatar_url`), via e-mail do RD. */
  ownerUserAvatarUrl?: string | null;
  /**
   * Usuário interno ligado ao solicitante: `criado_por` ou mesmo e-mail em `app_users` / Auth
   * (`solicitante_email`). Não confundir com `solicitante` (nome do lead no cadastro).
   */
  /** `app_users.id` quando `criado_por` ou resolvido por e-mail do solicitante. */
  solicitanteUsuarioId?: string | null;
  solicitanteUsuarioNome?: string | null;
  solicitanteUsuarioAvatarUrl?: string | null;
  /** Encerramento comercial explícito (ex.: perdido antes de contrato assinado). */
  encerramento?: "ganho" | "perdido";
  /** Motivo de perda vindo do RD (`deal_lost_reason.name`), quando houver. */
  motivoPerda?: string | null;
  /** Link da proposta (SharePoint / Vios), preenchido ao avançar para proposta enviada. */
  linkProposta?: string | null;
  /** Link do contrato ao avançar etapas de contrato elaborado/assinado. */
  linkContrato?: string | null;
  /** Signatários D4Sign desnormalizados (para o kanban sem join extra). */
  d4signSigners?: Array<{
    email: string;
    key_signer: string | null;
    signed: boolean;
    signed_at: string | null;
    /** Papel do signatário no contrato (CONTRATADA = firma; CONTRATANTE = cliente). */
    role?: "CONTRATADA" | "CONTRATANTE" | null;
    /** Nome para exibição (ex.: sócio da firma). */
    name?: string | null;
  }> | null;
  /** Última atualização D4Sign (envio ou webhook de assinatura). */
  d4signUpdatedAt?: string | null;
  /** Status D4Sign desnormalizado (`sent`, `3`, `1`, etc.). */
  d4signStatus?: string | null;
  /** Revisão Societário e Contratos (etapas de elaboração do contrato). */
  contractReviewSummary?: {
    status: "pendente" | "em_revisao" | "concluido";
    prazoRevisao: string | null;
    concluidoEm: string | null;
  } | null;
  /** Progresso do levantamento DUE por área, quando aplicável. */
  dueAreaTasksSummary?: {
    total: number;
    disponibilizados: number;
    atrasados: number;
  } | null;
  /** Por área: entregue / atraso (Kanban). */
  dueAreaTasksBreakdown?: Array<{
    areaKey: string;
    entregue: boolean;
    emAtraso: boolean;
    semProcessosAtivos: boolean;
  }> | null;
  /** Progresso da revisão DUE (ciclo atual), quando o lead está em revisão. */
  dueAreaReviewSummary?: {
    total: number;
    reviewed: number;
    pending: number;
  } | null;
  /** Por área: revisão concluída ou pendente no ciclo atual. */
  dueAreaReviewBreakdown?: Array<{
    areaKey: string;
    reviewed: boolean;
    requestedAdjustments: boolean;
  }> | null;
  /** Ajustes solicitados na última revisão (usado no card quando voltou para compilação). */
  dueReviewAdjustments?: Array<{
    areaKey: string;
    observacaoAjustes: string | null;
    respondedAt: string | null;
    adjustmentCompletedAt: string | null;
  }> | null;
  /** Dados da reunião para etapas finais da DUE. */
  localReuniao?: string | null;
  dataReuniao?: string | null;
  horarioReuniao?: string | null;
  /** Progresso do envio de dados por área para elaboração da proposta. */
  propostaEscopoSummary?: {
    total: number;
    concluido: number;
    pendente: number;
  } | null;
  propostaEscopoBreakdown?: Array<{
    areaKey: string;
    concluido: boolean;
  }> | null;
}

export interface Indicador {
  id: string;
  nome: string;
  status: "pendente_aprovacao" | "aprovado" | "mesclado";
  solicitanteNome?: string | null;
  leadNome?: string | null;
  solicitadoEm?: string | null;
  oportunidadeId?: string | null;
}
