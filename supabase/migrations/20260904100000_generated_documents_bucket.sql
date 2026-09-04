-- Cópia de segurança própria dos documentos gerados (proposta e contrato).
-- Achado nesta sessão: "Gerar Word" (proposta e contrato) sempre gerou o .docx
-- só na memória e mandou direto pro download do navegador — `generated_file_path`
-- em document_versions era um caminho CALCULADO, sem nenhum arquivo real atrás
-- dele. Pro contrato, o D4Sign (externo) era o único "arquivo de registro" depois
-- do envio; a proposta não tinha nenhum registro físico. Este bucket passa a
-- guardar essa cópia no próprio Storage do projeto, no mesmo `generated_file_path`
-- já salvo em document_versions.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-documents',
  'generated-documents',
  false,
  26214400,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS habilitado sem policies permissivas (acesso via service role), mesmo
-- padrão de scope-import-documents/due-documents.
