-- Objeto do Consultivo Societário (cópia do banco): o "(por extenso)" do modelo Word vazava
-- literal no contrato ("até 8 (oito) horas (por extenso) horas técnicas"). O CRM passa a
-- escrever o número por extenso sozinho (`horasComExtenso`, object-fields.ts); aqui só sai o
-- texto solto, igual ao catálogo do código.
update public.contract_clause_templates
set content = replace(
  content,
  '[QTD_HORAS_SOCIETARIO] (por extenso) horas',
  '[QTD_HORAS_SOCIETARIO] horas'
)
where stable_key = 'object_societario_contratual'
  and content like '%[QTD_HORAS_SOCIETARIO] (por extenso) horas%';
