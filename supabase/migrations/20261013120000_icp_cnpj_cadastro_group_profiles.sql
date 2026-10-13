-- ICP (perfil de cliente ideal): tabelas próprias do módulo, trazidas do ORQESTRAI
-- (marketing-system, migrations 20261006200000_icp_cnpj_cadastro e
-- 20261011120000_icp_group_profiles). O módulo passa a morar no CRM; os dados
-- existentes são copiados uma vez pelo scripts/icp-copy-from-orqestrai.mjs.
-- Aplicada no remoto CRM-BP em 13/10/2026 (SQL Editor).

-- Cadastro da Receita Federal (dados abertos via OpenCNPJ ou BrasilAPI) das empresas
-- dos grupos de clientes. Alimenta segmento (CNAE), região (sede) e porte cadastral do
-- ICP. Os CNPJs vêm do cadastro de pessoas do VIOS/SIOE; a rotina
-- /api/cron/icp-cnpj-sync consulta os que faltam e renova os antigos.
create table if not exists public.icp_cnpj_cadastro (
  cnpj text primary key check (cnpj ~ '^\d{14}$'),
  status text not null check (status in ('ok', 'not_found', 'error')),
  razao_social text,
  nome_fantasia text,
  situacao_cadastral text,
  data_inicio_atividade date,
  natureza_juridica text,
  porte text,
  capital_social numeric,
  matriz boolean,
  uf text,
  municipio text,
  cep text,
  cnae_principal text,
  cnae_descricao text,
  cnaes_secundarios jsonb not null default '[]'::jsonb,
  opcao_simples boolean,
  -- Sócios e administradores: só nome, qualificação e data de entrada (sem CPF).
  socios jsonb not null default '[]'::jsonb,
  source text not null default 'brasilapi',
  error text,
  fetched_at timestamptz not null default now()
);

create index if not exists icp_cnpj_cadastro_fetched_at_idx on public.icp_cnpj_cadastro (fetched_at);

comment on table public.icp_cnpj_cadastro is
  'ICP: cadastro da Receita Federal das empresas dos grupos de clientes (OpenCNPJ/BrasilAPI). Gravado pelo cron icp-cnpj-sync; leitura server-side (service role).';

alter table public.icp_cnpj_cadastro enable row level security;
revoke all on public.icp_cnpj_cadastro from anon, authenticated;
grant select, insert, update, delete on public.icp_cnpj_cadastro to service_role;

-- Porte (colaboradores) e logo de cada grupo de cliente, pela página pública da empresa
-- no LinkedIn. A faixa de colaboradores é a declarada pela empresa no LinkedIn
-- ("51-200"); linkedin_members é quantas pessoas se vinculam à página. O logo fica no
-- bucket icp-logos. A carga é feita pelo scripts/icp-linkedin-sync.mjs, que roda na
-- máquina local (o LinkedIn bloqueia servidores).
create table if not exists public.icp_group_profiles (
  -- Nome do grupo no VIOS (grupo_cliente) ou o nome do cliente sem grupo.
  grupo text primary key,
  status text not null check (status in ('found', 'not_found')),
  -- Quão seguro é que a página é da empresa do grupo.
  match_confidence text check (match_confidence in ('alta', 'media', 'baixa')),
  linkedin_url text,
  linkedin_name text,
  employee_range text,
  employee_min integer,
  employee_max integer,
  linkedin_members integer,
  industry text,
  headquarters text,
  website text,
  -- Caminho do arquivo dentro do bucket icp-logos.
  logo_path text,
  logo_source text check (logo_source in ('linkedin', 'site')),
  note text,
  fetched_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.icp_group_profiles is
  'ICP: página do LinkedIn, faixa de colaboradores e logo de cada grupo de cliente. Gravado pelo scripts/icp-linkedin-sync.mjs; leitura server-side (service role).';

alter table public.icp_group_profiles enable row level security;
revoke all on public.icp_group_profiles from anon, authenticated;
grant select, insert, update, delete on public.icp_group_profiles to service_role;

-- Logos dos grupos. Público para o <img> do ICP montar a URL direto (logo de empresa,
-- já público no LinkedIn/site); sem policies de escrita: só a service role grava.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'icp-logos',
  'icp-logos',
  true,
  2097152,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do nothing;
