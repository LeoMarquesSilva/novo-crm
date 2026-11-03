-- Reunião de validação (03/11/2026): no Cross Selling o lead pode ter mais de uma área.
-- Coluna nova em lista; `area_cross_selling` (uma área) continua gravada com a primeira, para o
-- código que já está no ar e para a carteira (grupos_economicos segue com uma área de origem).

alter table public.lead_intakes
  add column if not exists areas_cross_selling text[];

update public.lead_intakes
set areas_cross_selling = array[area_cross_selling]
where area_cross_selling is not null
  and areas_cross_selling is null;

alter table public.lead_intakes
  drop constraint if exists lead_intakes_areas_cross_selling_check;
alter table public.lead_intakes
  add constraint lead_intakes_areas_cross_selling_check
  check (
    areas_cross_selling is null
    or areas_cross_selling <@ array[
      'Cível',
      'Trabalhista',
      'Societário e Contratos',
      'Recuperação de Créditos',
      'Tributário',
      'Reestruturação e Insolvência'
    ]::text[]
  );

comment on column public.lead_intakes.areas_cross_selling is
  'Áreas do Cross Selling (uma ou mais). area_cross_selling guarda a primeira, por compatibilidade.';
