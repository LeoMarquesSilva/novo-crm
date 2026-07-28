# Design: Redesign do Catálogo de Escopos (admin)

**Data:** 2026-07-28  
**Abordagem:** B — Redesign master-detail + correção de bugs  
**Rota:** `/crm/admin/proposta-escopo`  
**Fora de escopo:** preenchimento de escopo no lead (`proposta-escopo-por-area.tsx`) — Onda futura

## 1) Problema

O catálogo admin é o ponto de verdade dos modelos de escopo e investimento usados nas propostas. Hoje a página:

- parece pesada (card “vidro”, densidade irregular);
- mistura bem criar e editar, mas o fluxo é pouco claro (árvore sempre expandida, empty states fracos, criar só via dialog genérico);
- sofre de `router.refresh()` em cascata após CRUD, seleção frágil ao trocar abas Escopos/Investimentos, e hacks na árvore de investimentos (grupo único).

Objetivo: **criar e editar com o mesmo peso**, visual alinhado ao CRM, comportamento previsível, sem mudar o modelo de dados nem as APIs de domínio.

## 2) Objetivos de sucesso

1. Admin encontra um tipo/subtipo em ≤2 cliques + busca.
2. Criar tipo e subtipo é óbvio a partir da árvore e do CTA.
3. Editar template/placeholders, salvar e ver confirmação sem “piscar” a página inteira.
4. Trocar Escopos ↔ Investimentos não perde contexto de forma confusa nem esconde a lista.
5. Delete limpa seleção órfã e atualiza contagens.
6. Catálogo vazio: empty state + “Importar padrões” claro.
7. Lint/typecheck/testes relevantes passam; sem regressão no payload devolvido por `/api/admin/proposal-catalog`.

## 3) Fora de escopo

- Tab Proposta do lead / kanban de confecção.
- Mudança de schema Supabase das tabelas `proposal_scope_*` / `proposal_investment_*`.
- Reordenação drag-and-drop entre áreas (manter setas up/down se já existirem no editor).
- Preview Word live no admin além do preview textual já existente no `ScopeEditor`.

## 4) Arquitetura de ecrã (aprovada)

```
┌─────────────────────────────────────────────────────────────┐
│ CrmPageHeader (manter; stats ok)                            │
├─────────────────────────────────────────────────────────────┤
│ Toolbar: [Escopos n] [Investimentos n]     [+ Novo tipo]    │
├──────────────────┬──────────────────────────────────────────┤
│ Busca            │ Breadcrumb: Área › Tipo › Subtipo        │
│ (filtro área*)   │                                          │
│ Árvore           │ Editor (tipo OU subtipo)                 │
│  L1 área         │  ou EmptyDetail                          │
│   L2 tipo [+]    │                                          │
│    L3 subtipo    │                                          │
└──────────────────┴──────────────────────────────────────────┘
* filtro área só na aba Escopos
```

- Coluna esquerda ~280–320px; direita flex.
- Menos “glass”: fundo sólido alinhado a outras páginas admin (`border`, `bg-card` / tokens CRM existentes).
- Altura útil: `min-h` razoável + scroll independente por coluna (árvore vs editor).

## 5) Componentes

| Unidade | Responsabilidade |
|---------|------------------|
| `page.tsx` | Auth admin + load + header (inalterado na API) |
| `scope-catalog-shell.tsx` | Tabs, seleção, sync `data`, empty seed, orquestra painéis |
| `scope-tree.tsx` | Busca, filtro área, expand/collapse, seleção, “+” subtipo |
| `scope-editor.tsx` | Draft/save/preview subtipo escopo ou investimento |
| `catalog-type-editor.tsx` | Editar tipo (label, área, ordenação se aplicável) |
| `new-item-dialog.tsx` | Dialog criar (manter; `modal={false}` + Base UI select safety se houver Select) |
| `catalog-delete-button.tsx` | Confirm delete |
| (novo, fino) `catalog-empty-detail.tsx` | Empty da coluna direita |
| (opcional) `catalog-area-filter.tsx` | Chips/select de área |

Não inventar store global: estado no shell + callbacks `onSaved` / `onCreated` / `onDeleted` com `ProposalCatalogAdminData` completo (já é o contrato da API).

## 6) Fluxo de dados

1. SSR carrega `loadProposalCatalogAdmin()` → `initialData`.
2. Shell mantém `data` em state; `buildScopeTree` / `buildInvestmentTree` derivados.
3. CRUD (POST/PATCH/DELETE `/api/admin/proposal-catalog`) devolve `{ ok, data }`.
4. Handlers atualizam `setData(data)` e ajustam seleção (select novo item após create; `null` se deleted era o selecionado).
5. **Remover** `router.refresh()` dos handlers de sucesso no catálogo (shell, editor, type editor, delete, seed). O SSR só revalida na próxima navegação; o painel é a fonte de verdade na sessão.
6. Se `initialData` mudar por navegação externa, sync opcional via `useEffect` só quando a referência SSR for mais nova **e** não houver draft dirty no editor (editor deve expor `isDirty` ao shell ou o shell evita overwrite enquanto editor dirty — preferência: editor controla draft e não remonta se `row.id` igual).

## 7) Criar (paridade com editar)

**Novo tipo**

- CTA toolbar → `NewItemDialog` (`scope_type` / `investment_type`).
- Após sucesso: selecionar o tipo criado na árvore e abrir `CatalogTypeEditor`.

**Novo subtipo**

- “+” no nó do tipo **ou** botão no editor do tipo “Adicionar subtipo” → dialog `scope_subtype` / `investment_subtype` com parent pré-preenchido.
- Após sucesso: selecionar o subtipo e abrir `ScopeEditor`.

**Seed**

- Só se catálogo vazio; banner no topo da shell (manter ideia; visual mais limpo).

## 8) Editar

- Seleção **tipo** → `CatalogTypeEditor`.
- Seleção **subtipo** → `ScopeEditor` (templates, placeholders, preview exemplo, save, delete, reordenar se já existir).
- Dirty: botão Salvar desabilitado se sem mudanças; aviso ao trocar seleção com dirty (“Descartar alterações?”) — confirm nativo ou AlertDialog existente no design system.
- Feedback: toast ou banner inline de sucesso/erro (preferir padrão já usado no CRM; se não houver toast global, banner no topo do editor).

## 9) Árvore — comportamento

1. **Escopos:** L1 = área; L2 = tipo; L3 = subtipo. Com muitas áreas, L1 **fechado por defeito**; ao selecionar/buscar, expandir ancestrais.
2. **Investimentos:** sem áreas — lista plana de tipos → subtipos. **Não** reutilizar o hack `isL1Open` que força aberto só quando `filtered.length <= 1`; modelar árvore de investimentos sem L1 artificial `__all__`, ou tratar `__all__` sempre aberto e invisível (só renderizar L2/L3).
3. Busca: filtra e auto-expande matches (já parcialmente feito).
4. Filtro por área (Escopos): chips ou `CrmSelect` com labels humanas (nunca ids internos no trigger).
5. Highlight claro do selecionado; hover/focus acessíveis.

## 10) Bugs a corrigir (checklist)

| ID | Bug | Correção |
|----|-----|----------|
| B1 | `router.refresh` em cascata | Remover dos success handlers do catálogo |
| B2 | Investimentos “somem” / L1 artificial | Árvore investimento sem grupo fantasma visível |
| B3 | Seleção órfã após delete | `onDeleted` zera seleção se id removido |
| B4 | Troca de aba com seleção da outra aba | Manter seleções separadas (já existe) + empty detail coerente; não mostrar editor da aba errada |
| B5 | Dialog + Select (área no create) | `modal={false}` + `isInteractionFromBaseUiSelectLayer` |
| B6 | Contagens desatualizadas na UI | Vêm do `data` devolvido pela API — garantir UI lê `scopeSubtypeCount` etc. do state |
| B7 | Empty detail fraco | Componente dedicado com CTAs |
| B8 | Perder draft ao trocar item | Confirm se dirty |

## 11) Visual (dentro do design system CRM)

- Remover excesso de `bg-white/72`, `rounded-[24px]` se destoarem do resto do admin; usar o mesmo card/panel pattern de `user-management` / campos.
- Tipografia: hierarquia clara (breadcrumb > título do item > campos).
- Densidade: árvore compacta (`text-sm`, padding controlado); editor com secções (“Identificação”, “Template”, “Preview”).
- Cores de área: reutilizar `getPracticeAreaColors` / ícones existentes.
- Não introduzir tema purple/glow; preservar tokens `primary-dark` / teal do CRM.

## 12) Erros e segurança

- Continua `requireAdmin` na page e nas rotas admin.
- Erros de API: mensagem no dialog/editor; não engolir.
- Delete: confirmação explícita (já existe `CatalogDeleteButton`).

## 13) Testes

- Unitários leves se extrair helpers de árvore (build/filter/seleção pós-delete) — preferível em `scope-catalog-tree.test.ts`.
- Manual: seed → criar tipo → criar subtipo → editar template → save → trocar aba → delete → busca/filtro área.
- `npm test`, `npx tsc --noEmit`, smoke visual na rota admin.

## 14) Ordem de implementação (para o plan)

1. Estado shell: remover refresh; dirty guard; empty detail.
2. Árvore: investimentos + collapse default + filtro área.
3. Fluxos create (select after create) + dialog select safety.
4. Polish visual shell/tree/editor headers.
5. Checklist B1–B8 + testes helpers + verificação.

## 15) Riscos

| Risco | Mitigação |
|-------|-----------|
| Remover refresh atrasa sync multi-tab | Aceitável para admin single-user; documentar |
| Regressão no editor de 696 linhas | Mudar shell/tree primeiro; editor só dirty-guard + refresh removal |
| Scope creep para lead | Explicitamente fora; não abrir `proposta-escopo-por-area` |
