-- Categoria da linha em /crm/clientes: Cliente | Lead.
-- NÃO é área jurídica. Áreas de prática vêm de responsible_area (OrquestrAI) ∪ SIOE ∪ areas_atuacao.
-- Grupos econômicos da carteira persistem 'Cliente'. Lead entra quando a lista unir oportunidades.
-- Versionada localmente; NÃO aplicada no remoto nesta entrega.

alter table public.grupos_economicos
  add column if not exists categoria text;

comment on column public.grupos_economicos.categoria is
  'Tipo da linha na aba Clientes: Cliente ou Lead. Não é área jurídica (responsible_area).';
