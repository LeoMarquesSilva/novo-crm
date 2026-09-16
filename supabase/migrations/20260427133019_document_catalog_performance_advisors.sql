create index if not exists document_instances_created_by_idx
  on public.document_instances(created_by);
create index if not exists document_instances_template_id_idx
  on public.document_instances(template_id);
create index if not exists document_versions_generated_by_idx
  on public.document_versions(generated_by);

drop policy if exists "document_instances: escrita comercial admin" on public.document_instances;
create policy "document_instances: insert comercial admin"
  on public.document_instances for insert to authenticated
  with check ((select private.auth_user_role()) in ('admin', 'comercial'));
create policy "document_instances: update comercial admin"
  on public.document_instances for update to authenticated
  using ((select private.auth_user_role()) in ('admin', 'comercial'))
  with check ((select private.auth_user_role()) in ('admin', 'comercial'));
create policy "document_instances: delete comercial admin"
  on public.document_instances for delete to authenticated
  using ((select private.auth_user_role()) in ('admin', 'comercial'));

drop policy if exists "document_templates: escrita admin" on public.document_templates;
create policy "document_templates: insert admin"
  on public.document_templates for insert to authenticated
  with check ((select private.auth_user_role()) = 'admin');
create policy "document_templates: update admin"
  on public.document_templates for update to authenticated
  using ((select private.auth_user_role()) = 'admin')
  with check ((select private.auth_user_role()) = 'admin');
create policy "document_templates: delete admin"
  on public.document_templates for delete to authenticated
  using ((select private.auth_user_role()) = 'admin');

drop policy if exists "document_template_fields: escrita admin" on public.document_template_fields;
create policy "document_template_fields: insert admin"
  on public.document_template_fields for insert to authenticated
  with check ((select private.auth_user_role()) = 'admin');
create policy "document_template_fields: update admin"
  on public.document_template_fields for update to authenticated
  using ((select private.auth_user_role()) = 'admin')
  with check ((select private.auth_user_role()) = 'admin');
create policy "document_template_fields: delete admin"
  on public.document_template_fields for delete to authenticated
  using ((select private.auth_user_role()) = 'admin');

drop policy if exists "proposal_scope_types: escrita admin" on public.proposal_scope_types;
create policy "proposal_scope_types: insert admin"
  on public.proposal_scope_types for insert to authenticated
  with check ((select private.auth_user_role()) = 'admin');
create policy "proposal_scope_types: update admin"
  on public.proposal_scope_types for update to authenticated
  using ((select private.auth_user_role()) = 'admin')
  with check ((select private.auth_user_role()) = 'admin');
create policy "proposal_scope_types: delete admin"
  on public.proposal_scope_types for delete to authenticated
  using ((select private.auth_user_role()) = 'admin');

drop policy if exists "proposal_scope_subtypes: escrita admin" on public.proposal_scope_subtypes;
create policy "proposal_scope_subtypes: insert admin"
  on public.proposal_scope_subtypes for insert to authenticated
  with check ((select private.auth_user_role()) = 'admin');
create policy "proposal_scope_subtypes: update admin"
  on public.proposal_scope_subtypes for update to authenticated
  using ((select private.auth_user_role()) = 'admin')
  with check ((select private.auth_user_role()) = 'admin');
create policy "proposal_scope_subtypes: delete admin"
  on public.proposal_scope_subtypes for delete to authenticated
  using ((select private.auth_user_role()) = 'admin');

drop policy if exists "proposal_investment_types: escrita admin" on public.proposal_investment_types;
create policy "proposal_investment_types: insert admin"
  on public.proposal_investment_types for insert to authenticated
  with check ((select private.auth_user_role()) = 'admin');
create policy "proposal_investment_types: update admin"
  on public.proposal_investment_types for update to authenticated
  using ((select private.auth_user_role()) = 'admin')
  with check ((select private.auth_user_role()) = 'admin');
create policy "proposal_investment_types: delete admin"
  on public.proposal_investment_types for delete to authenticated
  using ((select private.auth_user_role()) = 'admin');

drop policy if exists "proposal_investment_subtypes: escrita admin" on public.proposal_investment_subtypes;
create policy "proposal_investment_subtypes: insert admin"
  on public.proposal_investment_subtypes for insert to authenticated
  with check ((select private.auth_user_role()) = 'admin');
create policy "proposal_investment_subtypes: update admin"
  on public.proposal_investment_subtypes for update to authenticated
  using ((select private.auth_user_role()) = 'admin')
  with check ((select private.auth_user_role()) = 'admin');
create policy "proposal_investment_subtypes: delete admin"
  on public.proposal_investment_subtypes for delete to authenticated
  using ((select private.auth_user_role()) = 'admin');

drop policy if exists "whatsapp_due_config: write admin" on public.whatsapp_due_config;
create policy "whatsapp_due_config: insert admin"
  on public.whatsapp_due_config for insert to authenticated
  with check ((select private.auth_user_role()) = 'admin');
create policy "whatsapp_due_config: update admin"
  on public.whatsapp_due_config for update to authenticated
  using ((select private.auth_user_role()) = 'admin')
  with check ((select private.auth_user_role()) = 'admin');
create policy "whatsapp_due_config: delete admin"
  on public.whatsapp_due_config for delete to authenticated
  using ((select private.auth_user_role()) = 'admin');
