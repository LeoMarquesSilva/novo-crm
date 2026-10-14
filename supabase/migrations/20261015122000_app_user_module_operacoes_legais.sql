-- Time Operações Legais: liberado por switch em Configurações → Usuários, na mesma tabela
-- do módulo ICP (app_user_module_access). Quem tem a linha confere o cadastro do novo
-- cliente (etapa cadastro_novo_cliente) e o move para Inclusão no faturamento.
-- Não usa app_users.area: a área não é fonte de permissão de time.
-- Versionada; NÃO aplicada no remoto nesta entrega. Sem ela, o switch responde 409
-- ("migration pendente") e só admin age como Operações Legais.

alter table public.app_user_module_access
  drop constraint if exists app_user_module_access_module_check;

alter table public.app_user_module_access
  add constraint app_user_module_access_module_check
  check (module in ('icp', 'operacoes_legais'));

comment on table public.app_user_module_access is
  'Módulos/times liberados por usuário (icp, operacoes_legais). Admin vê tudo sem linha aqui. Escrita só via service role (API /api/admin/users/[id]/modules).';
