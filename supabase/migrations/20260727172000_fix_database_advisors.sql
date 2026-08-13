-- Correções baseadas nos Security/Performance Advisors do projeto CRM-BP,
-- consultados em 2026-07-27. Esta migration não remove índices "unused":
-- o projeto ainda é recente e ausência de uso não prova inutilidade.

alter function public.set_updated_at_contract_clause_templates()
  set search_path = '';
alter function public.set_updated_at_d4sign_documents()
  set search_path = '';

revoke execute on function public.set_updated_at_contract_clause_templates()
from public, anon, authenticated;
revoke execute on function public.set_updated_at_d4sign_documents()
from public, anon, authenticated;
revoke execute on function public.sync_oportunidade_etapa_periodo()
from public, anon, authenticated;

-- Tabela operacional somente de backend. RLS sem policy é intencional,
-- porém os grants também são revogados para aplicar privilégio mínimo.
revoke all on table public.d4sign_api_usage from anon, authenticated;

create index if not exists contract_clause_templates_created_by_idx
  on public.contract_clause_templates (created_by);
create index if not exists contract_review_tasks_created_by_idx
  on public.contract_review_tasks (created_by);
create index if not exists d4sign_documents_sent_by_app_user_id_idx
  on public.d4sign_documents (sent_by_app_user_id);
create index if not exists due_area_review_tasks_adjustment_completed_by_idx
  on public.due_area_review_tasks (adjustment_completed_by_app_user_id);
create index if not exists due_area_review_tasks_responded_by_idx
  on public.due_area_review_tasks (responded_by_app_user_id);
create index if not exists due_area_review_tasks_responsavel_idx
  on public.due_area_review_tasks (responsavel_app_user_id);
create index if not exists due_documents_uploaded_by_idx
  on public.due_documents (uploaded_by_app_user_id);
create index if not exists lead_activity_events_actor_idx
  on public.lead_activity_events (actor_app_user_id);

drop policy if exists "Admins manage lead email microsoft oauth"
  on public.lead_email_microsoft_oauth;
create policy "Admins manage lead email microsoft oauth"
  on public.lead_email_microsoft_oauth
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  );

drop policy if exists "Admins manage lead email config"
  on public.lead_email_notification_config;
create policy "Admins manage lead email config"
  on public.lead_email_notification_config
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  );

drop policy if exists "Admins manage lead email templates"
  on public.lead_email_notification_template;
create policy "Admins manage lead email templates"
  on public.lead_email_notification_template
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  );

drop policy if exists "Admins can manage clause templates"
  on public.contract_clause_templates;
drop policy if exists "Authenticated users can read clause templates"
  on public.contract_clause_templates;

create policy "Authenticated users can read clause templates"
  on public.contract_clause_templates
  for select
  to authenticated
  using (true);

create policy "Admins can insert clause templates"
  on public.contract_clause_templates
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  );
create policy "Admins can update clause templates"
  on public.contract_clause_templates
  for update
  to authenticated
  using (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  );
create policy "Admins can delete clause templates"
  on public.contract_clause_templates
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  );

drop policy if exists "admin comercial can write d4sign_documents"
  on public.d4sign_documents;
drop policy if exists "authenticated can read d4sign_documents"
  on public.d4sign_documents;

create policy "authenticated can read d4sign_documents"
  on public.d4sign_documents
  for select
  to authenticated
  using (true);
create policy "admin comercial can insert d4sign_documents"
  on public.d4sign_documents
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = any (
          array['admin'::public.user_role, 'comercial'::public.user_role]
        )
    )
  );
create policy "admin comercial can update d4sign_documents"
  on public.d4sign_documents
  for update
  to authenticated
  using (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = any (
          array['admin'::public.user_role, 'comercial'::public.user_role]
        )
    )
  )
  with check (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = any (
          array['admin'::public.user_role, 'comercial'::public.user_role]
        )
    )
  );
create policy "admin comercial can delete d4sign_documents"
  on public.d4sign_documents
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = any (
          array['admin'::public.user_role, 'comercial'::public.user_role]
        )
    )
  );

drop policy if exists crt_admin_comercial_all
  on public.contract_review_tasks;
drop policy if exists crt_assigned_select
  on public.contract_review_tasks;
drop policy if exists crt_assigned_update
  on public.contract_review_tasks;

create policy crt_select
  on public.contract_review_tasks
  for select
  to authenticated
  using (
    (select public.auth_user_role()) = any (
      array['admin'::public.user_role, 'comercial'::public.user_role]
    )
    or exists (
      select 1 from public.app_users u
      where u.id = contract_review_tasks.assigned_to
        and u.auth_user_id = (select auth.uid())
    )
  );
create policy crt_update
  on public.contract_review_tasks
  for update
  to authenticated
  using (
    (select public.auth_user_role()) = any (
      array['admin'::public.user_role, 'comercial'::public.user_role]
    )
    or exists (
      select 1 from public.app_users u
      where u.id = contract_review_tasks.assigned_to
        and u.auth_user_id = (select auth.uid())
    )
  )
  with check (
    (select public.auth_user_role()) = any (
      array['admin'::public.user_role, 'comercial'::public.user_role]
    )
    or exists (
      select 1 from public.app_users u
      where u.id = contract_review_tasks.assigned_to
        and u.auth_user_id = (select auth.uid())
    )
  );
create policy crt_admin_comercial_insert
  on public.contract_review_tasks
  for insert
  to authenticated
  with check (
    (select public.auth_user_role()) = any (
      array['admin'::public.user_role, 'comercial'::public.user_role]
    )
  );
create policy crt_admin_comercial_delete
  on public.contract_review_tasks
  for delete
  to authenticated
  using (
    (select public.auth_user_role()) = any (
      array['admin'::public.user_role, 'comercial'::public.user_role]
    )
  );
