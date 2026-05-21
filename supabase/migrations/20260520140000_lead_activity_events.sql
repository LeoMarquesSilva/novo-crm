-- Eventos de atividade do lead (timeline unificada: campos, proposta, DUE, etapas, etc.)

CREATE TABLE IF NOT EXISTS public.lead_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  detail text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  etapa public.opportunity_stage NULL,
  area_key text NULL,
  actor_app_user_id uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  source_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activity_events_opp_created
  ON public.lead_activity_events (oportunidade_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_activity_events_source_dedup
  ON public.lead_activity_events (oportunidade_id, kind, source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON TABLE public.lead_activity_events IS
  'Linha do tempo de ações no lead: etapas, campos, escopo por área, DUE, notas.';

-- Backfill histórico
INSERT INTO public.lead_activity_events (
  oportunidade_id, kind, title, detail, etapa, area_key, actor_app_user_id, source_id, created_at, metadata
)
SELECT
  o.id,
  'lead_criado',
  'Lead criado no CRM',
  NULL,
  o.etapa,
  NULL,
  o.criado_por,
  'criado:' || o.id::text,
  o.created_at,
  '{}'::jsonb
FROM public.oportunidades o
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_activity_events (
  oportunidade_id, kind, title, detail, etapa, actor_app_user_id, source_id, created_at, metadata
)
SELECT
  t.oportunidade_id,
  'etapa_alterada',
  'Etapa alterada',
  COALESCE(t.observacao, t.etapa_origem::text || ' → ' || t.etapa_destino::text),
  t.etapa_destino,
  t.alterado_por,
  'trans:' || t.id::text,
  t.criado_em,
  jsonb_build_object('from', t.etapa_origem, 'to', t.etapa_destino)
FROM public.transicoes_etapa t
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_activity_events (
  oportunidade_id, kind, title, detail, actor_app_user_id, source_id, created_at, metadata
)
SELECT
  fv.entity_record_id,
  'campo_pipeline_alterado',
  'Campo atualizado: ' || COALESCE(fd.label, fd.field_code),
  NULL,
  fv.updated_by,
  'fv:' || fv.id::text,
  fv.updated_at,
  jsonb_build_object('field_code', fd.field_code, 'field_definition_id', fd.id)
FROM public.field_values fv
JOIN public.field_definitions fd ON fd.id = fv.field_definition_id
WHERE fv.entity_name = 'oportunidade'
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_activity_events (
  oportunidade_id, kind, title, detail, area_key, actor_app_user_id, source_id, created_at, metadata
)
SELECT
  s.oportunidade_id,
  'proposta_escopo_concluido',
  'Escopo da proposta concluído — ' || s.area_key,
  NULL,
  s.area_key,
  s.preenchido_por_app_user_id,
  'escopo:' || s.id::text,
  s.concluido_em,
  '{}'::jsonb
FROM public.proposta_escopo_solicitacao s
WHERE s.concluido_em IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_activity_events (
  oportunidade_id, kind, title, detail, actor_app_user_id, source_id, created_at, metadata
)
SELECT
  n.oportunidade_id,
  'nota_adicionada',
  'Anotação adicionada',
  LEFT(n.body, 280),
  n.created_by_app_user_id,
  'note:' || n.id::text,
  n.created_at,
  jsonb_build_object('note_id', n.id)
FROM public.lead_notes n
WHERE n.deleted_at IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_activity_events (
  oportunidade_id, kind, title, detail, area_key, actor_app_user_id, source_id, created_at, metadata
)
SELECT
  t.oportunidade_id,
  'due_dados_disponibilizados',
  'DUE — dados disponibilizados (' || t.area_key || ')',
  NULL,
  t.area_key,
  t.responsavel_app_user_id,
  'due-lev:' || t.id::text,
  t.dados_disponibilizados_em,
  '{}'::jsonb
FROM public.due_area_tasks t
WHERE t.dados_disponibilizados_em IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_activity_events (
  oportunidade_id, kind, title, detail, area_key, actor_app_user_id, source_id, created_at, metadata
)
SELECT
  r.oportunidade_id,
  'due_revisao_aprovada',
  'DUE — revisão aprovada (' || r.area_key || ')',
  NULL,
  r.area_key,
  r.responded_by_app_user_id,
  'due-rev-ok:' || r.id::text,
  r.approved_at,
  jsonb_build_object('revision_cycle', r.revision_cycle)
FROM public.due_area_review_tasks r
WHERE r.approved_at IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_activity_events (
  oportunidade_id, kind, title, detail, area_key, actor_app_user_id, source_id, created_at, metadata
)
SELECT
  r.oportunidade_id,
  'due_ajustes_solicitados',
  'DUE — ajustes solicitados (' || r.area_key || ')',
  LEFT(r.observacao_ajustes, 280),
  r.area_key,
  r.responded_by_app_user_id,
  'due-rev-aj:' || r.id::text,
  r.adjustments_requested_at,
  jsonb_build_object('revision_cycle', r.revision_cycle)
FROM public.due_area_review_tasks r
WHERE r.adjustments_requested_at IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.lead_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_activity_events: leitura autenticados" ON public.lead_activity_events;
CREATE POLICY "lead_activity_events: leitura autenticados"
  ON public.lead_activity_events FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "lead_activity_events: insert comercial ou admin" ON public.lead_activity_events;
CREATE POLICY "lead_activity_events: insert comercial ou admin"
  ON public.lead_activity_events FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('admin'::public.user_role, 'comercial'::public.user_role));

DROP POLICY IF EXISTS "lead_activity_events: update admin" ON public.lead_activity_events;
CREATE POLICY "lead_activity_events: update admin"
  ON public.lead_activity_events FOR UPDATE TO authenticated
  USING (private.auth_user_role() = 'admin'::public.user_role)
  WITH CHECK (private.auth_user_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "lead_activity_events: delete admin" ON public.lead_activity_events;
CREATE POLICY "lead_activity_events: delete admin"
  ON public.lead_activity_events FOR DELETE TO authenticated
  USING (private.auth_user_role() = 'admin'::public.user_role);
