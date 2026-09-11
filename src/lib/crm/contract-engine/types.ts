export type ContractPartyRole = "contratante" | "relacionada";

export type ContractingPartyAddress = {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

export type ContractingParty = {
  id: string;
  razaoSocial: string;
  documento: string;
  documentoTipo: "CPF" | "CNPJ";
  endereco: ContractingPartyAddress;
  role: ContractPartyRole;
  source: "intake" | "proposta_extra";
};

export type FirmRepresentative = {
  name: string;
  oab: string;
  email: string;
};

export type FirmBankAccount = {
  banco: string;
  agencia: string;
  conta: string;
  titular: string;
  cnpj: string;
  pix: string;
};

export type FirmParty = {
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  bank: FirmBankAccount;
  representatives: FirmRepresentative[];
};

export type ContractTermKind =
  | "fixed_months"
  | "fixed_days"
  | "until_deliverable"
  | "until_deliverable_with_estimate"
  | "indefinite"
  | "manual";

export type ContractTermRule = {
  kind: ContractTermKind;
  months?: number;
  days?: number;
  deliverable?: string;
  estimateLabel?: string;
};

export type ContractStartKind = "on_signature" | "on_first_payment" | "on_defined_date";

export type ContractStartRule = {
  kind: ContractStartKind;
  date?: string;
};

export type ClauseRole =
  | "object"
  | "scope"
  | "limitation"
  | "exclusion"
  | "nature"
  | "contracted_obligation"
  | "contracting_obligation"
  | "payment"
  | "default"
  | "term"
  | "termination"
  | "expense"
  | "compliance"
  | "general"
  | "special";

export type ClauseCatalogStatus = "pending_legal_review" | "approved" | "retired";

export type ClauseOrigin = "standard" | "profile" | "manual" | "payment_engine";

export type ContractClauseTemplate = {
  stableKey: string;
  title: string;
  content: string;
  role: ClauseRole;
  category: string;
  version: number;
  status: ClauseCatalogStatus;
  sortOrder: number;
  isRequired: boolean;
  placeholders: string[];
  conflictsWithSubtypeIds: string[];
  legalReviewNote: string;
};

export type ContractObjectMode = "simple" | "subscope" | "complex";

export type ContractObjectFieldType = "text" | "currency" | "date" | "number";

export type ContractObjectFieldSource =
  | "proposal"
  | "intake"
  | "opportunity"
  | "company"
  | "process"
  | "manual"
  | "unresolved";

export type ContractRequiredField = {
  key: string;
  label: string;
  type: ContractObjectFieldType;
  required: boolean;
  sourceHints: ContractObjectFieldSource[];
};

export type ContractScopeProfile = {
  scopeSubtypeId: string;
  label: string;
  instrumentType: string;
  areaSortOrder: number;
  typeSortOrder: number;
  subtypeSortOrder: number;
  objectDefinition: {
    mode: ContractObjectMode;
    objectBlockKeys: string[];
    objectGroupKey?: string;
  };
  requiredContractFields: ContractRequiredField[];
  objectClauseKeys: string[];
  scopeClauseKeys: string[];
  limitationClauseKeys: string[];
  exclusionClauseKeys: string[];
  natureClauseKeys: string[];
  contractedObligationKeys: string[];
  contractingObligationKeys: string[];
  defaultTermRule: ContractTermRule;
  defaultStartRule: ContractStartRule;
  active: boolean;
  status: ClauseCatalogStatus;
};

export type ProposalScopeRef = {
  entryId: string;
  areaLabel: string;
  typeId: string;
  subtypeId: string;
  label: string;
  placeholders: Record<string, string>;
};

export type ContractObjectBlockKind =
  | "paragraph"
  | "subscope"
  | "ordered_list"
  | "limitation"
  | "paragraph_unique";

export type ContractObjectListStyle = "decimal" | "roman";

export type ContractObjectBlock = {
  kind: ContractObjectBlockKind;
  stableKey: string;
  title?: string;
  content: string;
  intro?: string;
  items?: string[];
  listStyle?: ContractObjectListStyle;
  order: number;
  scopeEntryId?: string;
  scopeSubtypeId?: string;
  sourceLabel: string;
  version: number;
  status: ClauseCatalogStatus;
  opensSubscopeGroup?: boolean;
};

export type NumberedObjectLine = {
  number: string;
  title?: string;
  content: string;
  kind: ContractObjectBlockKind;
  stableKey: string;
  scopeEntryId?: string;
  sourceLabel: string;
  version: number;
};

export type ContractObjectOverride = {
  blockStableKey: string;
  baseClauseVersion: number;
  originalContent: string;
  overrideContent: string;
  reason: string;
  changedBy: string;
  changedByName?: string;
  changedAt: string;
};

export type ContractObjectFieldValue = {
  key: string;
  label: string;
  value: string;
  source: ContractObjectFieldSource;
  required: boolean;
  scopeEntryId?: string;
};

export type ContractObjectCoverage = {
  ok: boolean;
  representedScopes: string[];
  missingScopes: string[];
  unexpectedScopes: string[];
};

export type ContractObjectStatus = "complete" | "incomplete" | "missing_profile" | "overridden";

export type CanonicalContractObject = {
  blocks: ContractObjectBlock[];
  numberedLines: NumberedObjectLine[];
  representedScopeIds: string[];
  missingScopeIds: string[];
  unexpectedScopeIds: string[];
  status: ContractObjectStatus;
  missingRequiredFields: string[];
  fieldValues: ContractObjectFieldValue[];
  overrides: ContractObjectOverride[];
  compositionKey: string | null;
};

export type ContractObjectCompositionProfile = {
  key: string;
  label: string;
  requiredSubtypeKeys: string[];
  compositionMode: "explicit_only";
  generalObjectKey: string;
  paragraphUniqueKey?: string;
  evidenceKeys: string[];
};

export type ContractScopeAdjustment = {
  removedEntryIds: string[];
  addedScopes: ProposalScopeRef[];
  reason: string;
  changedBy: string;
  changedByName?: string;
  changedAt: string;
};

export type ContractEngineEventType =
  | "contract_object_resolved"
  | "contract_object_field_completed"
  | "contract_object_overridden"
  | "contract_scope_removed_from_object"
  | "contract_scope_added_to_object";

export type ContractEngineEvent = {
  type: ContractEngineEventType;
  at: string;
  actorId: string | null;
  actorName?: string;
  payload: Record<string, unknown>;
};

export type ContractScope = ProposalScopeRef & {
  profile: ContractScopeProfile | null;
  missingProfile: boolean;
};

export type ContractInvestmentItem = {
  id: string;
  tipoId: string;
  subtipoId: string;
  placeholders: Record<string, string>;
  amount: number | null;
};

export type ContractInvestment = {
  items: ContractInvestmentItem[];
  totalAmount: number | null;
  totalExtenso: string;
  tributacao: string;
};

export type ContractPaymentMethod = "boleto" | "transferencia" | "pix" | "combinado" | "indefinido";

export type ContractPayment = {
  method: ContractPaymentMethod;
  clauseText: string;
  firstDueDate: string | null;
  installmentCount: number | null;
  downPayment: number | null;
  arithmeticOk: boolean;
  arithmeticNote: string | null;
};

export type ResolvedContractClause = {
  stableKey: string;
  title: string;
  content: string;
  role: ClauseRole;
  origin: ClauseOrigin;
  sourceLabel: string;
  version: number;
  status: ClauseCatalogStatus;
  profileSubtypeId?: string;
  placeholdersUsed: string[];
};

export type NumberedContractSection = {
  number: string;
  title: string;
  clauses: ResolvedContractClause[];
};

export type ContractOverride = {
  field: string;
  proposalValue: string;
  contractValue: string;
  justification: string;
  changedBy: string;
  changedAt: string;
};

export type ContractGeneration = {
  city: string;
  generatedAt: string;
  localDateLabel: string;
};

export type CanonicalContractData = {
  opportunityId: string;
  proposalSnapshotId: string;
  contractingParties: ContractingParty[];
  contractedFirm: FirmParty;
  scopes: ContractScope[];
  investment: ContractInvestment;
  payment: ContractPayment;
  term: ContractTermRule;
  startRule: ContractStartRule;
  clauses: ResolvedContractClause[];
  sections: NumberedContractSection[];
  signers: FirmRepresentative[];
  generation: ContractGeneration;
  overrides: ContractOverride[];
  contractObject: CanonicalContractObject;
  scopeAdjustment: ContractScopeAdjustment | null;
  engineEvents: ContractEngineEvent[];
};

export type AlignmentIssue = {
  code: string;
  message: string;
};

export type ProposalContractAlignment = {
  ok: boolean;
  blockers: AlignmentIssue[];
  warnings: AlignmentIssue[];
};

export type ContractEnginePendencia = {
  code: string;
  label: string;
  ok: boolean;
};

export type CanonicalContractBuildResult = {
  data: CanonicalContractData;
  alignment: ProposalContractAlignment;
  pendencias: ContractEnginePendencia[];
};
