-- Períodos por etapa: tempo de permanência materializado para analytics e timeline do lead.

CREATE TABLE IF NOT EXISTS public.oportunidade_etapa_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  etapa public.opportunity_stage NOT NULL,
  entered_at timestamptz NOT NULL,
  exited_at timestamptz NULL,
  source text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oportunidade_etapa_periodos_exited_after_entered
    CHECK (exited_at IS NULL OR exited_at >= entered_at)
);

CREATE INDEX IF NOT EXISTS idx_oep_oportunidade_entered
  ON public.oportunidade_etapa_periodos (oportunidade_id, entered_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oep_one_open_per_oportunidade
  ON public.oportunidade_etapa_periodos (oportunidade_id)
  WHERE exited_at IS NULL;

COMMENT ON TABLE public.oportunidade_etapa_periodos IS
  'Histórico materializado de permanência por etapa (entrada/saída) para timeline e relatórios gerenciais.';

-- Backfill a partir de transicoes_etapa + created_at (antes do trigger).
WITH ops AS (
  SELECT id, etapa, created_at FROM public.oportunidades
),
first_trans AS (
  SELECT DISTINCT ON (oportunidade_id)
    oportunidade_id,
    etapa_origem,
    criado_em
  FROM public.transicoes_etapa
  ORDER BY oportunidade_id, criado_em ASC
),
ordered_trans AS (
  SELECT
    oportunidade_id,
    etapa_destino,
    criado_em,
    LEAD(criado_em) OVER (PARTITION BY oportunidade_id ORDER BY criado_em ASC) AS next_at
  FROM public.transicoes_etapa
),
initial_periods AS (
  SELECT
    o.id AS oportunidade_id,
    ft.etapa_origem AS etapa,
    o.created_at AS entered_at,
    ft.criado_em AS exited_at,
    'backfill_initial'::text AS source
  FROM ops o
  INNER JOIN first_trans ft ON ft.oportunidade_id = o.id
),
transition_periods AS (
  SELECT
    oportunidade_id,
    etapa_destino AS etapa,
    criado_em AS entered_at,
    next_at AS exited_at,
    'backfill_transition'::text AS source
  FROM ordered_trans
),
no_trans_periods AS (
  SELECT
    o.id AS oportunidade_id,
    o.etapa,
    o.created_at AS entered_at,
    NULL::timestamptz AS exited_at,
    'backfill_only'::text AS source
  FROM ops o
  WHERE NOT EXISTS (
    SELECT 1 FROM public.transicoes_etapa t WHERE t.oportunidade_id = o.id
  )
)
INSERT INTO public.oportunidade_etapa_periodos (oportunidade_id, etapa, entered_at, exited_at, source)
SELECT oportunidade_id, etapa, entered_at, exited_at, source FROM initial_periods
UNION ALL
SELECT oportunidade_id, etapa, entered_at, exited_at, source FROM transition_periods
UNION ALL
SELECT oportunidade_id, etapa, entered_at, exited_at, source FROM no_trans_periods
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_oportunidade_etapa_periodo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.oportunidade_etapa_periodos (oportunidade_id, etapa, entered_at, source)
    VALUES (NEW.id, NEW.etapa, COALESCE(NEW.created_at, now()), 'insert');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.etapa IS DISTINCT FROM NEW.etapa THEN
    UPDATE public.oportunidade_etapa_periodos
    SET exited_at = now()
    WHERE oportunidade_id = NEW.id
      AND exited_at IS NULL;

    INSERT INTO public.oportunidade_etapa_periodos (oportunidade_id, etapa, entered_at, source)
    VALUES (NEW.id, NEW.etapa, now(), 'etapa_change');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oportunidade_etapa_periodos ON public.oportunidades;

CREATE TRIGGER trg_oportunidade_etapa_periodos
  AFTER INSERT OR UPDATE OF etapa ON public.oportunidades
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_oportunidade_etapa_periodo();

ALTER TABLE public.oportunidade_etapa_periodos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oportunidade_etapa_periodos: leitura autenticados" ON public.oportunidade_etapa_periodos;
CREATE POLICY "oportunidade_etapa_periodos: leitura autenticados"
  ON public.oportunidade_etapa_periodos
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "oportunidade_etapa_periodos: insert comercial ou admin" ON public.oportunidade_etapa_periodos;
CREATE POLICY "oportunidade_etapa_periodos: insert comercial ou admin"
  ON public.oportunidade_etapa_periodos
  FOR INSERT
  TO authenticated
  WITH CHECK (private.auth_user_role() IN ('admin'::public.user_role, 'comercial'::public.user_role));

DROP POLICY IF EXISTS "oportunidade_etapa_periodos: update admin" ON public.oportunidade_etapa_periodos;
CREATE POLICY "oportunidade_etapa_periodos: update admin"
  ON public.oportunidade_etapa_periodos
  FOR UPDATE
  TO authenticated
  USING (private.auth_user_role() = 'admin'::public.user_role)
  WITH CHECK (private.auth_user_role() = 'admin'::public.user_role);

DROP POLICY IF EXISTS "oportunidade_etapa_periodos: delete admin" ON public.oportunidade_etapa_periodos;
CREATE POLICY "oportunidade_etapa_periodos: delete admin"
  ON public.oportunidade_etapa_periodos
  FOR DELETE
  TO authenticated
  USING (private.auth_user_role() = 'admin'::public.user_role);
