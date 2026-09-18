-- Semântica de grupos_economicos.categoria: Cliente | Lead (não área jurídica).
-- Se a coluna já existia com texto de Cível/Trabalhista/etc., grava Cliente.
-- Versionada localmente; NÃO aplicada no remoto nesta entrega.

comment on column public.grupos_economicos.categoria is
  'Tipo da linha na aba Clientes: Cliente ou Lead. Não é área jurídica (responsible_area).';

update public.grupos_economicos
set categoria = 'Cliente'
where categoria is null
   or lower(btrim(categoria)) not in ('cliente', 'lead');
