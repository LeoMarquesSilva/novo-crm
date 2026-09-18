# Mapa de Arquivos — Redesign V2 (CRM BP)

> Referência rápida de "onde fica o quê", organizada pelas mesmas áreas do `DESIGN_SYSTEM_V2_CRM_BP.md`. Objetivo: qualquer agente (principalmente os Grok, com escopo estreito) encontra o arquivo certo sem precisar varrer o repositório inteiro. Caminhos relativos a `C:\bkp\doc\new-crm\crm\`.

Levantado por listagem direta do repositório em 14/09/2026. Se a estrutura mudar, atualize este arquivo (não precisa ser exaustivo — só os pontos de entrada mais usados).

---

## Fundação (tokens, fontes, CSS global)

- `src/app/globals.css` — tokens de cor, tipografia, espaçamento, raio, sombra, motion, z-index (CSS custom properties). **Fase 1.**
- `src/app/layout.tsx` — carregamento de fonte (Plus Jakarta Sans) e layout raiz.

## Layout global / AppShell / Sidebar

- `src/components/crm/app-shell.tsx` — shell principal, sidebar, navegação. **Fase 3.**
- `src/components/crm/crm-page-header.tsx` — PageHeader (título, breadcrumb, ações).
- `src/components/crm/crm-entity-header.tsx` — EntityHeader da ficha (Fase 4, criado a partir do detalhe do lead).
- `src/components/crm/crm-surface-header.tsx` — header de superfície/card.
- `src/components/crm/sidebar-account-menu.tsx` — menu de conta na sidebar.
- `src/components/crm/crm-notifications-bell.tsx` — sino de notificações.

## Componentes base (shadcn/ui) — `src/components/ui/`

Primitivos usados em todo o produto. Mudança aqui afeta tudo — priorizar na Fase 2.

`button.tsx` · `input.tsx` · `select.tsx` · `dialog.tsx` · `alert-dialog.tsx` · `tabs.tsx` · `table.tsx` · `card.tsx` · `badge.tsx` · `avatar.tsx` · `alert.tsx` · `popover.tsx` · `tooltip.tsx` · `switch.tsx` · `textarea.tsx` · `label.tsx` · `progress.tsx` · `skeleton.tsx` · `date-input-br.tsx` · `time-input-br.tsx` · `calendar-br.tsx`

## Componentes CRM compartilhados — `src/components/crm/` (nível raiz da pasta)

- `crm-select.tsx` — wrapper do Select para o padrão CrmSelect (nunca mostrar UUID cru).
- `crm-user-label.tsx` — CrmUserLabel (avatar + nome).
- `dynamic-form.tsx` — motor de formulário dinâmico usado em vários fluxos.
- `sticky-note.tsx`, `justified-document-text.tsx` — utilitários visuais menores.

## Kanban de Leads / Pipeline

Rota: `src/app/(crm)/crm/leads/page.tsx`

Componentes (`src/components/crm/`):
- `pipeline-board.tsx` (arquivo grande, ~62KB) — board Kanban principal
- `pipeline-board-skeleton.tsx`, `pipeline-kanban-panel-shell.tsx`, `pipeline-kanban-status.tsx`
- `pipeline-lead-card-content.tsx` — conteúdo do card de lead
- `pipeline-stage-panels.tsx` — colunas/etapas
- `leads-pipeline-toolbar.tsx` — toolbar de filtros do pipeline
- `dashboard-etapa-distribution.tsx`, `days-in-stage-panel.tsx`, `kpi-cards.tsx`, `indicator-approval-queue.tsx`

**Agente responsável: Grok — Leads/Kanban.**

## Novo Lead (modal)

`src/components/crm/new-lead-modal/` — `index.ts`, `modal-header.tsx`, `input-field.tsx`, `select-field.tsx`, `searchable-picker.tsx`, `section-card.tsx`, `sticky-footer.tsx`, `tag-selectable.tsx`

Relacionados: `lead-intake-empresa-block.tsx`, `lead-intake-types.ts`, `lead-add-empresa-button.tsx` (em `leads/[id]/`), `escopo-direcionamento-area-picker.tsx`

**Agente responsável: Grok — Leads/Kanban** (é parte do fluxo de entrada de leads).

## Detalhe do Lead (shell) — Fase 4, Grok Leads/Kanban

Rota: `src/app/(crm)/crm/leads/[id]/` — mesma pasta das Propostas/Contratos abaixo, mas
**fronteira de propriedade é por responsabilidade, não por pasta**: o *shell* da ficha
(breadcrumb, EntityHeader sem hero escuro, linha de contexto, navegação das tabs) é
Fase 4/Leads; o *conteúdo* de cada tab de proposta/contrato é Fase 5/Propostas-Contratos
(seção seguinte). Ver §29.4 do documento-fonte.

- `page.tsx` (~34KB) — shell da página de detalhe do lead
- `lead-detail-view.tsx` (~86KB) — view principal do detalhe: EntityHeader, linha de
  contexto (etapa/valor/responsável/atualização), tabs `line`. **Não** o conteúdo interno
  das tabs de proposta/contrato, só o chrome de navegação entre elas.
- `lead-detail-field-editor.tsx`, `lead-notes-tab.tsx`, `lead-d4sign-panel.tsx`, `lead-delete-button.tsx`

**Agente responsável: Grok — Leads/Kanban.**

## Propostas / Contratos (builder) — Fase 5, Grok Propostas/Contratos

Rota: `src/app/(crm)/crm/leads/[id]/` (conteúdo das tabs Proposta/Contrato) — **atenção:
área jurídica sensível.**

- `proposta-document-builder.tsx` (~75KB) — **builder de propostas**
- `proposta-escopo-por-area.tsx` (~53KB), `proposta-escopo-area-coordenacao.tsx` — escopo da proposta
- `gerar-proposta-docx-button.tsx` — geração do documento
- `contrato-document-builder.tsx` (~147KB, o maior arquivo do projeto) — **builder de contratos**
- `contrato-object-panels.tsx` (+ `.test.tsx`) — painéis do objeto contratual
- `contract-billing-onboarding-panel.tsx`

Componentes de apoio em `src/components/crm/`:
- `proposta-brl-currency-input.tsx`, `proposta-investimento-consolidado-form.tsx`, `proposta-investimento-parcelas-fields.tsx`, `proposta-escopo-entry-form.tsx`, `proposal-catalog-admin-panel.tsx`

**Agente responsável: Grok — Propostas/Contratos.** Não reescrever cláusulas, valores, lógica de geração de documento — só migração visual (layout, espaçamento, tipografia, estados de salvamento).

## Contratos (hub / carteira, fora do fluxo do lead)

Rota: `src/app/(crm)/crm/contratos/page.tsx`, `contratos/[id]/`, `contratos/simulacao/`, `contratos/importacao/`

Componentes: `src/components/crm/contracts/` — `contracts-hub.tsx`, `contract-setup-wizard.tsx`, `contract-detail-shell.tsx`, `contract-closing-review.tsx`, `contract-closings-tab.tsx`, `contract-portfolio-tab.tsx`, `contract-renewals-tab.tsx`, `contract-responsibles-editor.tsx`, `contract-versions-panel.tsx`, `contract-shares-commissions-editor.tsx`, `contract-components-editor.tsx`, `contract-areas-editor.tsx`, `contract-allocations-editor.tsx`, `contract-money-percent-inputs.tsx`, `contract-setup-form-helpers.ts`, `ensure-contract-draft-banner.tsx`, `contract-import-shell.tsx`

Lib: `src/lib/contract-import/` (extract/map/match/persist + `sioe-rateio.ts`), `src/lib/orqestrai/client-groups.ts`, `src/lib/sioe/` (`client.ts`, `sync-carteira.ts`, `rateios.ts`)

Também relevante: `contract-signers-kanban-panel.tsx` (Kanban de signatários, em `src/components/crm/`)

**Agente responsável: Grok — Propostas/Contratos** (mesma área sensível).

## Clientes

Rota: `src/app/(crm)/crm/clientes/page.tsx` — carteira agrupada (OrquestrAI + títulos SIOE). Botão: `src/components/crm/carteira-sync-button.tsx`. Cron: `src/app/api/cron/carteira-grupos-sync/route.ts`.

## Documentos (due diligence)

Rota: `src/app/(crm)/crm/documentos/page.tsx` + `due-diligence-panel.tsx`, `due-timeline-ui.tsx`

## Administração

Rota: `src/app/(crm)/crm/admin/` — subpastas `campos/`, `clausulas/`, `documentos/`, `integracoes/`, `proposta-escopo/`, `usuarios/`

Componentes (`src/components/crm/`): `field-config-panel.tsx`, `clause-templates-admin-panel.tsx`, `proposal-catalog-admin-panel.tsx`, `user-management-panel.tsx`, `rd-sync-admin-panel.tsx`, `sharepoint-config-panel.tsx`, `whatsapp-due-config-panel.tsx`, `lead-email-config-panel.tsx`, `integracoes-admin-tabs.tsx`, `scope-catalog/`, `scope-import/`, integração D4Sign: `d4sign-dashboard.tsx`, `d4sign-health-panel.tsx`, `d4sign-embed-dialog.tsx`, `d4sign-link-lead-dialog.tsx`, `d4sign-view-dialog.tsx`

## Notificações / Perfil / Login

- Rota: `src/app/(crm)/crm/notifications/`, `src/app/(crm)/crm/perfil/`, `src/app/login/`

## Zona de regra de negócio — NÃO mexer sem necessidade explícita

- `src/modules/crm/{application,domain,infrastructure}/`
- `src/modules/contracts/{application,domain,infrastructure}/`
- `src/lib/`, `src/data/`

Se uma tarefa "só visual" parecer exigir mudança nessas pastas, é sinal de alerta — parar e perguntar ao Lead antes de prosseguir.
