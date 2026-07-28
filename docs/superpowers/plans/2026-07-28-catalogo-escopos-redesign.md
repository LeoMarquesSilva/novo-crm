# Catálogo de Escopos — Redesign Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesignar `/crm/admin/proposta-escopo` (master-detail) para criar e editar com o mesmo peso, corrigir bugs de estado/árvore/refresh, e alinhar o visual ao resto do CRM admin — sem mudar schema nem APIs de domínio.

**Architecture:** Manter shell + árvore + editores + dialog de criação. Extrair builders/helpers da árvore para testes. Estado local `ProposalCatalogAdminData` após CRUD; remover `router.refresh()` dos success handlers. Investimentos sem L1 fantasma `__all__` visível. Dirty-guard ao trocar seleção.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, componentes CRM existentes (`Button`, `Dialog`, `CrmSelect` se migrar área), tokens `primary-dark` / teal.

**Spec:** `docs/superpowers/specs/2026-07-28-catalogo-escopos-redesign-design.md`

## Global Constraints

- Fora de escopo: `proposta-escopo-por-area.tsx`, lead/kanban, schema Supabase, drag-and-drop entre áreas, preview Word além do textual atual.
- Não alterar contratos de `/api/admin/proposal-catalog` (POST/PATCH/DELETE/seed) além do consumo no cliente.
- Preservar `CARDAPIO_FJ_BAR_2026_V2.png`.
- Seguir `modal-select-safety.mdc` se o dialog passar a usar Base UI `Select` / `CrmSelect`.
- Commits só se o utilizador pedir explicitamente.
- Work from `c:\bkp\doc\new-crm\crm` on a feature branch (not silently on `main`).

### File map

| File | Role |
|------|------|
| `src/components/crm/scope-catalog/scope-catalog-shell.tsx` | Tabs, data, selection, seed, layout |
| `src/components/crm/scope-catalog/scope-tree.tsx` | Busca, collapse, seleção, + subtipo |
| `src/components/crm/scope-catalog/scope-catalog-tree.ts` (new) | `buildScopeTree`, `buildInvestmentTree`, filter helpers |
| `src/components/crm/scope-catalog/scope-catalog-tree.test.ts` (new) | Unit tests |
| `src/components/crm/scope-catalog/catalog-empty-detail.tsx` (new) | Empty coluna direita + CTAs |
| `src/components/crm/scope-catalog/scope-editor.tsx` | Subtipo editor; dirty + no refresh |
| `src/components/crm/scope-catalog/catalog-type-editor.tsx` | Tipo editor; dirty + no refresh |
| `src/components/crm/scope-catalog/catalog-delete-button.tsx` | Delete; no refresh |
| `src/components/crm/scope-catalog/new-item-dialog.tsx` | Create; select-after-create via callback |
| `src/app/(crm)/crm/admin/proposta-escopo/page.tsx` | Header only if needed |

---

### Task 1: Extrair builders da árvore + testes (TDD)

**Files:**
- Create: `src/components/crm/scope-catalog/scope-catalog-tree.ts`
- Create: `src/components/crm/scope-catalog/scope-catalog-tree.test.ts`
- Modify: `src/components/crm/scope-catalog/scope-catalog-shell.tsx` (import builders; re-export types if needed)

**Interfaces:**
- Produces:

```ts
export type ScopeTreeGroup = { key: string; label: string; items: ScopeTreeItem[] };
export type ScopeTreeItem = {
  key: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  subtypes: ScopeTreeSubtype[];
};
export type ScopeTreeSubtype = {
  key: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  parentBreadcrumb: string[];
};

export function buildScopeTree(data: ProposalCatalogAdminData): ScopeTreeGroup[];
/** Flat types as top-level items — NO visible `__all__` wrapper group. */
export function buildInvestmentTree(data: ProposalCatalogAdminData): ScopeTreeGroup[];
export function filterScopeTree(groups: ScopeTreeGroup[], query: string): ScopeTreeGroup[];
export function selectionStillValid(
  selection: { level: "type" | "subtype"; typeId?: string; subtypeId?: string } | null,
  data: ProposalCatalogAdminData,
  tab: "scope" | "investment",
): boolean;
```

Note: For investments, return one synthetic group with `key: "__investments__"` and `label: ""` (empty label = shell/tree hides L1 chrome) **or** change `ScopeTree` to accept `groups` where a group with `hideLabel: true` skips L1 UI. Prefer:

```ts
export type ScopeTreeGroup = {
  key: string;
  label: string;
  hideLabel?: boolean;
  items: ScopeTreeItem[];
};
```

`buildInvestmentTree` sets `hideLabel: true` and `label: ""`.

- [ ] **Step 1: Write failing tests** in `scope-catalog-tree.test.ts`

Cover at least:
1. `buildScopeTree` groups by `areaKey`, sorts types/subtypes.
2. `buildInvestmentTree` returns a single group with `hideLabel: true` and all investment types as items (no visible “Investimentos” L1 needed for open-state hacks).
3. `filterScopeTree` keeps ancestors when subtype matches.
4. `selectionStillValid` false when subtype id deleted from data.

Use a minimal fixture object matching `ProposalCatalogAdminData` shape (only fields builders read: `adminRows.scopeTypes`, `scopeSubtypes`, `investmentTypes`, `investmentSubtypes`).

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/components/crm/scope-catalog/scope-catalog-tree.test.ts`  
Expected: fail (module missing).

- [ ] **Step 3: Implement `scope-catalog-tree.ts`** by moving logic from shell (`buildScopeTree` / `buildInvestmentTree` ~lines 337–409) and adding `filterScopeTree` + `selectionStillValid`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Update shell** to import builders/types from the new module; delete local duplicates; keep page compiling (`npx tsc --noEmit` or focused test + typecheck).

---

### Task 2: Shell — remover refresh + seleção pós-CRUD + empty detail

**Files:**
- Create: `src/components/crm/scope-catalog/catalog-empty-detail.tsx`
- Modify: `src/components/crm/scope-catalog/scope-catalog-shell.tsx`
- Modify: `src/components/crm/scope-catalog/scope-editor.tsx` (remove `router.refresh` after save)
- Modify: `src/components/crm/scope-catalog/catalog-type-editor.tsx` (same)
- Modify: `src/components/crm/scope-catalog/catalog-delete-button.tsx` (same)
- Modify: `src/components/crm/scope-catalog/new-item-dialog.tsx` (extend `onCreated` to pass created id/kind if needed)

**Interfaces:**
- Produces shell handlers:

```ts
function applyCatalog(next: ProposalCatalogAdminData): void; // setData only — NO router.refresh
function handleCreated(
  next: ProposalCatalogAdminData,
  created?: { tab: "scope" | "investment"; level: "type" | "subtype"; id: string },
): void;
```

- `CatalogEmptyDetail` props:

```ts
type CatalogEmptyDetailProps = {
  tab: "scope" | "investment";
  onCreateType: () => void;
};
```

- [ ] **Step 1: Create `catalog-empty-detail.tsx`**

Replace inline `EmptyState` in shell. Copy + CTAs: “Novo tipo de escopo/investimento” calling `onCreateType`. Keep icon BookOpenText / WalletCards.

- [ ] **Step 2: Remove all `router.refresh()`** from catalog success paths (shell `handleCreated`, `handleCatalogDeleted`, `seedDefaults`; editors; delete button). Remove unused `useRouter` imports.

- [ ] **Step 3: After create, select the new item**

In `NewItemDialog`, after successful POST, API returns full `data` but not the new id explicitly. Resolve id by:
- comparing previous vs next lists, OR
- matching `label` + parent just created (fragile), OR
- extend API response — **YAGNI: prefer client diff**:

```ts
function findCreatedId(
  prev: ProposalCatalogAdminData,
  next: ProposalCatalogAdminData,
  kind: NewItemKind,
): string | null
```

Implement in shell or tree helper; select type/subtype and set breadcrumb. Add unit test for `findCreatedId` in the tree test file if pure.

- [ ] **Step 4: On delete, clear selection if `!selectionStillValid(...)`**

- [ ] **Step 5: Wire empty detail** in shell main pane; verify `npm test -- scope-catalog-tree` still passes.

---

### Task 3: Árvore — investimentos, collapse default, filtro área

**Files:**
- Modify: `src/components/crm/scope-catalog/scope-tree.tsx`
- Modify: `src/components/crm/scope-catalog/scope-catalog-shell.tsx` (pass `areaFilter` / `hideLabel` support)

**Interfaces:**
- Extend `ScopeTree` props:

```ts
type Props = {
  groups: ScopeTreeGroup[];
  selection: ScopeTreeSelection | null;
  onSelect: (s: ScopeTreeSelection) => void;
  onCreateSubtype?: (typeId: string, typeLabel: string) => void;
  emptyHint: string;
  /** When set (Escopos tab), only show groups whose key is in the set; empty set = all */
  areaFilterKeys?: string[] | null;
  /** Collapse L1 by default when group count > this (default 3) */
  collapseL1Above?: number;
};
```

- [ ] **Step 1: Honor `group.hideLabel`**

If `hideLabel`, render items directly without L1 chevron/header (fixes investment “ghost” group and removes need for `filtered.length <= 1` hack in `isL1Open`).

- [ ] **Step 2: Default collapse**

Initialize `closedL1` to all group keys when `groups.length > (collapseL1Above ?? 3)` and no search query. When search active, keep auto-expand behavior.

- [ ] **Step 3: Area filter UI in tree header (Escopos only)**

Shell passes unique `areaKey`s from `data.adminRows.scopeTypes`. Use compact chips or native/CrmSelect with **human labels** (area key IS the label today). Filter groups before `ScopeTree` or inside via `areaFilterKeys`.

- [ ] **Step 4: Delete the investment open-state hack** (`isL1Open` special cases for `__all__`) once `hideLabel` works.

- [ ] **Step 5: Manual smoke note in report** — Escopos many areas collapsed; Investimentos list visible; search expands matches.

---

### Task 4: Dirty-guard ao trocar seleção

**Files:**
- Modify: `src/components/crm/scope-catalog/scope-editor.tsx`
- Modify: `src/components/crm/scope-catalog/catalog-type-editor.tsx`
- Modify: `src/components/crm/scope-catalog/scope-catalog-shell.tsx`

**Interfaces:**
- Editors expose dirty via callback or imperative handle. Prefer callback:

```ts
// ScopeEditor / CatalogTypeEditor
onDirtyChange?: (dirty: boolean) => void;
```

Shell keeps `editorDirty` boolean. When `setActiveSelection` would change selection:

```ts
function requestSelect(next: ScopeTreeSelection | null) {
  if (editorDirty && !window.confirm("Descartar alterações não salvas?")) return;
  setActiveSelection(next);
}
```

Use `window.confirm` for YAGNI (or AlertDialog if already imported nearby — confirm is OK per speed).

- [ ] **Step 1: Compute dirty** in both editors (`draft !== saved` fields) and call `onDirtyChange` in `useEffect`.

- [ ] **Step 2: Shell wraps selection** through `requestSelect`; also guard tab switch if dirty.

- [ ] **Step 3: Reset dirty on successful save** (`onDirtyChange(false)`).

- [ ] **Step 4: Verify no refresh** still holds; typecheck.

---

### Task 5: Polish visual + create parity (“Adicionar subtipo” no type editor)

**Files:**
- Modify: `src/components/crm/scope-catalog/scope-catalog-shell.tsx` (layout classes)
- Modify: `src/components/crm/scope-catalog/scope-tree.tsx` (density)
- Modify: `src/components/crm/scope-catalog/catalog-type-editor.tsx` (CTA adicionar subtipo)
- Modify: `src/components/crm/scope-catalog/catalog-empty-detail.tsx` if needed

**Interfaces:**
- `CatalogTypeEditor` gains optional `onAddSubtype?: () => void` — shell passes opener for `NewItemDialog` with parent type id/label.

- [ ] **Step 1: Visual shell**

Replace heavy glass (`bg-white/72`, `rounded-[24px]`) with solid admin panel pattern consistent with other admin pages (border `border-primary-dark/10`, `bg-white` / `bg-card`, `rounded-2xl`). Independent scroll: aside `max-h-[calc(100dvh-12rem)] overflow-y-auto`, main same.

- [ ] **Step 2: Tree density** — tighter padding, clearer selected state (`bg-primary-dark/10` + left border).

- [ ] **Step 3: Type editor CTA** “Adicionar subtipo” calling `onAddSubtype`.

- [ ] **Step 4: Seed banner** — keep amber empty catalog; tighten spacing to match new shell.

- [ ] **Step 5: Optional** — if touching area field in `NewItemDialog`, migrate native `<select>` to `CrmSelect` + `Dialog modal={false}` + `isInteractionFromBaseUiSelectLayer`. Only if time; native select already works (spec B5 optional).

---

### Task 6: Verificação final + docs

**Files:**
- Modify: `docs/change-log.md` (append entry)
- Modify: `docs/system-context.md` only if admin escopos section exists / needs one line

- [ ] **Step 1: Run suite**

```powershell
npm test -- src/components/crm/scope-catalog
npm test
npx tsc --noEmit
npm run lint
```

Expected: tests pass; 0 lint errors on touched files.

- [ ] **Step 2: Manual checklist (document in change-log)**

- [ ] Seed (if empty) / skip if data exists  
- [ ] Create scope type → auto-select  
- [ ] Add subtype from tree + from type editor  
- [ ] Edit template → save (no full page flash)  
- [ ] Dirty switch selection → confirm  
- [ ] Switch Escopos ↔ Investimentos (list visible)  
- [ ] Delete subtype → selection cleared  
- [ ] Search + area filter  

- [ ] **Step 3: Append `docs/change-log.md`**

```markdown
## 2026-07-28 — Catálogo de Escopos (admin redesign)

- Spec: docs/superpowers/specs/2026-07-28-catalogo-escopos-redesign-design.md
- Bugs: B1–B8 (refresh, investment tree, orphan selection, dirty, empty detail, …)
- Tests: scope-catalog-tree
```

- [ ] **Step 4: Confirm lead files untouched**

```powershell
git diff --name-only -- src/app/(crm)/crm/leads/
```

Expected: no `proposta-escopo-por-area.tsx` in this work’s diff (unless accidental — revert).

---

## Self-review (plan vs spec)

| Spec section | Tasks |
|--------------|-------|
| Arquitetura master-detail | 2, 3, 5 |
| Sem router.refresh | 2 |
| Investimentos sem L1 fantasma | 1, 3 |
| Collapse + filtro área | 3 |
| Create parity + select after create | 2, 5 |
| Dirty-guard | 4 |
| Visual CRM | 5 |
| Bugs B1–B8 | 1–5 |
| Testes helpers | 1, 6 |
| Fora de escopo lead | Global + Task 6 Step 4 |

No TBD placeholders. Commits deferred to user request.
