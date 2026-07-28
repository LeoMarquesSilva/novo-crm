# CRM change log técnico

Formato: data (ISO) | onda | resumo | validações.

## 2026-07-28 — Onda 1 (fechada)

- Spec: `docs/superpowers/specs/2026-07-28-crm-ajuste-completo-design.md`
- Plan de fecho: `docs/superpowers/plans/2026-07-28-onda-1-fecho-hardening.md`
- Docs (Task 4): `AGENTS.md`, `docs/system-context.md`, `docs/change-log.md`
- CI (Task 2): `.github/workflows/ci.yml`
- Deps (Task 3): `shadcn` movido para `devDependencies`
- Lint (Task 5): 43→3 warnings; 0 errors; `no-img-element` adiados Onda 5

### Gate final (Task 6) — 2026-07-28

| Comando | Exit |
|---------|-----:|
| `npm test` | 0 — 24 files, 113 tests |
| `npm run lint` | 0 — 0 errors, 3 warnings (`no-img-element`) |
| `npx tsc --noEmit` | 0 |
| `npm run build` | 0 — env placeholder Supabase (igual CI) |
| `npm audit` | 1 — 5 vulns (2 low, 3 high); ver abaixo |

**Audit:** `@babel/core` (low), `brace-expansion` (high, fixável), `esbuild` (low, fixável), `js-yaml` (high, fixável), `xlsx` (high, sem fix upstream). Nenhuma critical.

**Lint adiado Onda 5:** `@next/next/no-img-element` em `d4sign-dashboard.tsx`, `contrato-document-builder.tsx`.

### Fecho de revisão final — 2026-07-28

- Segurança P1: autorização explícita de visualização de PDF D4Sign por role, regra de documento órfão exclusiva para admin e validação da oportunidade vinculada.
- Segurança P1: RPCs `admin_change_user_role` e `admin_delete_user` serializam a contagem de admins e eliminam a corrida de último administrador; essas correções fecham as lacunas de segurança restantes da revisão final da Onda 1.
- Adiado: bump advisory de Next.js/eslint-config-next (Task 7 Step 1), pois exige janela de compatibilidade dedicada.
- Adiado: padrões React 19 de refs/ícones/estado derivado (Task 8 Steps 2–4), pois exigem regressão visual e funcional transversal.

**Onda 1 fechada — próximo: Onda 2 autorização fina.**

## 2026-07-28 — Catálogo de escopos (admin) — redesign

- Spec: `docs/superpowers/specs/2026-07-28-catalogo-escopos-redesign-design.md`
- Plan: `docs/superpowers/plans/2026-07-28-catalogo-escopos-redesign.md`
- Branch: `catalogo-escopos-redesign` (sem commit automático)
- Rota: `/crm/admin/proposta-escopo` — fora de escopo: `proposta-escopo-por-area` (lead)

### Bugs corrigidos (B1–B8)

| ID | Correção |
|----|----------|
| B1 | Removido `router.refresh()` dos handlers CRUD do catálogo |
| B2 | Investimentos sem L1 fantasma (`hideLabel`, lista plana) |
| B3 | Seleção órfã limpa via `selectionStillValid` pós-delete |
| B4 | Seleções separadas por aba + empty detail coerente |
| B5 | **Ignorado intencionalmente** — `NewItemDialog` mantém `<select>` nativo (sem Base UI Select); padrão `modal-select-safety` não aplicável |
| B6 | Contagens da UI lidas do `data` devolvido pela API |
| B7 | `catalog-empty-detail.tsx` com CTAs |
| B8 | Dirty-guard (`window.confirm`) ao trocar seleção/aba |

### Testes

- `scope-catalog-tree.test.ts`: 14 testes (builders, filtro, seleção pós-CRUD, `findCreatedId`)

### Gate final (Task 6) — 2026-07-28

| Comando | Exit |
|---------|-----:|
| `npm test -- src/components/crm/scope-catalog` | 0 — 1 file, 14 tests |
| `npm test` | 0 — 25 files, 134 tests |
| `npx tsc --noEmit` | 0 |
| `npm run lint` | 0 — 0 errors, 4 warnings pré-existentes (`no-img-element` ×3, `no-unused-vars` ×1) |
| `git diff --name-only -- src/app/(crm)/crm/leads/` | 0 — sem alterações em leads |

**Smoke manual (browser): pendente** — seed → criar tipo/subtipo → editar/salvar → trocar aba → delete → busca/filtro área.
