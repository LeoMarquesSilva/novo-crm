# CRM Jurídico (base inicial)

Projeto iniciado do zero com:

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Supabase (camada pronta para conexão)

## Setup

1. Instale dependências:

```bash
npm install
```

2. Configure variáveis de ambiente:

```bash
cp .env.example .env.local
```

Preencha:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (necessária para importações e rotas admin)
- `RD_CRM_TOKEN` (token do RD CRM)
- `RD_WEBHOOK_SECRET` (segredo enviado no header `x-rd-webhook-secret` ou query `?secret=...`)

3. Rode o projeto:

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Estrutura atual

- `src/app/(crm)/crm`: shell e páginas do CRM
- `src/modules/crm/domain`: tipos e regras de workflow
- `src/modules/crm/application`: dados/mock e orquestração inicial
- `src/lib/supabase`: clientes browser/server para integração

## Próximos passos

- Implementar autenticação real (Supabase Auth)
- Persistir entidades CRM no banco
- Substituir mocks por consultas reais
- Evoluir o motor de workflow para regras dinâmicas por etapa
