export type ContractDraftInput = {
  opportunityId: string;
  clientId: string | null;
  title: string;
};

export interface ContractDraftRepository<TDraft> {
  findByOpportunityId(opportunityId: string): Promise<TDraft | null>;
  createDraft(input: ContractDraftInput): Promise<TDraft>;
}

export async function ensureContractDraft<TDraft>(
  repository: ContractDraftRepository<TDraft>,
  input: ContractDraftInput,
): Promise<TDraft> {
  const existing = await repository.findByOpportunityId(input.opportunityId);
  return existing ?? repository.createDraft(input);
}
