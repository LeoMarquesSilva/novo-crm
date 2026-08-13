# Onda 1 — Fecho do System Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a Onda 1 do programa de ajuste do CRM jurídico: validar o hardening já implementado, completar gaps restantes (CI, docs, dependências, lint) e marcar o plan `2026-07-27-system-hardening.md` como concluído com evidência.

**Architecture:** A maior parte das Tasks 1–6 do hardening já existe no código (`admin-user-policy`, `crm-access-policy`, `webhooks/security`, RPCs atómicas, migrations `20260727*`, `fetchWithTimeout`). Este plan não reimplementa isso — audita, completa o que falta (CI, changelog, AGENTS/contexto, `shadcn` em devDependencies, limpeza de warnings ESLint acionáveis) e corre o gate final.

**Tech Stack:** Next.js 16.2.12, React 19.2, TypeScript, Supabase/PostgreSQL, Zod, Vitest, ESLint, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-28-crm-ajuste-completo-design.md` (Onda 1)  
**Plan base (não reescrever):** `docs/superpowers/plans/2026-07-27-system-hardening.md`

## Global Constraints

- Preservar `CARDAPIO_FJ_BAR_2026_V2.png` e qualquer alteração fora do escopo da Onda 1.
- Não aplicar migrations remotamente sem pedido explícito do utilizador; ficheiros SQL em `supabase/migrations/` são a fonte Git.
- Não expor tokens, payloads pessoais ou respostas brutas de integrações.
- Consultar `node_modules/next/dist/docs/` antes de APIs Next.js novas.
- Gate final obrigatório: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm audit`.
- Commits só se o utilizador pedir explicitamente.
- Fora de escopo deste plan: Onda 2 (authz fina por área na UI), Onda 3 (clientes/contratos reais), Onda 4 (VIOS), Onda 5 (fatiar monolitos).

### Estado auditado em 2026-07-28 (ponto de partida)

| Item do plan 27/07 | Estado |
|--------------------|--------|
| Task 1 admin-user-policy + testes | Presente (`src/lib/auth/admin-user-policy.ts` + `.test.ts`) |
| Task 2 crm-access-policy + testes | Presente (`src/lib/auth/crm-access-policy.ts` + `.test.ts`) |
| Task 3 webhooks security + migration | Presente (`src/lib/webhooks/security.ts`, RD usa `verifySharedSecret`, `20260727170000_harden_webhooks.sql`) |
| Task 4 RPCs atómicas | Presente (`20260727171000_atomic_crm_mutations.sql`, types) |
| Task 5 advisors DB | Presente (`20260727172000_fix_database_advisors.sql`) |
| Task 6 fetchWithTimeout | Presente e adoptado nos conectores principais |
| Task 7 CI workflow | **Ausente** (sem `.github/workflows/`) |
| Task 7 engines + `.nvmrc` | Presente (`engines.node >=20.9.0`, `.nvmrc` = `20.19.0`) |
| Task 7 shadcn → devDependencies | **Pendente** (`shadcn` ainda em `dependencies`) |
| Task 8 lint zero errors | **0 errors**, 43 warnings (limpar warnings acionáveis) |
| Task 9 AGENTS + change-log + system-context | AGENTS só tem bloco Next.js; **sem** `docs/change-log.md`; system-context desatualizado |
| Vitest | 24 files / 113 tests passing (2026-07-28) |

---

### Task 1: Matriz de fecho no plan de hardening

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-system-hardening.md`
- Create: `docs/change-log.md` (entrada inicial; completar na Task 4)

**Interfaces:**
- Produces: checkboxes `[x]` nos steps já evidenciados pelo código; steps ainda abertos ficam `[ ]` até Tasks 2–5.
- Produces: secção no topo do plan 27/07 com link para este plan de fecho.

- [x] **Step 1: Inserir nota de estado no topo do plan 27/07**

Adicionar após o header:

```markdown
> **Estado 2026-07-28:** Implementação parcial já no código. Fecho operacional em
> `docs/superpowers/plans/2026-07-28-onda-1-fecho-hardening.md`.
```

- [x] **Step 2: Marcar `[x]` apenas steps comprovados por ficheiro existente**

Marcar Tasks 1–6 (código + migrations + testes) como feitos. Deixar Tasks 7 (CI, shadcn), 8 (warnings), 9 (docs) conforme estado da tabela acima.

- [x] **Step 3: Criar `docs/change-log.md` append-only com cabeçalho**

```markdown
# CRM change log técnico

Formato: data (ISO) | onda | resumo | validações.

## 2026-07-28 — Onda 1 (em curso)

- Spec: `docs/superpowers/specs/2026-07-28-crm-ajuste-completo-design.md`
- Plan de fecho: `docs/superpowers/plans/2026-07-28-onda-1-fecho-hardening.md`
- Validações: (preencher na Task 5)
```

- [x] **Step 4: Verificar paths**

Run: `Test-Path docs/change-log.md; Test-Path docs/superpowers/plans/2026-07-27-system-hardening.md`  
Expected: ambos `True`

---

### Task 2: CI sem segredos

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (apenas se necessário expor scripts já existentes)

**Interfaces:**
- Produces: workflow GitHub Actions em `pull_request` + `push` para `main`/`master` que corre install, test, lint, typecheck, build.
- Consumes: scripts `test`, `lint`, `build` já em `package.json`; typecheck via `npx tsc --noEmit`.

- [x] **Step 1: Criar `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: crm
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: crm/.nvmrc
          cache: npm
          cache-dependency-path: crm/package-lock.json
      - name: Install
        run: npm ci
      - name: Test
        run: npm test
      - name: Lint
        run: npm run lint
      - name: Typecheck
        run: npx tsc --noEmit
      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder
```

Nota: se o repo root for só `crm/` (sem monorepo), ajustar `working-directory` e paths para a raiz do package — confirmar com `Test-Path ../crm/package.json` vs `Test-Path package.json` a partir do root git.

- [x] **Step 2: Confirmar localização do package relativamente ao git root**

Run (na raiz do git):

```powershell
git rev-parse --show-toplevel
Get-ChildItem -Name package.json, crm/package.json -ErrorAction SilentlyContinue
```

Expected: saber se CI deve usar `working-directory: crm` ou raiz. Ajustar o YAML do Step 1 em conformidade (uma única variante correta).

- [x] **Step 3: Validar YAML localmente (sintaxe)**

Run: não há action local obrigatória; rever indentação e `node-version-file` apontando para `.nvmrc` existente.

- [x] **Step 4: Marcar Task 7 Step 4 do plan 27/07 como `[x]` após o ficheiro existir**

---

### Task 3: Mover `shadcn` para devDependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (via npm)

**Interfaces:**
- Produces: `"shadcn"` apenas em `devDependencies`.

- [x] **Step 1: Confirmar que nenhum import runtime usa o pacote `shadcn`**

Run:

```powershell
rg -n "from [\"']shadcn|require\([\"']shadcn" src --glob "*.{ts,tsx,js,mjs}"
```

Expected: zero matches (CLI de scaffolding só).

- [x] **Step 2: Mover a dependência**

```powershell
npm uninstall shadcn
npm install -D shadcn@4.16.0
```

- [x] **Step 3: Verificar `package.json`**

`shadcn` deve aparecer só em `devDependencies`, versão `4.16.0` (ou patch compatível instalado).

- [x] **Step 4: Correr testes rápidos**

Run: `npm test`  
Expected: 113+ tests passing.

---

### Task 4: Documentação obrigatória (AGENTS + system-context hardening)

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/system-context.md`
- Modify: `docs/change-log.md`

**Interfaces:**
- Produces: regra de leitura de `docs/system-context.md` antes de mudanças.
- Produces: correções factuais mínimas no contexto (proxy vs middleware; estado hardening; clientes/contratos ainda Onda 3).

- [x] **Step 1: Acrescentar secção em `AGENTS.md` (manter bloco Next.js existente)**

```markdown
# CRM agent rules

Antes de qualquer mudança de comportamento, autenticação, schema ou integração:

1. Ler `docs/system-context.md`.
2. Se o código divergir do documento, atualizar o documento na mesma alteração.
3. Migrations DDL: versionar em `supabase/migrations/` e aplicar no remoto só com pedido explícito (MCP `user-supabase-crm-new`).
4. Programa de ajuste: `docs/superpowers/specs/2026-07-28-crm-ajuste-completo-design.md`.
```

- [x] **Step 2: Atualizar `docs/system-context.md` — correções mínimas Onda 1**

Substituir menções a `src/middleware.ts` por `src/proxy.ts` (matcher `/crm`, `/login`) onde o texto descreva proteção de rotas.

Na secção de estado / integrações, registar:

- Hardening 2026-07-27: policies admin/CRM, webhooks fail-closed, RPCs `transition_opportunity_atomic` / `delete_crm_lead_atomic`, `fetchWithTimeout` nos conectores.
- CI: `.github/workflows/ci.yml`.
- Autorização fina por área na UI e clientes/contratos “mock” permanecem para Ondas 2–3 (não fingir que já estão fechados).

- [x] **Step 3: Não expandir escopo** — não implementar CRUD de clientes nesta task.

- [x] **Step 4: Acrescentar ao change-log** a lista de ficheiros docs tocados.

---

### Task 5: Limpeza ESLint acionável (warnings → 0 ou lista justificada)

**Files:**
- Modify: ficheiros listados pelo `npm run lint` com `@typescript-eslint/no-unused-vars` e `no-unused-expressions` / disable directives órfãs.
- Não obrigatório nesta onda: migrar todos os `<img>` do `d4sign-dashboard.tsx` para `next/image` (pode ficar justificado no change-log como dívida Onda 5 se tocar no monolito).

**Interfaces:**
- Produces: `npm run lint` com **0 errors**; meta preferencial **0 warnings** nos `no-unused-vars` / disable órfãos.
- Produces: se restarem warnings `no-img-element` só em `d4sign-dashboard.tsx`, documentar adiamento à Onda 5.

- [x] **Step 1: Capturar lista atual**

Run: `npm run lint`  
Registar contagem (baseline 2026-07-28: 0 errors, 43 warnings).

- [x] **Step 2: Remover imports/vars não usados nos ficheiros pequenos**

Prioridade (ficheiros curtos):

- `src/app/(crm)/crm/notifications/notification-list.tsx` — remover `useEffect` não usado.
- `src/app/api/crm/leads/[id]/contrato/route.ts` — remover import `buildContratoDocxTemplateData` se não usado.
- `src/components/crm/field-config-panel.tsx` — `allFields`.
- `src/components/crm/proposta-escopo-entry-form.tsx` — imports de catálogo não usados.
- `src/lib/crm/generate-contrato-docx.ts` — `hasPrazo`.
- `src/lib/crm/patch-lead-detail.ts` — `EMPRESA_BUNDLE_RE`.
- `src/lib/crm/proposta-escopo-preview.ts` — helpers não usados.
- `src/lib/crm/proposta-investimento-parcelas.ts` — `parcelasTemVencimentosCompletos`.
- `src/scripts/verify-leads-vs-sheet.test.ts` — remover `eslint-disable` órfãos de `no-console`.
- `src/components/crm/sharepoint-config-panel.tsx` — remover disable órfão.

Para cada ficheiro: apagar símbolo morto ou prefixar com uso real — **não** adicionar `eslint-disable` novos.

- [x] **Step 3: Corrigir `no-unused-expressions` em `d4sign-dashboard.tsx` (~linhas 690–693)**

Substituir expressões soltas por `void` explícito ou `if` com corpo — sem mudar comportamento de UI.

- [x] **Step 4: Re-correr lint**

Run: `npm run lint`  
Expected: 0 errors; warnings restantes só `no-img-element` (se adiados) ou zero.

- [x] **Step 5: Se restarem `no-img-element`, anotar no change-log**

```markdown
- Lint: warnings `no-img-element` em `d4sign-dashboard.tsx` adiados à Onda 5 (monolito).
```

---

### Task 6: Gate final Onda 1

**Files:**
- Modify: `docs/change-log.md`
- Modify: `docs/superpowers/plans/2026-07-27-system-hardening.md` (checkboxes finais)
- Modify: `docs/superpowers/plans/2026-07-28-onda-1-fecho-hardening.md` (marcar steps feitos)

**Interfaces:**
- Produces: evidência escrita das validações; Onda 1 pronta para handoff à Onda 2.

- [x] **Step 1: Correr validações em `crm/`**

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
npm audit
```

Expected:

- tests: pass
- lint: 0 errors (warnings conforme Task 5)
- tsc: exit 0
- build: exit 0 (com env placeholder se necessário, igual ao CI)
- audit: registar vulnerabilidades altas/críticas; não ignorar sem nota no change-log

- [x] **Step 2: Atualizar `docs/change-log.md` com resultados**

Incluir data, comandos, exit codes resumidos, e “Onda 1 fechada — próximo: Onda 2 autorização fina”.

- [x] **Step 3: Marcar Tasks 7–9 do plan 27/07 e este plan como concluídos onde aplicável**

- [x] **Step 4: Confirmar PNG intocado**

```powershell
git status -- CARDAPIO_FJ_BAR_2026_V2.png
git diff --check
```

Expected: sem alterações no PNG; sem erros de whitespace no diff das mudanças desta onda.

---

## Self-review (plan vs spec Onda 1)

| Requisito spec Onda 1 | Task |
|-----------------------|------|
| Fechar/validar plan 2026-07-27 | 1, 6 |
| Auth, policies, webhooks, RPC, RLS, timeouts | Já no código — auditados na tabela; sem reimplementação |
| Dependências + CI | 2, 3 |
| Lint / qualidade estática | 5 |
| Docs + verificação final | 4, 6 |
| Não misturar Ondas 2–5 | Global Constraints |

Placeholders: nenhum TBD. Commits: só se o utilizador pedir (constraint).
