# Gerenciador de Contratos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o módulo de gestão contratual e faturamento do CRM, com cadastro-base idempotente após assinatura, configuração financeira completa em `inclusao_faturamento`, carteira, versões, cálculo mensal auditável, rateios, renovações e registro manual do lançamento no VIOS, preservando o painel D4Sign atual.

**Architecture:** Criar um bounded context `contracts` com domínio puro para dinheiro, validação, projeção e cálculo; persistência relacional versionada no Supabase; mutações críticas em RPCs transacionais; Route Handlers autenticados como borda; páginas server-side dinâmicas com ilhas client-side para formulários. O contrato assinado cria apenas identidade + versão rascunho. A ativação da versão e a transição `inclusao_faturamento -> boas_vindas` acontecem atomicamente.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Zod 4, Supabase/PostgreSQL, Vitest, Tailwind v4 e componentes shadcn existentes.

**Spec:** `docs/superpowers/specs/2026-08-12-gerenciador-contratos-design.md`

---

## Global Constraints

- Trabalhar em `C:\bkp\doc\new-crm\crm`, na branch de feature atual; não publicar nem aplicar migration no Supabase remoto sem autorização explícita.
- Antes da primeira mudança comportamental, atualizar `docs/system-context.md`; mantê-lo sincronizado até o encerramento.
- Ler novamente, imediatamente antes de implementar cada borda Next.js afetada, os documentos locais relevantes em `node_modules/next/dist/docs/`. Para este plano: `01-app/01-getting-started/15-route-handlers.md`, `01-app/02-guides/forms.md` e `01-app/01-getting-started/08-caching.md`.
- Route Handlers e Server Actions sempre revalidam autenticação e autorização no servidor; esconder botão na UI não é controle de acesso.
- Manter `/crm/contratos` como rota dinâmica. Não usar `use cache` para contrato, permissão, fechamento ou alerta por usuário.
- Valores monetários persistem em `numeric(15,2)`, percentuais em `numeric(9,4)`, quantidades em `numeric(15,4)` e datas contratuais em `date`. No domínio, converter valores decimais para `bigint` de centavos e percentuais para unidades inteiras de quatro casas antes de calcular; nunca somar `number` de ponto flutuante como dinheiro. Route Handlers/repositórios convertem `bigint` de volta para string decimal antes de serializar JSON ou persistir.
- JSON só pode guardar fotografia da origem (`origem_snapshot`) e metadados auxiliares; regras de cobrança, parcelas, áreas, rateios, participações, comissões, consumos e itens de fechamento são linhas relacionais.
- Etiquetas são `text[]` para busca/classificação; nenhuma etiqueta ativa regra financeira.
- Versão ativada e revisão aprovada são imutáveis. Correções criam nova versão/revisão; nenhum update retroativo.
- Excedente sem preço resulta em valor automático zero + pendência bloqueante; não inferir tarifa.
- Participação societária e comissão permanecem estruturas e itens distintos.
- O VIOS continua responsável por emissão, contas a receber e pagamentos. O CRM armazena somente referência, URL opcional, data e autor do lançamento.
- O CRM cria tarefas internas de renovação; não envia mensagem automática ao cliente nesta entrega.
- Preservar alterações não relacionadas e os diretórios/arquivos não rastreados já existentes. Cada commit deve adicionar somente os arquivos da tarefa corrente.
- Após cada tarefa: executar o teste focado, revisar `git diff --check` e fazer o commit indicado. Antes de concluir: `npm run lint`, `npm run test` e `npm run build`.

## Canonical model and invariants

### Statuses

```ts
export type ContractLifecycleStatus =
  | "rascunho"
  | "em_revisao"
  | "ativo"
  | "suspenso"
  | "encerrado";

export type ContractVersionStatus = "rascunho" | "ativa" | "substituida" | "cancelada";

export type ClosingRevisionStatus =
  | "a_calcular"
  | "em_revisao"
  | "aprovado"
  | "lancado_vios"
  | "cancelado";
```

`contratos.status_assinatura` preserva o enum atual `contract_status`. O novo `contratos.status` usa `contract_lifecycle_status`; assinatura e operação não compartilham o mesmo estado.

### Billing component types

```ts
export type BillingComponentKind =
  | "mensal_fixo"
  | "mensal_preco_fechado"
  | "mensal_escalonado"
  | "variavel_processo"
  | "variavel_hora"
  | "mensal_condicionado"
  | "spot"
  | "manutencao"
  | "exito_percentual"
  | "exito_valor_fixo"
  | "acordo"
  | "despesa_km"
  | "reembolso"
  | "ajuste";

export type VariableChargeMode = "quantidade_total" | "excedente";
export type AllocationMode = "percentual" | "valor";
```

### Permission matrix

| Capability | admin | controladoria | financeiro | comercial |
|---|---:|---:|---:|---:|
| Consultar contrato/memória | sim | sim | sim | sim |
| Configurar/ativar/versionar/suspender | sim | sim | não | não |
| Informar consumo/preparar fechamento | sim | sim | sim | não |
| Aprovar fechamento | sim | sim | não | não |
| Registrar referência VIOS | sim | sim | sim | não |
| Concluir renovação/aditivo | sim | sim | não | não |

### Persistence map

| Table | Required core columns and constraints |
|---|---|
| `contratos` | rename `status` to `status_assinatura`; add `oportunidade_id unique`, nullable `cliente_id`, lifecycle `status`, `versao_ativa_id`, nullable draft dates, billing lead days, renewal/reajuste data, annual reference/override + reason, `etiquetas text[]`, D4Sign/SharePoint/VIOS references, audit timestamps/users |
| `contrato_responsaveis` | contract, role, optional `app_user_id`, name/email/phone/position; unique contract+role+identity |
| `contrato_versoes` | contract, sequential number, status, nullable `vigente_de/ate` while draft, source snapshot, activation/substitution audit; unique contract+number; active version requires `vigente_de` and cannot overlap another active period |
| `contrato_areas` | version, canonical area, process/hour inclusions, excess rates, km rate, tracking flags and notes; unique version+area |
| `contrato_componentes_cobranca` | version, group id for stepped ranges, kind, recurrence, period, fixed/unit value, included quantity, percentage/base, manual release flags, tax/share/commission eligibility, sort order |
| `contrato_parcelas` | component, installment number, competency, due date, value; unique component+number |
| `contrato_rateios_area` | version, optional component override, area, mode, percentage/value; unique logical component+area |
| `contrato_participacoes_socios` | version, optional component override, partner/user, percentage, suggested rule and override reason |
| `contrato_comissoes` | version, optional component, beneficiary, percentage or amount, period, basis and reason |
| `contrato_consumos_mensais` | contract, version, competency (first day), optional component/area, kind (`processo`, `hora`, `quilometro`, `valor_manual`), quantity/value, evidence/note and author |
| `contrato_fechamentos` | unique contract+competency, current revision, operational status and timestamps |
| `contrato_fechamento_revisoes` | closing, sequential number, previous revision, status, totals, calculation/approval/VIOS audit and correction reason; unique closing+number |
| `contrato_fechamento_itens` | revision, item kind, source component/area, description, quantity/rate/percentage/amount, eligibility, blocker/resolution fields and auxiliary metadata |
| `contrato_alertas` | contract, optional closing, type, due/base dates, status, assignees, customer notified audit, decision, resolution and `idempotency_key unique` |
| `contrato_eventos` | contract, type, title/detail, actor, source/idempotency key and metadata snapshot |
| `aditivos` | keep current base-contract relationship; add nullable `versao_origem_id` and `versao_resultante_id` so an addendum can explain the exact version change |

---

### Task 1: Atualizar contexto e fixar autorização do módulo (TDD)

**Files:**
- Modify: `docs/system-context.md`
- Modify: `src/lib/auth/crm-access-policy.ts`
- Modify: `src/lib/auth/crm-access-policy.test.ts`

**Interfaces:**

```ts
export type ContractCapability =
  | "view"
  | "configure"
  | "prepare_closing"
  | "approve_closing"
  | "register_vios"
  | "manage_renewal";

export function canAccessContractCapability(input: {
  role: Database["public"]["Enums"]["user_role"];
  capability: ContractCapability;
}): boolean;
```

- [ ] **Step 1: Update `docs/system-context.md` before behavior changes.** Correct the stale claim that `/crm/contratos` is a mock: document its current D4Sign dashboard, the approved module boundary, the new post-sale billing gate, the permission matrix, and that remote migrations require explicit authorization.
- [ ] **Step 2: Write failing table-driven tests** covering every role/capability combination in the matrix above, plus an invalid role denied by default.
- [ ] **Step 3: Run `npm test -- src/lib/auth/crm-access-policy.test.ts`.** Expected: FAIL because `canAccessContractCapability` does not exist.
- [ ] **Step 4: Implement the policy as an exhaustive capability switch.** Do not infer access from `app_users.area`.
- [ ] **Step 5: Re-run the focused test and `git diff --check`.** Expected: PASS and no whitespace errors.
- [ ] **Step 6: Commit.**

```powershell
git add docs/system-context.md src/lib/auth/crm-access-policy.ts src/lib/auth/crm-access-policy.test.ts
git commit -m "docs: alinhar contexto do gerenciador de contratos"
```

---

### Task 2: Criar schema relacional, imutabilidade e tipos Supabase

**Files:**
- Create: `supabase/migrations/20260812120000_contract_management_schema.sql`
- Create: `supabase/migrations/20260812121000_contract_management_rls.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Migration contract:**

```sql
alter table public.contratos rename column status to status_assinatura;
alter table public.contratos alter column cliente_id drop not null;

create type public.contract_lifecycle_status as enum
  ('rascunho', 'em_revisao', 'ativo', 'suspenso', 'encerrado');
create type public.contract_version_status as enum
  ('rascunho', 'ativa', 'substituida', 'cancelada');
create type public.contract_closing_status as enum
  ('a_calcular', 'em_revisao', 'aprovado', 'lancado_vios', 'cancelado');

alter table public.contratos
  add column status public.contract_lifecycle_status not null default 'rascunho';
```

The migration must also create all tables in the persistence map, FK indexes, `set_updated_at` triggers, and these hard constraints:

```sql
create unique index contratos_oportunidade_unique
  on public.contratos (oportunidade_id)
  where oportunidade_id is not null;

create unique index contrato_fechamentos_competencia_unique
  on public.contrato_fechamentos (contrato_id, competencia);

alter table public.contrato_rateios_area add constraint contrato_rateio_one_value_check
  check (
    (modo = 'percentual' and percentual is not null and valor is null)
    or (modo = 'valor' and valor is not null and percentual is null)
  );

alter table public.contrato_fechamentos add constraint competencia_first_day_check
  check (date_trunc('month', competencia)::date = competencia);
```

Enable `btree_gist`, then use an exclusion constraint with `daterange(vigente_de, coalesce(vigente_ate, 'infinity'::date), '[]')` so versions in `ativa` state cannot overlap for the same contract. Add triggers that reject update/delete of active versions and revisions in `aprovado`/`lancado_vios`; the only allowed mutation of an approved revision is the exact `aprovado -> lancado_vios` transition filling VIOS reference/date/actor through the dedicated service-role RPC.

RLS rules:

- authenticated users may `select` all contract module tables;
- browser roles receive no direct insert/update/delete policy on the new financial tables;
- all writes go through authenticated Route Handlers using the service-role client after the policy in Task 1;
- preserve the current read behavior of `contratos` and `aditivos`; remove stale mutation policies only when their replacement is in this same migration.

- [ ] **Step 1: Write the schema migration** in dependency order: enums, altered `contratos`, identity/version tables, configuration tables, operational tables, indexes, triggers.
- [ ] **Step 2: Write the RLS migration** with one read policy per new table and explicit `revoke` for unsafe function/table grants where applicable.
- [ ] **Step 3: Update `database.types.ts`** with exact Row/Insert/Update shapes, Relationships and enums introduced by these two migrations. Do not loosen types with `Record<string, unknown>`.
- [ ] **Step 4: Run `npx tsc --noEmit`.** Expected: PASS; this task does not apply the migration remotely.
- [ ] **Step 5: Inspect the SQL for unsafe mutable approved records** and run `git diff --check`.
- [ ] **Step 6: Commit.**

```powershell
git add supabase/migrations/20260812120000_contract_management_schema.sql supabase/migrations/20260812121000_contract_management_rls.sql src/lib/supabase/database.types.ts
git commit -m "feat: modelar contratos e fechamentos versionados"
```

---

### Task 3: Implementar dinheiro, projeção anual e cálculo mensal puro (TDD)

**Files:**
- Create: `src/modules/contracts/domain/entities.ts`
- Create: `src/modules/contracts/domain/money.ts`
- Create: `src/modules/contracts/domain/annual-reference.ts`
- Create: `src/modules/contracts/domain/annual-reference.test.ts`
- Create: `src/modules/contracts/domain/billing-calculator.ts`
- Create: `src/modules/contracts/domain/billing-calculator.test.ts`

**Interfaces:**

```ts
export type MoneyCents = bigint & { readonly __brand: "MoneyCents" };

export function decimalToCents(value: string | number): MoneyCents;
export function centsToDecimal(value: MoneyCents): string;

export type BillingCalculationInput = {
  contractId: string;
  competency: string; // YYYY-MM-01
  version: ContractVersionSnapshot;
  consumptions: ContractConsumption[];
  manualResolutions: ManualBillingResolution[];
};

export type BillingCalculationResult = {
  honorariosCents: MoneyCents;
  tributosCents: MoneyCents;
  reembolsosCents: MoneyCents;
  totalCents: MoneyCents;
  items: BillingMemoryItem[];
  blockers: BillingBlocker[];
  areaAllocations: AllocationResult[];
  partnerShares: AllocationResult[];
  commissions: AllocationResult[];
};

export function calculateMonthlyBilling(input: BillingCalculationInput): BillingCalculationResult;
export function calculateAnnualReference(input: AnnualReferenceInput): AnnualReferenceResult;
```

Calculation order is fixed: applicable version/components -> fixed/steps/installments -> consumption -> manual releases -> adjustments/tax separation -> area allocation -> partner participation -> commission -> total/memory. `allocateCentsByPercentage` assigns any rounding residual to the last configured line so allocations always reconcile exactly.

- [ ] **Step 1: Write money and annual-reference tests.** Cover BRL parsing, negative adjustment, recurring 12-month projection, spot total, and exclusion of unreleased success/reimbursement. Test R$ 14.600 x 12 = R$ 175.200. Test that annual override without reason is rejected.
- [ ] **Step 2: Write failing calculator tests** for monthly fixed, stepped periods, closed installments, process/hour total, process/hour excess, KM, reimbursement, conditional/manual values, percentage success, discount/accrual, tax separation, percentage/value allocations, participation and commission as separate items.
- [ ] **Step 3: Add the Ingevity regression fixture.** For fixed R$ 14.600, 18/20 labor processes, 14/12 labor hours with no excess rate, 2/2 civil processes, 7/6 contract hours with no excess rate and 40 km at R$ 2, expect R$ 14.680 and two `missing_excess_rate` blockers.
- [ ] **Step 4: Run `npm test -- src/modules/contracts/domain/annual-reference.test.ts src/modules/contracts/domain/billing-calculator.test.ts`.** Expected: FAIL because modules are missing.
- [ ] **Step 5: Implement `money.ts` and entity types.** Reject more than two monetary decimals at API/domain boundaries; keep all intermediate arithmetic in integer cents.
- [ ] **Step 6: Implement annual projection.** Use the 12 competencies beginning at the configured projection month; select only components effective in each month; count each installment once.
- [ ] **Step 7: Implement the calculator in small pure helpers:** `selectApplicableComponents`, `calculateComponent`, `calculateVariable`, `allocateByArea`, `allocatePartnerShares`, `calculateCommissions`, `buildMemoryItem`.
- [ ] **Step 8: Re-run focused tests.** Expected: PASS with exact totals and deterministic item order.
- [ ] **Step 9: Commit.**

```powershell
git add src/modules/contracts/domain
git commit -m "feat: calcular cobranca mensal de contratos"
```

---

### Task 4: Validar configuração, sugerir participação e extrair pré-preenchimento (TDD)

**Files:**
- Create: `src/modules/contracts/domain/contract-validation.ts`
- Create: `src/modules/contracts/domain/contract-validation.test.ts`
- Create: `src/modules/contracts/domain/partner-share-policy.ts`
- Create: `src/modules/contracts/domain/partner-share-policy.test.ts`
- Create: `src/modules/contracts/application/services/build-contract-prefill.ts`
- Create: `src/modules/contracts/application/services/build-contract-prefill.test.ts`

**Interfaces:**

```ts
export type ContractValidationIssue = {
  code: string;
  path: string;
  severity: "error" | "warning";
  message: string;
};

export function validateContractConfiguration(
  input: ContractConfigurationInput,
): ContractValidationIssue[];

export function suggestPartnerShares(input: {
  signedAt: string;
  origin: "captacao_gustavo" | "captacao_ricardo" | "corporate" | "gaspec" | "marketing" | "organico" | "indicacao_colaborador" | "excecao";
}): PartnerShareSuggestion;

export function buildContractPrefill(input: ContractPrefillSources): ContractPrefillResult;
```

Prefill precedence is explicit: existing contract draft > normalized `field_values` (`cp_escopo_detalhe_json`, contract builder fields) > `crm_rd_field_overrides` > latest `rd_deal_reconciliacao.detalhes`. Every suggestion carries `{ value, source, requiresConfirmation }`; no source can silently activate a financial rule.

- [ ] **Step 1: Write validation tests** for missing client/start/first invoice/responsible, no component, overlapping stepped ranges, invalid component/area reference, percentage sums not 100%, fixed-value allocation mismatch, active component outside version, and “first invoice explicitly conditioned”. Missing excess rate with an included limit must be a warning, not a fabricated price.
- [ ] **Step 2: Write partner-policy tests** for 60/40 Gustavo, 60/40 Ricardo, 50/50 Corporate, 50/50 Gaspec, 63/37 marketing/organic/referral, pre-2023-04-01 captor 100%, and exception requiring reason.
- [ ] **Step 3: Write prefill tests** using the Ingevity-style proposal JSON and current RD finance keys (`vigencia_contrato_financeiro`, `primeiro_faturamento_financeiro`, monthly/spot/success fields and area allocations). Verify source precedence and that empty rates stay empty.
- [ ] **Step 4: Run the three focused test files.** Expected: FAIL.
- [ ] **Step 5: Implement validation and suggestions** with stable issue codes consumed by API/UI.
- [ ] **Step 6: Implement prefill by reusing** `parseEscopoJson`, `normalizePracticeAreaKey`, `LEAD_RD_FIELD_LABELS` and parcel helpers. Do not duplicate proposal JSON parsing.
- [ ] **Step 7: Re-run tests and `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 8: Commit.**

```powershell
git add src/modules/contracts
git commit -m "feat: validar e sugerir configuracao contratual"
```

---

### Task 5: Tornar criação do rascunho idempotente em todos os caminhos de assinatura

**Files:**
- Create: `supabase/migrations/20260812122000_contract_management_workflow.sql`
- Modify: `src/app/api/crm/leads/transition/route.ts`
- Modify: `src/app/api/integrations/d4sign/webhook/route.ts`
- Modify: `src/lib/crm/sync-oportunidade-d4sign-signers.ts`
- Create: `src/lib/crm/sync-oportunidade-d4sign-signers.test.ts`
- Modify: `src/modules/crm/infrastructure/integrations/rd-import.ts`
- Modify: `src/lib/supabase/database.types.ts`
- Create: `src/modules/contracts/application/services/ensure-contract-draft.ts`
- Create: `src/modules/contracts/application/services/ensure-contract-draft.test.ts`

**RPC contract:**

```sql
public.ensure_contract_draft_for_opportunity(
  p_opportunity_id uuid,
  p_now timestamptz
) returns uuid
```

The function locks the opportunity, then inserts with `on conflict (oportunidade_id) do update` only safe missing identity fields. It creates version 1 in `rascunho` with a unique contract/version constraint and returns the same contract id on repeated calls. It must tolerate `oportunidades.cliente_id is null`.

Extend both `transition_opportunity_atomic` and `finalize_d4sign_opportunity` so the same database transaction calls `ensure_contract_draft_for_opportunity` when the stage becomes `contrato_assinado`. Never create the full financial configuration here.

- [ ] **Step 1: Write a failing application-service test** with a fake repository called twice; expect one logical contract id and preserved pre-existing draft fields.
- [ ] **Step 2: Implement the small application service** and pass the test.
- [ ] **Step 3: Add the idempotent SQL function** and modify both existing RPC definitions in the new migration. Revoke from `public`, `anon`, `authenticated`; grant only `service_role`.
- [ ] **Step 4: Remove the direct stage update in `sync-oportunidade-d4sign-signers.ts`.** When all signers finish, call `finalize_d4sign_opportunity`; keep signer-only update for partial signatures.
- [ ] **Step 5: After RD upserts an opportunity as `contrato_assinado`, call `ensure_contract_draft_for_opportunity`.** This covers new imports and reconciliation updates without duplicate contracts.
- [ ] **Step 6: Keep the webhook activity/notification behavior.** Use the returned transition id exactly as today; draft creation failure must fail webhook processing so retry remains possible.
- [ ] **Step 7: Update generated RPC types and run:**

```powershell
npm test -- src/modules/contracts/application/services/ensure-contract-draft.test.ts src/lib/crm/sync-oportunidade-d4sign-signers.test.ts
npx tsc --noEmit
```

- [ ] **Step 8: Commit.**

```powershell
git add supabase/migrations/20260812122000_contract_management_workflow.sql src/app/api/crm/leads/transition/route.ts src/app/api/integrations/d4sign/webhook/route.ts src/lib/crm/sync-oportunidade-d4sign-signers.ts src/lib/crm/sync-oportunidade-d4sign-signers.test.ts src/modules/crm/infrastructure/integrations/rd-import.ts src/modules/contracts/application src/lib/supabase/database.types.ts
git commit -m "feat: criar rascunho contratual apos assinatura"
```

---

### Task 6: Persistir configuração, versionar e ativar com avanço atômico

**Files:**
- Create: `src/modules/contracts/infrastructure/supabase-contract-repository.ts`
- Create: `src/modules/contracts/application/services/save-contract-configuration.ts`
- Create: `src/modules/contracts/application/services/save-contract-configuration.test.ts`
- Create: `src/app/api/crm/contracts/[id]/configuration/route.ts`
- Create: `src/app/api/crm/contracts/[id]/activate/route.ts`
- Modify: `supabase/migrations/20260812122000_contract_management_workflow.sql`
- Modify: `src/lib/supabase/database.types.ts`

**API contracts:**

```ts
// PATCH /api/crm/contracts/[id]/configuration
type SaveConfigurationBody = {
  expectedVersionUpdatedAt: string;
  configuration: ContractConfigurationInput; // identity, version and normalized child collections
};

// POST /api/crm/contracts/[id]/activate
type ActivateContractBody = {
  versionId: string;
  expectedVersionUpdatedAt: string;
  advanceOpportunity: boolean;
};
```

`PATCH` is allowed only to admin/controladoria and only for a draft version. For the first version of a linked post-sale contract, the opportunity must already be in `inclusao_faturamento`; later aditivo/renewal versions are edited through Task 11 without moving the old opportunity again. It validates Zod at the route, domain rules in the service, and optimistic concurrency in the repository. It writes normalized child rows and one `contrato_eventos` entry in a transaction.

The repository performs that write through a service-role-only transport RPC; JSON is accepted only as an input envelope and is decomposed into relational rows inside PostgreSQL:

```sql
public.save_contract_configuration_atomic(
  p_contract_id uuid,
  p_version_id uuid,
  p_expected_version_updated_at timestamptz,
  p_actor_id uuid,
  p_contract jsonb,
  p_configuration jsonb,
  p_now timestamptz
) returns timestamptz
```

`POST activate` calls:

```sql
public.activate_contract_version_atomic(
  p_contract_id uuid,
  p_version_id uuid,
  p_actor_id uuid,
  p_expected_version_updated_at timestamptz,
  p_advance_opportunity boolean,
  p_now timestamptz
) returns table(contract_id uuid, version_id uuid, opportunity_id uuid, opportunity_transition_id uuid)
```

For a linked opportunity, activation with `advanceOpportunity=true` requires current stage `inclusao_faturamento`, marks the version active and contract active, writes audit, moves to `boas_vindas`, and inserts `transicoes_etapa` in the same PostgreSQL transaction. For a legacy contract with no opportunity, activation is allowed without transition. If validation is stale or stage changed, return stable `409` codes.

- [ ] **Step 1: Write failing service tests** for permission denial, invalid configuration, stale version, successful save, immutable active version, and normalized rows passed to the repository.
- [ ] **Step 2: Implement the service and repository port.** Keep Supabase-specific row conversion in infrastructure.
- [ ] **Step 3: Implement `PATCH configuration`** with `requireAuthApi`, the Task 1 policy, UUID/Zod validation, structured `{ ok, code, error, issues }` responses, and `Cache-Control: no-store`.
- [ ] **Step 4: Add `save_contract_configuration_atomic` and the activation RPC** with explicit grants. The save RPC locks the draft version, replaces only that version's normalized configuration rows, updates contract identity fields and writes the audit event. The activation RPC independently re-checks all activation invariants; neither trusts only TypeScript validation.
- [ ] **Step 5: Implement `POST activate`** and map `CONTRACT_VERSION_CONFLICT`, `CONTRACT_CONFIGURATION_INVALID`, and `OPPORTUNITY_STAGE_CONFLICT` to 409/422 responses.
- [ ] **Step 6: Update database types.** Include all exact RPC args/returns.
- [ ] **Step 7: Run focused tests, `npx tsc --noEmit`, and `git diff --check`.**
- [ ] **Step 8: Commit.**

```powershell
git add src/modules/contracts src/app/api/crm/contracts supabase/migrations/20260812122000_contract_management_workflow.sql src/lib/supabase/database.types.ts
git commit -m "feat: salvar e ativar configuracao contratual"
```

---

### Task 7: Expor a implantação na etapa “Inclusão no fluxo de faturamento”

**Files:**
- Create: `src/app/(crm)/crm/leads/[id]/contract-billing-onboarding-panel.tsx`
- Modify: `src/app/(crm)/crm/leads/[id]/page.tsx`
- Modify: `src/app/(crm)/crm/leads/[id]/lead-detail-view.tsx`
- Modify: `src/app/api/crm/leads/transition-requirements/route.ts`
- Modify: `src/app/api/crm/leads/transition/route.ts`
- Modify: `src/components/crm/pipeline-board.tsx`
- Modify: `src/modules/crm/domain/workflow-rules.ts`
- Modify: `src/modules/crm/application/services/transition-opportunity.test.ts`

**Transition blocker contract:**

```ts
type ContractTransitionBlocker = {
  code: "contract_billing_setup_required";
  message: string;
  contractId: string;
  actionHref: string; // /crm/contratos/{id}?setup=1&returnTo=/crm/leads/{opportunityId}
};
```

- [ ] **Step 1: Add failing workflow tests.** Leaving `inclusao_faturamento` requires `financeiroConcluido=true`; moving into the stage does not require the full configuration.
- [ ] **Step 2: Implement the pure precondition** and pass the focused transition tests.
- [ ] **Step 3: Load the linked contract summary in lead detail.** Add `contractBilling` to `LeadDetailData`: id, lifecycle status, active/draft version, validation progress and setup href.
- [ ] **Step 4: Add a “Faturamento” tab** for post-sale stages from `inclusao_faturamento` onward. In the target stage, show progress, suggestions origin, blockers, and the CTA “Configurar contrato”; do not embed the six-step editor inside the already large lead component.
- [ ] **Step 5: Enhance transition requirements.** When current stage is `inclusao_faturamento` and target is `boas_vindas`, query the contract atomically/read-only. Return `transitionBlocker` when no active valid version exists.
- [ ] **Step 6: Extend pipeline board error state** from a string to `{ message, actionHref? }`; render a Link CTA in the existing blocking dialog. Preserve all current generic errors.
- [ ] **Step 7: Add a defense-in-depth check to `transition_opportunity_atomic`.** The SQL function must raise `CONTRACT_BILLING_SETUP_REQUIRED` for `inclusao_faturamento -> boas_vindas` unless a valid active linked contract exists, even if a client bypasses requirements GET.
- [ ] **Step 8: Run:**

```powershell
npm test -- src/modules/crm/application/services/transition-opportunity.test.ts
npx tsc --noEmit
```

- [ ] **Step 9: Commit.**

```powershell
git add src/app/'(crm)'/crm/leads/'[id]' src/app/api/crm/leads src/components/crm/pipeline-board.tsx src/modules/crm supabase/migrations/20260812122000_contract_management_workflow.sql
git commit -m "feat: integrar contratos ao pos-venda"
```

---

### Task 8: Construir hub, ficha e assistente de configuração preservando D4Sign

**Files:**
- Create: `src/modules/contracts/infrastructure/contract-queries.ts`
- Create: `src/components/crm/contracts/contracts-hub.tsx`
- Create: `src/components/crm/contracts/contract-portfolio-tab.tsx`
- Create: `src/components/crm/contracts/contract-setup-wizard.tsx`
- Create: `src/components/crm/contracts/contract-detail-shell.tsx`
- Create: `src/app/(crm)/crm/contratos/[id]/page.tsx`
- Modify: `src/app/(crm)/crm/contratos/page.tsx`

**Hub tabs:** `Carteira`, `Fechamentos`, `Renovações`, `Indicadores`, `Assinaturas D4Sign`.

**Wizard steps:**

1. Identificação, vigência, vencimento, reajuste and responsibles.
2. Areas, franchises, prices and tracking.
3. Components, stepped ranges, installments, conditions and tax eligibility.
4. Area allocations.
5. Origin, partner shares and commissions.
6. Projection, warnings, activation and atomic advance.

- [ ] **Step 1: Implement server query functions** returning typed view models only, with explicit selected columns and no `select('*')` in new code. Portfolio filters: client, manager, area, tag, origin, lifecycle, billing kind and renewal period.
- [ ] **Step 2: Refactor `/crm/contratos` into the tabbed hub.** Keep `export const dynamic = "force-dynamic"`; load portfolio and D4Sign datasets in parallel. Preserve every current D4Sign prop, quota, firm signer and orphan-document behavior.
- [ ] **Step 3: Build portfolio states** for draft/review/active/suspended/ended, renewal badge, annual reference, monthly projection and setup progress. Add accessible table/mobile cards and empty/error states.
- [ ] **Step 4: Build `/crm/contratos/[id]`** with overview, areas/rules, allocations, closings, versions/aditivos, documents and events. Await `params` per Next 16.
- [ ] **Step 5: Implement the wizard as a client component** with local draft, Zod-compatible field errors, dirty guard, explicit Save Draft, and final projection. Use API routes from Task 6; disable controls by Task 1 capability.
- [ ] **Step 6: Show source badges** (`proposta`, `contrato`, `RD`, `manual`) on prefilled values and require confirmation/override reason where the source suggestion changed.
- [ ] **Step 7: Wire “Ativar contrato e avançar etapa”.** On success, refresh and navigate to the lead/board return target; on 409 retain form values and show the stable conflict message.
- [ ] **Step 8: Review keyboard labels, focus order and mobile overflow in the component markup.** Keep `D4SignDashboard` unchanged and pass the exact current props through the new tab.
- [ ] **Step 9: Run `npx tsc --noEmit` and `npm run lint`.**
- [ ] **Step 10: Commit.**

```powershell
git add src/modules/contracts/infrastructure src/components/crm/contracts src/app/'(crm)'/crm/contratos
git commit -m "feat: criar hub e ficha de contratos"
```

---

### Task 9: Preparar, revisar, aprovar e registrar fechamentos mensais (TDD)

**Files:**
- Create: `src/modules/contracts/application/services/prepare-monthly-closing.ts`
- Create: `src/modules/contracts/application/services/prepare-monthly-closing.test.ts`
- Create: `src/app/api/crm/contracts/[id]/consumptions/route.ts`
- Create: `src/app/api/crm/contracts/[id]/closings/route.ts`
- Create: `src/app/api/crm/contracts/[id]/closings/[closingId]/route.ts`
- Create: `src/components/crm/contracts/contract-closing-review.tsx`
- Create: `src/components/crm/contracts/contract-closings-tab.tsx`
- Modify: `src/components/crm/contracts/contracts-hub.tsx`
- Modify: `src/components/crm/contracts/contract-detail-shell.tsx`
- Modify: `supabase/migrations/20260812122000_contract_management_workflow.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Mutation actions:**

```ts
type ClosingAction =
  | { action: "recalculate"; expectedRevision: number }
  | { action: "resolve_blocker"; itemId: string; resolution: "nao_cobrar" | "ajuste" | "aditivo"; reason: string }
  | { action: "approve"; expectedRevision: number }
  | { action: "new_revision"; previousRevisionId: string; reason: string }
  | { action: "register_vios"; reference: string; url?: string };
```

The database migration adds service-role-only RPCs `create_contract_closing_revision`, `approve_contract_closing_revision`, `create_contract_closing_correction` and `register_contract_closing_vios`. Each locks the closing/current revision and checks expected revision to prevent two reviewers overwriting each other.

- [ ] **Step 1: Write failing preparation tests.** Cover active version selection by competency, unique closing, missing consumption blockers, exact calculator item persistence, recalculation creating the next revision, suspended contract rejected, and approved revision never rewritten.
- [ ] **Step 2: Implement the application service** with repository port and the pure calculator from Task 3.
- [ ] **Step 3: Add consumption API.** Admin/controladoria/financeiro can upsert manual process/hour/km/value lines for an unapproved competency; validate canonical area/component membership.
- [ ] **Step 4: Add closing RPCs and API routes.** Approval only admin/controladoria; preparation and VIOS registration also financeiro. Approval rejects unresolved blocking items. VIOS registration requires approved current revision and only changes status/reference audit fields.
- [ ] **Step 5: Build the closing review UI.** Display inputs, memory items, warning/blocker resolution, honoraria/tax/reimbursement subtotals, area allocations, partner shares and commissions in distinct sections.
- [ ] **Step 6: Add correction flow.** “Nova revisão” requires a reason, copies inputs as a new editable revision, and leaves the prior approved snapshot untouched.
- [ ] **Step 7: Add hub closing tab** grouped by competency/status with filters and deep links to the contract review.
- [ ] **Step 8: Run focused tests, `npx tsc --noEmit`, and verify database types.**
- [ ] **Step 9: Commit.**

```powershell
git add src/modules/contracts src/app/api/crm/contracts src/components/crm/contracts supabase/migrations/20260812122000_contract_management_workflow.sql src/lib/supabase/database.types.ts
git commit -m "feat: adicionar fechamentos mensais auditaveis"
```

---

### Task 10: Gerar alertas e tarefas diárias idempotentes (TDD)

**Files:**
- Create: `src/modules/contracts/application/services/generate-contract-alerts.ts`
- Create: `src/modules/contracts/application/services/generate-contract-alerts.test.ts`
- Create: `src/app/api/cron/contracts-daily/route.ts`
- Create: `src/app/api/crm/contracts/[id]/renewals/[alertId]/route.ts`
- Create: `src/components/crm/contracts/contract-renewals-tab.tsx`
- Modify: `src/components/crm/contracts/contracts-hub.tsx`
- Modify: `src/lib/crm/in-app-notification-meta.ts`
- Modify: `src/app/api/crm/leads/transition/route.ts`
- Modify: `vercel.json`

**Idempotency keys:**

```text
contract-setup:{contractId}
contract-closing:{contractId}:{YYYY-MM}
contract-renewal:{contractId}:{YYYY-MM-DD}
contract-missing-rate:{contractId}:{closingId}:{areaId}:{metric}
```

- [ ] **Step 1: Write failing alert-service tests** for default renewal one year after indefinite start, default 30-day lead, closing creation lead days before due date, suspended/ended exclusion, repeat run creating no duplicate, and São Paulo local date around UTC boundary.
- [ ] **Step 2: Implement a pure planner** that returns alert/closing intents and idempotency keys. Convert “today” once using `America/Sao_Paulo`; pass it into all pure helpers.
- [ ] **Step 3: Implement the daily Route Handler** with the existing `CRON_SECRET` authorization pattern, GET/POST support, `maxDuration`, service-role repository, per-contract error collection and idempotent upserts.
- [ ] **Step 4: Add to `vercel.json`** at `0 13 * * *`. The [official Vercel usage documentation](https://vercel.com/docs/cron-jobs/usage-and-pricing), checked on 2026-08-12, permits up to 100 cron jobs per project and daily schedules on Hobby; this becomes the third daily job.
- [ ] **Step 5: Create in-app notifications** for `contrato_implantacao_pendente`, `contrato_fechamento_pendente`, `contrato_renovacao_pendente` and `contrato_excedente_sem_preco`; group all under the existing Contracts notification tab. On a successful transition into `inclusao_faturamento`, upsert the setup alert immediately; the daily job reconciles missed events using the same idempotency key. Assign to the configured operational/renewal responsible when present; otherwise notify eligible controladoria users. Never hard-code Juliana's user id.
- [ ] **Step 6: Build renewal tab and PATCH route.** Record assignee, customer notified date/by, decision, applied index, notes and conclusion. Never send external communication.
- [ ] **Step 7: Re-run focused tests and typecheck.**
- [ ] **Step 8: Commit.**

```powershell
git add src/modules/contracts/application src/app/api/cron/contracts-daily src/app/api/crm/contracts/'[id]'/renewals src/app/api/crm/leads/transition/route.ts src/components/crm/contracts src/lib/crm/in-app-notification-meta.ts vercel.json
git commit -m "feat: automatizar alertas de contratos"
```

---

### Task 11: Completar versões, aditivos e histórico auditável

**Files:**
- Create: `src/app/api/crm/contracts/[id]/versions/route.ts`
- Create: `src/components/crm/contracts/contract-versions-panel.tsx`
- Modify: `src/components/crm/contracts/contract-detail-shell.tsx`
- Modify: `src/modules/contracts/application/services/save-contract-configuration.ts`
- Modify: `supabase/migrations/20260812122000_contract_management_workflow.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Version actions:**

```ts
type VersionAction =
  | { action: "clone_draft"; sourceVersionId: string; effectiveFrom: string; addendumId?: string }
  | { action: "suspend_contract"; reason: string }
  | { action: "resume_contract"; reason: string }
  | { action: "end_contract"; endedAt: string; reason: string };
```

- [ ] **Step 1: Add service tests** that clone all normalized configuration rows, prohibit overlapping periods, link optional `aditivos`, preserve old closing version ids, and require reason for lifecycle changes.
- [ ] **Step 2: Add transactional version RPC.** Clone version + areas + components + installments + allocations + participations + commissions in one transaction. The new version starts `rascunho`; activation substitutes the prior version only from `effectiveFrom` onward.
- [ ] **Step 3: Implement the versions API** restricted to admin/controladoria and map exclusion conflicts to a readable 409.
- [ ] **Step 4: Build the versions/aditivos panel** with status, effective period, origin, linked addendum, and compare summary. Do not permit editing the active snapshot in place.
- [ ] **Step 5: Ensure every mutation writes `contrato_eventos`.** Required kinds: draft created/edited, activated, suspended/resumed/ended, version cloned/substituted, override, closing calculated/approved/corrected, VIOS registered, alert opened/resolved.
- [ ] **Step 6: Run focused tests, typecheck and `git diff --check`.**
- [ ] **Step 7: Commit.**

```powershell
git add src/app/api/crm/contracts src/components/crm/contracts src/modules/contracts supabase/migrations/20260812122000_contract_management_workflow.sql src/lib/supabase/database.types.ts
git commit -m "feat: versionar contratos e aditivos"
```

---

### Task 12: Atualizar documentação, verificar a história completa e preparar cutover

**Files:**
- Modify: `docs/system-context.md`
- Create: `docs/contract-management-runbook.md`

**Runbook must contain:** migration order, local validation, explicit remote-apply pause, backfill command/SQL for existing signed opportunities, cron invocation, role smoke matrix, rollback boundaries, and VIOS/D4Sign non-regression checks.

- [ ] **Step 1: Add a dry-run/backfill section.** Backfill calls `ensure_contract_draft_for_opportunity` for existing `contrato_assinado` opportunities; it must report counts and rely on the unique constraint for idempotency. Do not execute remotely in this task.
- [ ] **Step 2: Update `docs/system-context.md` to implemented reality.** Replace the old contracts model/routes/API/RLS/limits with exact files and statuses.
- [ ] **Step 3: Run focused domain/application tests first:**

```powershell
npm test -- src/modules/contracts src/modules/crm/application/services/transition-opportunity.test.ts src/lib/auth/crm-access-policy.test.ts
```

- [ ] **Step 4: Run full verification:**

```powershell
npm run lint
npm run test
npm run build
git diff --check
```

- [ ] **Step 5: Perform the bounded runtime smoke only against a database where these migrations were explicitly authorized and applied.** Verify: signed opportunity has one draft; inclusion stage shows setup; invalid setup cannot advance; valid activation advances atomically; Ingevity calculation; approval freeze/new revision; VIOS reference; renewal task; D4Sign tab and orphan documents. If remote application remains unauthorized, record this runtime smoke as pending in the runbook and do not claim it passed; build and pure/application tests remain mandatory.
- [ ] **Step 6: Inspect `git status --short`.** Confirm unrelated untracked cache directories and `CARDAPIO_FJ_BAR_2026_V2.png` remain unstaged.
- [ ] **Step 7: Commit documentation/verification fixes only.**

```powershell
git add docs/system-context.md docs/contract-management-runbook.md
git commit -m "docs: documentar operacao do gerenciador de contratos"
```

## Acceptance traceability

| Acceptance criterion | Primary tasks/tests |
|---|---|
| One draft after any signature path | Task 5 idempotency service + SQL unique/RPC |
| Full setup only in inclusion stage | Tasks 6–8 |
| Cannot leave inclusion incomplete | Tasks 6–7 atomic RPC + defense-in-depth gate |
| Multiple areas, limits and prices | Tasks 2–4, Ingevity test |
| Fixed, variable, installment, maintenance, success coexist | Task 3 calculator suite |
| Missing rate alerts and adds zero | Tasks 3, 9, 10 |
| Explainable memory, allocations, shares and commissions | Tasks 3 and 9 |
| Approved revision immutable; correction creates next | Tasks 2 and 9 |
| Manual VIOS reference only | Task 9 |
| Renewal task 30 days before by default | Task 10 |
| Addendum affects only new version competencies | Task 11 |
| Role restrictions at API/database edge | Tasks 1, 2, 6, 9, 11 |
| D4Sign panel preserved | Tasks 8 and 12 smoke |

## Explicitly deferred

- Applying migrations/backfill to remote Supabase.
- Automatic VIOS title/invoice creation, document upload, accounts receivable, payment or delinquency sync.
- Automatic import of the historical billing spreadsheet.
- Automatic consumption import from VIOS.
- Customer email/WhatsApp for renewal or adjustment.
- Generic user-authored formula engine.
