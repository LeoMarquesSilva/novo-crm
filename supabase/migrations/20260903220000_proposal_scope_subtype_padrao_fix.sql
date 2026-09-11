-- Correção de bug real: "Ajuizamento de ações" e "Consultivo" (área Cível)
-- tinham o MESMO subtype_key ("padrao") em proposal_scope_subtypes. Como o
-- motor de contratos resolve o perfil de escopo pela combinação
-- área/tipo/subtipo (subtype_key), os dois subtipos distintos eram tratados
-- como o mesmo perfil de contrato — sintoma relatado pelo usuário: "O escopo
-- 'Padrão' ainda não possui cláusulas contratuais configuradas" para o lead
-- Ingevity, que na verdade usa Cível › Consultivo › Padrão. Cada um recebe
-- agora uma chave própria. O catálogo de fallback estático
-- (src/data/proposta-tipos-catalog.ts) foi atualizado no mesmo commit para
-- usar as mesmas chaves nos dois subtipos, evitando que a lógica de merge
-- (mergeScopeCatalogWithFallback) reintroduza "padrao" como entrada zumbi.

update public.proposal_scope_subtypes
set subtype_key = 'ajuizamento_padrao', updated_at = now()
where id = '55949d07-9c44-4b4e-a716-f1da8aea0671'
  and subtype_key = 'padrao';

update public.proposal_scope_subtypes
set subtype_key = 'consultivo_padrao', updated_at = now()
where id = 'd67fa52b-f168-49c3-9ef3-1ed9d7501d02'
  and subtype_key = 'padrao';

-- Migra dados já existentes que referenciavam a chave antiga "padrao" dentro
-- de cp_escopo_detalhe_json (field_values.value_json é uma STRING JSON
-- dentro da coluna JSONB — precisa desembrulhar com #>>'{}' antes de operar
-- e reembrulhar com to_jsonb ao gravar). Único registro real encontrado nesta
-- correção: lead Ingevity, Cível[1] = Consultivo › Padrão.
update public.field_values
set
  value_json = to_jsonb(
    jsonb_set(
      (value_json #>> '{}')::jsonb,
      '{Cível,1,subtipoId}',
      '"consultivo_padrao"'::jsonb
    )::text
  ),
  updated_at = now()
where id = '4b285efa-362e-4594-8b00-370141325bbf'
  and ((value_json #>> '{}')::jsonb) #>> '{Cível,1,id}' = '3e2ef788-435e-4e32-a22f-095373441e18'
  and ((value_json #>> '{}')::jsonb) #>> '{Cível,1,subtipoId}' = 'padrao';
