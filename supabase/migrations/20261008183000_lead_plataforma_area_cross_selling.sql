-- Subtipo Plataforma (Lead Digital) e área do Cross Selling.
-- Versionada localmente; NÃO aplicada no remoto nesta entrega.
-- Captador reusa lead_intakes.solicitante_nome + oportunidades.solicitante_email (sem coluna nova).

alter table public.lead_intakes
  add column if not exists plataforma text,
  add column if not exists area_cross_selling text,
  add column if not exists decisor text;

alter table public.grupos_economicos
  add column if not exists plataforma text,
  add column if not exists area_cross_selling text,
  add column if not exists decisor text;

alter table public.lead_intakes
  drop constraint if exists lead_intakes_plataforma_check;
alter table public.lead_intakes
  add constraint lead_intakes_plataforma_check
  check (plataforma is null or plataforma in ('Instagram', 'LinkedIn', 'Site'));

alter table public.lead_intakes
  drop constraint if exists lead_intakes_area_cross_selling_check;
alter table public.lead_intakes
  add constraint lead_intakes_area_cross_selling_check
  check (
    area_cross_selling is null
    or area_cross_selling in (
      'Cível',
      'Trabalhista',
      'Societário e Contratos',
      'Recuperação de Créditos',
      'Tributário',
      'Reestruturação e Insolvência'
    )
  );

alter table public.grupos_economicos
  drop constraint if exists grupos_economicos_plataforma_check;
alter table public.grupos_economicos
  add constraint grupos_economicos_plataforma_check
  check (plataforma is null or plataforma in ('Instagram', 'LinkedIn', 'Site'));

alter table public.grupos_economicos
  drop constraint if exists grupos_economicos_area_cross_selling_check;
alter table public.grupos_economicos
  add constraint grupos_economicos_area_cross_selling_check
  check (
    area_cross_selling is null
    or area_cross_selling in (
      'Cível',
      'Trabalhista',
      'Societário e Contratos',
      'Recuperação de Créditos',
      'Tributário',
      'Reestruturação e Insolvência'
    )
  );

comment on column public.lead_intakes.plataforma is
  'Subtipo de Lead Digital: Instagram, LinkedIn ou Site. Nulo nos demais tipos.';
comment on column public.lead_intakes.area_cross_selling is
  'Área canónica (CRM_PRACTICE_AREAS) escolhida no Cross Selling. Nulo nos demais tipos.';
comment on column public.grupos_economicos.plataforma is
  'Espelho de UI da carteira: subtipo Plataforma quando tipo_lead = Lead Digital.';
comment on column public.grupos_economicos.area_cross_selling is
  'Espelho de UI da carteira: área do Cross Selling quando tipo_lead = Cross Selling.';
comment on column public.lead_intakes.decisor is
  'Nome livre do decisor na empresa. Opcional.';
comment on column public.grupos_economicos.decisor is
  'Nome livre do decisor na empresa, editável na carteira. Opcional.';
