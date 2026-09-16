insert into document_templates (name, document_type, template_path, is_active, version, metadata)
values
  (
    'Contrato Trabalhista – Reclamada',
    'contrato',
    'contrato/MODELO DE CONTRATO TRABALHISTA - RECLAMADA.docx',
    true,
    1,
    '{"descricao": "Contrato para defesa trabalhista da reclamada"}'::jsonb
  ),
  (
    'Contrato Trabalhista – Auditoria',
    'contrato',
    'contrato/MODELO DE CONTRATO TRABALHISTA - AUDITORIA.docx',
    true,
    1,
    '{"descricao": "Contrato de auditoria trabalhista"}'::jsonb
  ),
  (
    'Contrato Trabalhista – Diagnóstico',
    'contrato',
    'contrato/MODELO DE CONTRATO TRABALHISTA - DIAGNÓSTICO.docx',
    true,
    1,
    '{"descricao": "Contrato de diagnóstico trabalhista"}'::jsonb
  ),
  (
    'Contrato Trabalhista – Canal de Denúncias',
    'contrato',
    'contrato/MODELO DE CONTRATO TRABALHISTA - CANAL DE DENÚNCIAS.docx',
    true,
    1,
    '{"descricao": "Contrato de implementação de canal de denúncias"}'::jsonb
  )
on conflict do nothing;
