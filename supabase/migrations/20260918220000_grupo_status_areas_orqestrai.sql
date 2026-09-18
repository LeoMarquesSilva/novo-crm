-- Espelho local de status/áreas do OrquestrAI para /crm/clientes e a grade pública.
-- Sem isso, a UI depende de um fetch cruzado que, se falhar, renderiza "—".

alter table public.grupos_economicos
  add column if not exists gestor_atividade text
    check (gestor_atividade is null or gestor_atividade in ('ativo', 'inativo')),
  add column if not exists responsible_area text,
  add column if not exists legal_areas text[] not null default '{}'::text[];

comment on column public.grupos_economicos.gestor_atividade is
  'Cliente ativo/inativo espelhado de email_client_groups.gestor_atividade (OrquestrAI).';
comment on column public.grupos_economicos.responsible_area is
  'Área responsável espelhada de email_client_groups.responsible_area.';
comment on column public.grupos_economicos.legal_areas is
  'Áreas jurídicas espelhadas de email_client_groups.legal_areas (SIOE no OrquestrAI).';

create index if not exists grupos_economicos_gestor_atividade_idx
  on public.grupos_economicos (gestor_atividade);
