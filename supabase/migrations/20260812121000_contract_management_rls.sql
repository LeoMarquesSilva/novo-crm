-- Existing contratos/aditivos policies are intentionally preserved. This
-- migration exposes the normalized contract tables as read-only to browser
-- sessions; authenticated Route Handlers perform writes with service_role.

alter table public.contrato_responsaveis enable row level security;
alter table public.contrato_versoes enable row level security;
alter table public.contrato_areas enable row level security;
alter table public.contrato_componentes_cobranca enable row level security;
alter table public.contrato_parcelas enable row level security;
alter table public.contrato_rateios_area enable row level security;
alter table public.contrato_participacoes_socios enable row level security;
alter table public.contrato_comissoes enable row level security;
alter table public.contrato_consumos_mensais enable row level security;
alter table public.contrato_fechamentos enable row level security;
alter table public.contrato_fechamento_revisoes enable row level security;
alter table public.contrato_fechamento_itens enable row level security;
alter table public.contrato_alertas enable row level security;
alter table public.contrato_eventos enable row level security;

revoke all on table
  public.contrato_responsaveis,
  public.contrato_versoes,
  public.contrato_areas,
  public.contrato_componentes_cobranca,
  public.contrato_parcelas,
  public.contrato_rateios_area,
  public.contrato_participacoes_socios,
  public.contrato_comissoes,
  public.contrato_consumos_mensais,
  public.contrato_fechamentos,
  public.contrato_fechamento_revisoes,
  public.contrato_fechamento_itens,
  public.contrato_alertas,
  public.contrato_eventos
from anon;

revoke insert, update, delete on table
  public.contrato_responsaveis,
  public.contrato_versoes,
  public.contrato_areas,
  public.contrato_componentes_cobranca,
  public.contrato_parcelas,
  public.contrato_rateios_area,
  public.contrato_participacoes_socios,
  public.contrato_comissoes,
  public.contrato_consumos_mensais,
  public.contrato_fechamentos,
  public.contrato_fechamento_revisoes,
  public.contrato_fechamento_itens,
  public.contrato_alertas,
  public.contrato_eventos
from authenticated;

grant select on table
  public.contrato_responsaveis,
  public.contrato_versoes,
  public.contrato_areas,
  public.contrato_componentes_cobranca,
  public.contrato_parcelas,
  public.contrato_rateios_area,
  public.contrato_participacoes_socios,
  public.contrato_comissoes,
  public.contrato_consumos_mensais,
  public.contrato_fechamentos,
  public.contrato_fechamento_revisoes,
  public.contrato_fechamento_itens,
  public.contrato_alertas,
  public.contrato_eventos
to authenticated;

grant select, insert, update, delete on table
  public.contrato_responsaveis,
  public.contrato_versoes,
  public.contrato_areas,
  public.contrato_componentes_cobranca,
  public.contrato_parcelas,
  public.contrato_rateios_area,
  public.contrato_participacoes_socios,
  public.contrato_comissoes,
  public.contrato_consumos_mensais,
  public.contrato_fechamentos,
  public.contrato_fechamento_revisoes,
  public.contrato_fechamento_itens,
  public.contrato_alertas,
  public.contrato_eventos
to service_role;

create policy contrato_responsaveis_authenticated_select
  on public.contrato_responsaveis for select to authenticated using (true);
create policy contrato_versoes_authenticated_select
  on public.contrato_versoes for select to authenticated using (true);
create policy contrato_areas_authenticated_select
  on public.contrato_areas for select to authenticated using (true);
create policy contrato_componentes_authenticated_select
  on public.contrato_componentes_cobranca for select to authenticated using (true);
create policy contrato_parcelas_authenticated_select
  on public.contrato_parcelas for select to authenticated using (true);
create policy contrato_rateios_authenticated_select
  on public.contrato_rateios_area for select to authenticated using (true);
create policy contrato_participacoes_authenticated_select
  on public.contrato_participacoes_socios for select to authenticated using (true);
create policy contrato_comissoes_authenticated_select
  on public.contrato_comissoes for select to authenticated using (true);
create policy contrato_consumos_authenticated_select
  on public.contrato_consumos_mensais for select to authenticated using (true);
create policy contrato_fechamentos_authenticated_select
  on public.contrato_fechamentos for select to authenticated using (true);
create policy contrato_fechamento_revisoes_authenticated_select
  on public.contrato_fechamento_revisoes for select to authenticated using (true);
create policy contrato_fechamento_itens_authenticated_select
  on public.contrato_fechamento_itens for select to authenticated using (true);
create policy contrato_alertas_authenticated_select
  on public.contrato_alertas for select to authenticated using (true);
create policy contrato_eventos_authenticated_select
  on public.contrato_eventos for select to authenticated using (true);

revoke execute on function public.set_contract_updated_at()
from public, anon, authenticated;
revoke execute on function public.guard_active_contract_version_immutability()
from public, anon, authenticated;
revoke execute on function public.guard_approved_contract_closing_revision()
from public, anon, authenticated;
revoke all on function public.registrar_lancamento_vios_fechamento(
  uuid, text, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.registrar_lancamento_vios_fechamento(
  uuid, text, text, uuid, timestamptz
) to service_role;
