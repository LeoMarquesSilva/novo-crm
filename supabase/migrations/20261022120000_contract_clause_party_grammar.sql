-- Concordância com mais de uma contratante nas cláusulas padrão (3º teste ponta a ponta, 22/10/2026).
-- O contrato do Grupo LE BLOG (duas contratantes) saiu com "as CONTRATANTES prestará…" e
-- "manterá a Contratante informada". O motor agora resolve `{singular|plural}` e `[PELA_CONTRATANTE]`;
-- só troca o trecho exato, para não sobrescrever texto já ajustado no admin.

update public.contract_clause_templates
set content = replace(
      replace(
        replace(content, '[A_CONTRATANTE] prestará as informações', '[A_CONTRATANTE] {prestará|prestarão} as informações'),
        'efetuará os pagamentos nas datas pactuadas', '{efetuará|efetuarão} os pagamentos nas datas pactuadas'),
      'e indicará interlocutor', 'e {indicará|indicarão} interlocutor'),
    updated_at = now()
where stable_key = 'obligation_contracting_base'
  and content like '%[A_CONTRATANTE] prestará as informações%';

update public.contract_clause_templates
set content = replace(content, 'e manterá a Contratante informada', 'e manterá [A_CONTRATANTE] {informada|informadas}'),
    updated_at = now()
where stable_key = 'obligation_contracted_base'
  and content like '%e manterá a Contratante informada%';

update public.contract_clause_templates
set content = replace(content, 'com honorários custeados pela Contratante', 'com honorários custeados [PELA_CONTRATANTE]'),
    updated_at = now()
where stable_key = 'expense_km'
  and content like '%com honorários custeados pela Contratante%';
