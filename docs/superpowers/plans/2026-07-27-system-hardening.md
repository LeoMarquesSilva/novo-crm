# CRM System Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado 2026-07-28:** Implementação parcial já no código. Fecho operacional em
> `docs/superpowers/plans/2026-07-28-onda-1-fecho-hardening.md`.

**Goal:** Corrigir falhas de segurança, consistência, qualidade e operação identificadas na auditoria completa do CRM.

**Architecture:** A autorização continuará validada dentro de cada Route Handler, sem depender apenas do Proxy. Operações críticas de banco serão movidas para funções PostgreSQL transacionais acessíveis somente por `service_role`; integrações externas terão autenticação fail-closed, timeout e erros sanitizados. Correções de comportamento serão protegidas por testes Vitest e toda mudança estrutural será refletida em `docs/system-context.md`.

**Tech Stack:** Next.js 16 App Router, React 19.2, TypeScript, Supabase/PostgreSQL, Zod, Vitest e ESLint.

## Global Constraints

- Preservar `CARDAPIO_FJ_BAR_2026_V2.png` e qualquer alteração fora do escopo.
- Não aplicar migrations diretamente em produção nesta execução; apenas versioná-las e validá-las.
- Não expor tokens, payloads pessoais, respostas brutas de integrações ou detalhes internos em APIs.
- Consultar `node_modules/next/dist/docs/` antes de usar APIs do Next.js.
- Executar `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` e `npm audit` antes da conclusão.

---

### Task 1: Autenticação e administração de usuários

**Files:**
- Modify: `src/lib/auth/server.ts`
- Modify: `src/proxy.ts`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/api/admin/users/route.ts`
- Modify: `src/app/api/admin/users/[id]/route.ts`
- Modify: `src/app/api/admin/users/[id]/role/route.ts`
- Modify: `src/components/crm/user-management-panel.tsx`
- Test: `src/lib/auth/admin-user-policy.test.ts`

**Interfaces:**
- Produces: `evaluateAdminUserMutation(input): AdminUserMutationDecision`
- Produces: `requireAuthApi()` com `profile` não nulo no ramo `ok: true`.

- [x] **Step 1: escrever testes de regressão para impedir senha fraca, autoexclusão e remoção do último admin**
- [x] **Step 2: executar `npm test -- src/lib/auth/admin-user-policy.test.ts` e confirmar falha pelo helper ainda inexistente**
- [x] **Step 3: extrair a política pura e fazer as rotas consumirem a mesma decisão**
- [x] **Step 4: executar o teste isolado e confirmar sucesso**
- [x] **Step 5: executar `npx tsc --noEmit` para validar todos os consumidores do perfil não nulo**

### Task 2: Autorização de documentos e mutações do CRM

**Files:**
- Modify: `src/app/api/crm/d4sign/documents/[uuid]/view/route.ts`
- Modify: `src/app/api/crm/leads/[id]/route.ts`
- Create: `src/lib/auth/crm-access-policy.ts`
- Test: `src/lib/auth/crm-access-policy.test.ts`

**Interfaces:**
- Produces: `canMutateLead(profile, lead, fields): boolean`
- Consumes: perfil ativo devolvido por `requireAuthApi()`.

- [x] **Step 1: escrever casos negando perfil inexistente, função não autorizada e UUID D4Sign fora do catálogo**
- [x] **Step 2: executar os testes e observar falha pela política inexistente**
- [x] **Step 3: implementar a política mínima e validar o documento antes do acesso com `service_role`**
- [x] **Step 4: aplicar a mesma política ao PATCH de lead**
- [x] **Step 5: executar testes e typecheck**

### Task 3: Webhooks autenticados e idempotentes

**Files:**
- Modify: `src/app/api/integrations/d4sign/webhook/route.ts`
- Modify: `src/app/api/integrations/rd/webhook/route.ts`
- Create: `src/lib/webhooks/security.ts`
- Test: `src/lib/webhooks/security.test.ts`
- Create: `supabase/migrations/20260727170000_harden_webhooks.sql`

**Interfaces:**
- Produces: `verifySharedSecret(expected, supplied): boolean`
- Produces: RPC `process_d4sign_webhook_event(...)` concedida somente a `service_role`.

- [x] **Step 1: escrever testes para segredo ausente, comparação segura, tipo desconhecido e duplicata**
- [x] **Step 2: executar e confirmar falha**
- [x] **Step 3: tornar D4Sign fail-closed, limitar payload e validar `type_post`**
- [x] **Step 4: remover segredo RD da query string e aceitar somente header**
- [x] **Step 5: versionar processamento transacional/idempotente e validar SQL por inspeção do catálogo**

### Task 4: Transações e concorrência do workflow

**Files:**
- Modify: `src/app/api/crm/leads/transition/route.ts`
- Modify: `src/app/api/crm/leads/[id]/route.ts`
- Create: `supabase/migrations/20260727171000_atomic_crm_mutations.sql`
- Modify: `src/lib/supabase/database.types.ts`
- Test: `src/modules/crm/application/services/transition-opportunity.test.ts`

**Interfaces:**
- Produces: RPC `transition_opportunity_atomic(...)`
- Produces: RPC `delete_crm_lead_atomic(uuid)`

- [x] **Step 1: adicionar caso de concorrência que exige conflito quando a etapa esperada mudou**
- [x] **Step 2: executar e confirmar que a implementação atual não detecta a disputa**
- [x] **Step 3: criar RPC curta, com lock de linha, atualização e auditoria na mesma transação**
- [x] **Step 4: revogar execução de `public`, `anon` e `authenticated`; conceder apenas a `service_role`**
- [x] **Step 5: substituir rollback manual da rota pela RPC e executar testes**

### Task 5: Banco, RLS e índices

**Files:**
- Create: `supabase/migrations/20260727172000_fix_database_advisors.sql`
- Modify: `docs/system-context.md`

**Interfaces:**
- Consumes: avisos dos advisors do projeto Supabase `CRM-BP`.

- [x] **Step 1: corrigir `search_path` mutável nos triggers listados**
- [x] **Step 2: revogar execução pública de `sync_oportunidade_etapa_periodo()`**
- [x] **Step 3: criar os oito índices de FK ausentes com nomes determinísticos**
- [x] **Step 4: otimizar policies com `(select auth.uid())` e consolidar policies permissivas duplicadas**
- [x] **Step 5: registrar a divergência histórica de migrations e o procedimento seguro de recuperação**

### Task 6: Integrações resilientes e configuração coerente

**Files:**
- Create: `src/lib/http/fetch-with-timeout.ts`
- Modify: `src/modules/crm/infrastructure/integrations/d4sign-client.ts`
- Modify: conectores RD, Evolution, Microsoft, SharePoint, Resend e ViaCEP que usam `fetch`
- Modify: `.env.example`
- Test: `src/lib/http/fetch-with-timeout.test.ts`

**Interfaces:**
- Produces: `fetchWithTimeout(input, init?, timeoutMs?): Promise<Response>`

- [x] **Step 1: escrever teste com servidor/Promise controlado que prova cancelamento no prazo**
- [x] **Step 2: executar e confirmar a falha inicial**
- [x] **Step 3: implementar composição de `AbortSignal`**
- [x] **Step 4: adotar o helper nos limites externos e sanitizar erros devolvidos ao cliente**
- [x] **Step 5: alinhar aliases de Evolution/Resend/Microsoft em `.env.example` e executar testes**

### Task 7: Dependências, runtime e CI

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.github/workflows/ci.yml`
- Create: `.nvmrc`

**Interfaces:**
- Produces: pipeline CI com testes, lint, typecheck, build e audit.

- [ ] **Step 1: consultar versões estáveis e advisories oficiais** — adiado: o bump do Next.js/eslint-config-next exige validação de compatibilidade e janela própria; não é seguro fazê-lo no fecho da Onda 1.
- [x] **Step 2: atualizar Next.js/eslint-config-next para patch seguro e mover `shadcn` para devDependencies** — `shadcn` em devDependencies (Onda 1 Task 3); bump Next/eslint adiado (Task 7.1)
- [x] **Step 3: declarar Node.js 20.9+ em `engines` e `.nvmrc`**
- [x] **Step 4: criar workflow sem segredos para validações estáticas**
- [x] **Step 5: instalar lockfile e executar `npm audit`** — 5 vulns (2 low, 3 high) registadas no change-log 2026-07-28

### Task 8: Compatibilidade React 19 e qualidade estática

**Files:**
- Modify: componentes e hooks apontados pelo ESLint
- Test: testes puros dos helpers extraídos quando houver comportamento.

**Interfaces:**
- Produces: zero erros ESLint sem desabilitar regras.

- [x] **Step 1: executar lint e registrar a lista atual por regra/arquivo**
- [ ] **Step 2: substituir escrita de refs durante render por `useEffectEvent` ou efeito apropriado** — adiado: refatoração React 19 transversal, a executar com regressão visual dedicada.
- [ ] **Step 3: transformar ícones dinâmicos em componentes estáveis de módulo** — adiado: depende do mesmo ciclo de compatibilidade React 19 para evitar alterações de renderização no fecho.
- [ ] **Step 4: remover `setState` síncrono de efeitos por estado derivado/eventos** — adiado: requer revisão de fluxos derivados e testes de UI fora do escopo de hardening P1.
- [ ] **Step 5: executar lint novamente e corrigir somente causas comprovadas restantes** — parcial Onda 1: `no-unused-vars`, `no-unused-expressions`, disable órfãos; `no-img-element` adiado Onda 5

### Task 9: Regra permanente, documentação e verificação

**Files:**
- Modify: `AGENTS.md`
- Rewrite: `docs/system-context.md`
- Create: `docs/change-log.md`

**Interfaces:**
- Produces: regra obrigatória de leitura e atualização contínua do contexto.

- [x] **Step 1: adicionar ao `AGENTS.md` a leitura obrigatória do contexto antes de mudanças**
- [x] **Step 2: atualizar arquitetura, rotas, segurança, migrations e limites reais**
- [x] **Step 3: criar changelog técnico append-only com data, arquivos e validações**
- [x] **Step 4: executar a suíte final completa e guardar os resultados no changelog**
- [x] **Step 5: revisar `git diff --check`, `git diff` e `git status`, confirmando que o PNG permaneceu intacto**

## Self-review

- Cobertura: autenticação, autorização, usuários, webhooks, concorrência, RLS, índices, dependências, lint, integrações, CI e documentação estão mapeados.
- Sem placeholders: cada tarefa define arquivos, contrato e comando verificável; detalhes finais dependentes do catálogo real serão registrados com o SQL efetivamente versionado.
- Consistência: rotas usam perfil ativo; mutações críticas usam RPC concedida apenas a `service_role`; documentação é atualizada somente depois das validações.
