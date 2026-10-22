-- Projeto SIOE (espelho do VIOS), não o banco do CRM: aplicar só no SIOE.
--
-- Índice de cobertura para `icp_agregados`: a soma de horas do ICP lê só este índice
-- (~20 MB) em vez da tabela inteira (145 MB). Sem ele, com o timesheet fora do cache do
-- banco, a função passava do statement_timeout de 8 s da API.
--
-- CONCURRENTLY não bloqueia as gravações do sync no timesheet e não roda dentro de transação.
create index concurrently if not exists idx_timesheets_icp_cobertura
  on public.timesheets (data)
  include (grupo_cliente, area, total_horas_decimal);
