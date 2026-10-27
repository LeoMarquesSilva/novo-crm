-- Modelos das mensagens de WhatsApp editáveis pelo admin (Integrações → WhatsApp), teste ponta a ponta 4.
-- O texto padrão de cada modelo fica no código (`src/lib/crm/whatsapp/templates.ts`); uma linha aqui
-- sobrescreve o texto e/ou desliga o modelo. Sem linha (ou sem a tabela), vale o padrão do código.

create table if not exists public.whatsapp_message_templates (
  key text primary key,
  body text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id) on delete set null
);

comment on table public.whatsapp_message_templates is
  'Sobrescrita dos modelos de WhatsApp do CRM (chaves em src/lib/crm/whatsapp/templates.ts). Placeholders {{nome}}.';

-- Só o servidor (service role) lê e grava.
alter table public.whatsapp_message_templates enable row level security;
