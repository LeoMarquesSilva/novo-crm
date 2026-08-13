# Importação em massa de propostas/contratos → escopos padronizados por IA → revisão/aprovação → catálogo

## Contexto

O Catálogo de Escopos (`/crm/admin/proposta-escopo`) hoje é alimentado manualmente. O usuário tem muitas propostas e contratos reais em formatos variados (PDF/DOCX) e quer: (1) subir esses documentos em massa; (2) uma IA extrair e **padronizar** os escopos e modelos de investimento encontrados, consolidando escopos semelhantes de vários documentos em um único template com placeholders `[CHAVE]` no lugar de dados do cliente; (3) uma fila de revisão onde ele aprova/edita/rejeita cada sugestão — só o que for aprovado entra no cadastro oficial (`proposal_scope_types/subtypes`, `proposal_investment_types/subtypes`) com configuração completa (área, tipo, subtipo, template, placeholders, ordem, ativo).

Decisões do usuário: **OpenAI** como provedor de IA; formatos **PDF + DOCX**; extrair **escopos + investimentos**; **consolidar** escopos semelhantes em modelo único.

Fatos do repo (explorado): app em `novo-crm/` — Next.js 16.2.3 App Router, Supabase (sem ORM), Zod 4, Tailwind 4 + shadcn, Vitest, Vercel Hobby (limite de body 4.5MB; 2 crons já usados). **Não existe nenhuma integração de IA hoje** (sem SDK, sem chave). PizZip já instalado (extração DOCX grátis); não há lib de PDF. Padrões prontos para reuso: upload em `src/app/api/crm/leads/[id]/due-documents/route.ts`, filas de aprovação (`due_area_review_tasks`, `indicator-approval-queue.tsx`), batch tracking (`import_batches`), `requireAdmin`/`requireAdminApi`, `createSupabaseAdminClient`.

## Passo 1 — Migração: `supabase/migrations/20260807120000_scope_import.sql`

- Bucket privado `scope-import-documents` (`insert into storage.buckets ... on conflict do nothing`; se o pipeline restringir o schema `storage`, criar via dashboard/MCP — SQL é idempotente).
- Tabelas (uuid PK, `created_at`, status como `text` — convenção do repo):
  - **`scope_import_batches`**: `created_by fk app_users`, `status` (`aberto|extraindo|consolidando|revisao|concluido|erro`), `document_count`, `processed_count`, `error_count`, `started_at`, `finished_at`.
  - **`scope_import_documents`** (clone do shape de `due_documents`): `batch_id fk`, `storage_bucket`, `storage_path`, `original_filename`, `content_type`, `byte_size`, `status` (`aguardando_upload|enviado|processando|extraido|erro`), `error_message`, `page_count`, `extracted_chars`, `uploaded_by_app_user_id`, `processed_at`.
  - **`scope_import_extractions`** (achados por documento): `document_id fk`, `kind` (`escopo|investimento`), `raw_excerpt`, `normalized_template`, `suggested_area_key`, `suggested_type_label`, `suggested_subtype_label`, `conceito`, `replaced_values jsonb`, `model`, `input_tokens`, `output_tokens`.
  - **`scope_import_suggestions`** (candidatos consolidados): `batch_id fk`, `kind`, `status` (`pendente|aprovado|rejeitado|mesclado`), `area_key`, `type_label/type_key`, `subtype_label/subtype_key`, `conceito`, `template`, `original_template` (saída da IA congelada, p/ diff), `placeholder_keys text[]`, `similar_existing jsonb`, `confidence numeric`, `reviewed_by/reviewed_at`, `rejection_reason`, `created_type_id uuid`, `created_subtype_id uuid`, `merged_into_suggestion_id`, `sort_order`.
  - **`scope_import_suggestion_sources`**: `suggestion_id fk` + `extraction_id fk` (unique) — proveniência.
- Índices: `scope_import_documents(batch_id,status)`, `scope_import_extractions(document_id)`, `scope_import_suggestions(batch_id,status)`. RLS habilitado sem policies permissivas (acesso só via service role, como as demais tabelas).
- Depois de aplicar: regenerar `src/lib/supabase/database.types.ts` (MCP `generate_typescript_types`) e atualizar `docs/system-context.md` (regra do projeto).

## Passo 2 — Dependências e env

- `npm i unpdf openai` (unpdf: pdf.js serverless-friendly, sem canvas/worker; pdf-parse está abandonado).
- Env: `OPENAI_API_KEY` (server-only), opcionais `SCOPE_IMPORT_OPENAI_MODEL_EXTRACTION` (default `gpt-4.1-mini`) e `SCOPE_IMPORT_OPENAI_MODEL_CONSOLIDATION` (default `gpt-4.1`). Adicionar ao `.env.example`.
- **PDFs escaneados (sem camada de texto): fora do escopo v1** — se texto extraído < ~200 chars/página, marcar doc `erro` com mensagem clara.

## Passo 3 — Lib servidor `src/lib/scope-import/`

- `text-extraction.ts` — `extractDocumentText(buffer, contentType)`: DOCX via PizZip (`word/document.xml`, `<w:p>`→`\n`), PDF via unpdf.
- `schemas.ts` — Zod 4 + JSON Schema espelhado p/ structured outputs (`strict`). Pós-validação: `area_key` ∈ `CRM_PRACTICE_AREAS` (`src/lib/crm/crm-areas.ts`) senão null+flag; `placeholder_keys` SEMPRE recomputados via `extractPlaceholderKeysFromText()` (`src/data/proposta-tipos-catalog.ts`); keys via `slugifyFieldCodeFromLabel`.
- `openai.ts` — wrapper: `callStructured(model, system, user, jsonSchema)`, caps de `max_output_tokens` (~4k extração / ~8k consolidação), truncar input ~60k chars, 1 retry em JSON inválido.
- `prompts.ts` — builders:
  - **Extração** (por documento): system com as 6 áreas, convenção `[CHAVE_MAIUSCULA]`, vocabulário canônico de placeholders derivado do catálogo existente (`loadProposalCatalogAdmin`) + labels de tipos/subtipos existentes; instruir substituir nome do cliente, valores, nº processo, partes, datas por placeholders. Saída: `{ escopos: [...], investimentos: [...] }` com `raw_excerpt`, `normalized_template`, labels, `replaced_values`.
  - **Consolidação** (por grupo kind×área; investimentos = grupo único): lista indexada de extrações + catálogo existente da área compactado. Saída: `{ suggestions: [{ template, tipo_label, subtipo_label, conceito?, source_extraction_indices, match_existing|null, confidence }] }`.
- `similarity.ts` — similaridade determinística (Dice/trigram) da sugestão vs subtipos existentes; top-3 ≥0.55 em `similar_existing` (backstop além do `match_existing` da IA).
- **Refactor obrigatório**: extrair os branches de insert + `cleanKey`/`cleanPlaceholders` de `src/app/api/admin/proposal-catalog/route.ts` para `src/lib/crm/proposal-catalog-write.ts` (`insertScopeType`, `insertScopeSubtype`, `insertInvestmentType`, `insertInvestmentSubtype`, com os conflict keys existentes e `investimento_template: ""`). Rota do catálogo e rota de aprovação usam os mesmos helpers — inserção aprovada fica idêntica ao CRUD manual.

## Passo 4 — Rotas API (`requireAdminApi()`, admin client, JSON `{ ok, data|error }`)

Base: `src/app/api/admin/scope-import/`

- **`route.ts`** — `GET`: lista batches. `POST { files: [{name,size,contentType}] }`: valida (≤40 arquivos, ≤25MB cada, ext/MIME pdf+docx), cria batch + docs (`aguardando_upload`, path `${batchId}/${randomUUID()}_${nomeSeguro}`), gera `createSignedUploadUrl` por arquivo. Retorna `{ batchId, uploads: [{documentId, path, token}] }`. **Upload direto ao Storage via signed URL** (contorna o limite de 4.5MB da Vercel; browser usa `uploadToSignedUrl` do client `src/lib/supabase/client.ts`).
- **`[batchId]/route.ts`** — `GET`: estado completo do batch (endpoint único de polling da UI). `DELETE` opcional: abandonar batch + limpar storage.
- **`[batchId]/confirm/route.ts`** — `POST { documentIds }`: confere objetos no storage, marca `enviado`, batch `extraindo`.
- **`[batchId]/process/route.ts`** — `POST`, `maxDuration = 120`. **Loop dirigido pelo cliente, 1 documento por chamada** (sem fila/cron): claim atômico (`update ... where status='enviado' limit 1`, com timeout de 5min para docs presos em `processando`), download → extração de texto → chamada OpenAI → grava `scope_import_extractions` → `extraido` ou `erro` (nunca derruba o batch). Retorna `{ done, processed, total, errors }`. Retomável por construção.
- **`[batchId]/consolidate/route.ts`** — `POST`, `maxDuration = 300` (precedente: rd-full-import). Guarda: nenhum doc `enviado|processando`. Por grupo kind×área: chamada de consolidação, valida Zod, recomputa placeholders, calcula `similar_existing`, grava sugestões + sources. Idempotente: apaga sugestões `pendente` anteriores do batch antes de re-rodar (preserva as decididas). Aceitar param opcional `group` desde o início (porta de escape se `maxDuration=300` falhar no plano). Batch → `revisao`.
- **`suggestions/[id]/route.ts`** — `PATCH`: edições do revisor (template, área, labels, conceito; só em `pendente`; recomputa placeholders). `POST` decisão com guard `where status='pendente'` (409 se já revisada):
  - `{ action: "aprovar", target: {scopeTypeId}|{investmentTypeId}|{newType:{areaKey?,label}} }` → resolve/cria tipo e insere subtipo via `proposal-catalog-write.ts` (`sort_order` = max+10, `is_active: true`), grava `created_type_id/subtype_id`, status `aprovado`.
  - `{ action: "rejeitar", reason? }` → `rejeitado`.

## Passo 5 — UI

- **Página** `src/app/(crm)/crm/admin/proposta-escopo/importacao/page.tsx` — receita padrão (`force-dynamic`, `requireAdmin`, `CrmPageHeader` com stats). **Página separada, não terceira aba** do `scope-catalog-shell.tsx` (que é um tree+editor acoplado; a importação é um wizard). Botão "Importar de documentos" no header do catálogo → link para cá; link "Voltar ao catálogo" na nova página.
- **Componentes** `src/components/crm/scope-import/`:
  - `scope-import-shell.tsx` — orquestra etapas, polling do `GET /[batchId]` (sem Realtime na v1).
  - `import-upload-panel.tsx` — input multi-arquivo (`.pdf,.docx`), validação client-side, `POST /scope-import`, upload via `uploadToSignedUrl` (concorrência 3, retry por arquivo), depois `/confirm`.
  - `import-progress-panel.tsx` — botão "Processar documentos" roda loop `POST /process` até `done` (pausável/retomável), barra de progresso, lista por documento com erros; depois botão "Consolidar".
  - `suggestion-review-list.tsx` + `suggestion-card.tsx` — agrupado por kind e área. Card: campos editáveis (label/área/tipo), textarea de template reusando `template-textarea-field.tsx` + `template-placeholder-insert-bar.tsx`, preview ao vivo com `EXAMPLE_PLACEHOLDER_VALUES` (**mover de `scope-editor.tsx` para `src/components/crm/scope-catalog/placeholder-examples.ts` e importar nos dois lugares**), seção colapsável "Documentos de origem" (excerpts + nome do arquivo), "Semelhantes no catálogo" (`similar_existing` com badge), seletor de destino (tipo existente via dados de `loadProposalCatalogAdmin` ou "novo tipo"), botões Aprovar/Rejeitar com flip otimista (padrão `indicator-approval-queue.tsx`).

## Fluxo completo

1. Admin abre `/crm/admin/proposta-escopo/importacao`, solta N arquivos → batch + signed URLs → upload direto ao Storage → confirm.
2. "Processar" → loop cliente, 1 doc/chamada (texto → OpenAI extração) até terminar; fechável/retomável.
3. "Consolidar" → clustering por kind×área → sugestões com proveniência e similares.
4. Revisão: editar → aprovar (insere no catálogo vivo via helpers compartilhados) ou rejeitar. Aprovados aparecem imediatamente em `/crm/admin/proposta-escopo` e nas propostas.

## Verificação

1. Migração aplicada no Supabase remoto; regenerar `database.types.ts`; `npm run lint && npm run test && npm run build`.
2. Testes Vitest (sem rede, OpenAI mockada): extração DOCX contra fixtures do repo (`public/contrato/*.docx`, `public/MODELO-PROPOSTA-1.docx`); recomputação de placeholders; schemas Zod com payloads válidos/inválidos; `similarity.ts`; claim/resumабilidade com supabase mockado.
3. E2E manual em dev: subir os DOCX do repo + 1 PDF >5MB (prova o caminho de signed URL), rodar extração com chave real, aprovar 1 escopo e 1 investimento, conferir linhas em `proposal_scope_subtypes`/`proposal_investment_subtypes` e que o modal de proposta os enxerga. Duplo-aprovar retorna 409; re-consolidar preserva decididas.
4. Atualizar `docs/system-context.md` (tabelas, bucket, rotas, env).

## Riscos

- **Next.js 16**: AGENTS.md manda conferir `node_modules/next/dist/docs/` antes de escrever rotas; copiar padrões do próprio repo (params como Promise, `maxDuration`).
- **Qualidade da IA**: pode sobre-consolidar ou inventar área — mitigado por schema estrito, validação server-side de área, hints determinísticos de similaridade, diff vs `original_template` e aprovação humana como único caminho de escrita no catálogo.
- **Bucket via migração**: se falhar por permissão no schema `storage`, criar via dashboard (SQL idempotente).
- **Custo**: caps de tokens; gravar contagem por extração para exibir uso total do batch.
- Usuário precisa criar `OPENAI_API_KEY` e configurar na Vercel/`.env.local` antes do e2e real.
