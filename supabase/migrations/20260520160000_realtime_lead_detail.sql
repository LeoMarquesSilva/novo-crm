-- Realtime na ficha do lead: histórico e períodos por etapa (filtro por oportunidade_id).

ALTER TABLE public.lead_activity_events REPLICA IDENTITY FULL;
ALTER TABLE public.oportunidade_etapa_periodos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lead_activity_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activity_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oportunidade_etapa_periodos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oportunidade_etapa_periodos;
  END IF;
END $$;
