-- Importação em massa de propostas/contratos → escopos padronizados por IA

-- Bucket privado para documentos de importação
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scope-import-documents',
  'scope-import-documents',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Lotes de importação
CREATE TABLE IF NOT EXISTS public.scope_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'aberto',
  document_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scope_import_batches IS
  'Lote de importação de propostas/contratos para extração e consolidação de escopos por IA.';

-- Documentos do lote
CREATE TABLE IF NOT EXISTS public.scope_import_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.scope_import_batches(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'scope-import-documents',
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  content_type text NULL,
  byte_size bigint NULL,
  status text NOT NULL DEFAULT 'aguardando_upload',
  error_message text NULL,
  page_count integer NULL,
  extracted_chars integer NULL,
  uploaded_by_app_user_id uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scope_import_documents IS
  'Documento PDF/DOCX enviado para importação de escopos.';

-- Extrações por documento (achados brutos da IA)
CREATE TABLE IF NOT EXISTS public.scope_import_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.scope_import_documents(id) ON DELETE CASCADE,
  kind text NOT NULL,
  raw_excerpt text NULL,
  normalized_template text NULL,
  suggested_area_key text NULL,
  suggested_type_label text NULL,
  suggested_subtype_label text NULL,
  conceito text NULL,
  replaced_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NULL,
  input_tokens integer NULL,
  output_tokens integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scope_import_extractions IS
  'Achado de escopo ou investimento extraído de um documento pela IA.';

-- Sugestões consolidadas (candidatos a catálogo)
CREATE TABLE IF NOT EXISTS public.scope_import_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.scope_import_batches(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  area_key text NULL,
  type_label text NULL,
  type_key text NULL,
  subtype_label text NULL,
  subtype_key text NULL,
  conceito text NULL,
  template text NULL,
  original_template text NULL,
  placeholder_keys text[] NOT NULL DEFAULT '{}'::text[],
  similar_existing jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NULL,
  reviewed_by uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  rejection_reason text NULL,
  created_type_id uuid NULL,
  created_subtype_id uuid NULL,
  merged_into_suggestion_id uuid NULL REFERENCES public.scope_import_suggestions(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scope_import_suggestions IS
  'Sugestão consolidada de escopo/investimento aguardando revisão humana.';

-- Proveniência: extração → sugestão
CREATE TABLE IF NOT EXISTS public.scope_import_suggestion_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.scope_import_suggestions(id) ON DELETE CASCADE,
  extraction_id uuid NOT NULL REFERENCES public.scope_import_extractions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (extraction_id)
);

COMMENT ON TABLE public.scope_import_suggestion_sources IS
  'Liga sugestão consolidada às extrações de origem.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_scope_import_documents_batch_status
  ON public.scope_import_documents (batch_id, status);

CREATE INDEX IF NOT EXISTS idx_scope_import_extractions_document
  ON public.scope_import_extractions (document_id);

CREATE INDEX IF NOT EXISTS idx_scope_import_suggestions_batch_status
  ON public.scope_import_suggestions (batch_id, status);

-- RLS habilitado sem policies permissivas (acesso via service role)
ALTER TABLE public.scope_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_import_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_import_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_import_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_import_suggestion_sources ENABLE ROW LEVEL SECURITY;
