/** Gate de envio D4Sign — exige revisão Societário e Contratos concluída. */

export type ContractReviewTaskStatus = "pendente" | "em_revisao" | "concluido";

export type ContractReviewTaskLike = {
  status: ContractReviewTaskStatus;
  prazo_revisao?: string | null;
  concluido_em?: string | null;
} | null;

export function isContractReviewApproved(
  reviewTask: ContractReviewTaskLike,
): boolean {
  return reviewTask?.status === "concluido";
}

export function getContractSendBlockReason(
  reviewTask: ContractReviewTaskLike,
): string | null {
  if (!reviewTask) {
    return "Salve o contrato com prazo de revisão no builder — a área Societário e Contratos precisa revisar antes do envio.";
  }
  if (reviewTask.status === "pendente") {
    return "Aguardando a área Societário e Contratos iniciar a revisão do contrato.";
  }
  if (reviewTask.status === "em_revisao") {
    return "Revisão em andamento — aguarde o ok (conclusão) da área Societário e Contratos.";
  }
  return null;
}

export function canSendContractToD4Sign(input: {
  reviewTask: ContractReviewTaskLike;
  pendingFieldCount: number;
}): boolean {
  if (input.pendingFieldCount > 0) return false;
  return isContractReviewApproved(input.reviewTask);
}
