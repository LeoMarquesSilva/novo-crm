# CRM Jurídico

CRM com Next.js 16, Supabase, kanban de oportunidades, DUE por área, proposta/contrato e integração D4Sign.

## Setup

1. Instale dependências:

```bash
npm install
```

2. Configure variáveis de ambiente:

```bash
cp .env.example .env.local
```

Preencha pelo menos:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (importações RD, rotas admin, webhooks)
- `RD_CRM_TOKEN` / `RD_WEBHOOK_SECRET` (opcional, sync RD)
- Credenciais D4Sign conforme `.env.example` (envio e webhook de contrato)

3. Rode o projeto:

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Estrutura

- `src/app/(crm)/crm` — páginas do CRM (leads, admin, perfil)
- `src/app/api/crm` — APIs autenticadas (leads, transição, DUE, proposta, contrato)
- `src/modules/crm` — domínio, aplicação e integrações
- `src/lib/crm` — helpers (histórico, DUE, D4Sign, notificações)
- `supabase/migrations` — schema e RLS (aplicar no projeto Supabase)

Documentação de contexto: `docs/system-context.md`.

## Histórico do lead

Eventos de atividade são gravados em `lead_activity_events` e exibidos na aba **Histórico** da ficha (`/crm/leads/[id]`). Mutations relevantes chamam `recordLeadActivityEvent` no servidor e `router.refresh()` no cliente quando o histórico precisa atualizar na mesma sessão.

## Modais com Select

Dialogs que contêm `Select` (Base UI) usam `modal={false}` e o helper `isInteractionFromBaseUiSelectLayer` / `dialogSelectOutsideHandlers` — ver `.cursor/rules/modal-select-safety.mdc`.
