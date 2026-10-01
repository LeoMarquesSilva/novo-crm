# CRM change log técnico

Formato: data (ISO) | onda | resumo | validações.

## 2026-10-01 — D4Sign: quem enviou o contrato

- Contratos enviados direto na D4Sign: remetente e data real de envio lidos do log de eventos do PDF ("Assinaturas iniciadas por …"). A API não informa isso.
- Migration `20261001120000_d4sign_documents_sender_from_log`: `sent_by_name`, `sent_by_email`, `sent_at`, `log_parsed_at`.
- Etapa "remetente" no sync substitui o pré-cache: lê PDFs do bucket sem cota e baixa os demais (reserva humana de download 6→4/h); `/view` também lê o log. Envios pelo CRM gravam `sent_at`.
- Exibição: painel técnico e área dos sócios mostram "enviado em DATA por NOME" (usuário do CRM quando enviado pelo CRM ou quando o e-mail do log é de um usuário).

## 2026-10-01 — D4Sign: finalizado com signatário "pendente"

- 5 contratos finalizados mostravam sócio/cliente em amarelo/cinza: os signatários foram buscados quando ainda pendentes e o status virou "1" depois, pela listagem por fase.
- Exibição: `parseSigners(raw, status)` trata todos como assinados quando o status é finalizado (painel dos sócios e técnico).
- Dados: a listagem por fase zera `details_fetched_at` quando o documento sai de pendente para encerrado, e ele volta para a fila de signatários (datas reais).

## 2026-10-01 — D4Sign: sync resistente a erro da D4Sign

- 1ª execução agendada do GitHub (06:26 UTC) falhou: a D4Sign respondeu 500 vazio na fase 4 (que respondia 200 às 02:17) e a exceção derrubou a rodada inteira (500 no endpoint, e-mail de falha).
- Agora: 5xx numa fase pula para a próxima; cada etapa da rodada é isolada e o erro vai em `errors` (endpoint responde 200); o workflow imprime `errors`.

## 2026-10-01 — D4Sign: EMBED conforme a documentação, atrás de chave

- `D4SignSignButton`: `NEXT_PUBLIC_D4SIGN_EMBED_ENABLED=1` usa o EMBED; sem a variável, o link de assinatura. Basta ligar a variável (e redeploy) quando a D4Sign reativar o EMBED da conta.
- `EmbedSignDialog` ganhou a correção de Safari da página de instalação (`embed/safari_fix` + cookie `fixed`); URL, parâmetros e callback já seguiam a página.

## 2026-10-01 — D4Sign: botão Assinar sem EMBED

- A conta não tem EMBED ("Esse documento não pode ser exibido via EMBED"). "Assinar" (área dos sócios) e "Assinar agora" (painel técnico) abrem `/api/crm/d4sign/documents/[uuid]/sign`, que redireciona para o link de assinatura da D4Sign só quando o logado é o próprio sócio pendente; os demais caem no painel da D4Sign. Antes o painel técnico deixava qualquer admin abrir a assinatura de um sócio.

## 2026-10-01 — D4Sign: conta de assinatura digital do Gustavo

- `assinaturadigital@bismarchipires.com.br` e `assinaturadigital@bpplaw.com.br` são aliases do Gustavo (assina com o certificado dele no login de outro usuário).
- `normalizeFirmSigner`: signatário com e-mail de sócio aparece com o nome do sócio e papel CONTRATADA (busca de signatários, webhook e oportunidade). Antes aparecia o dono do login na D4Sign ("Felipe Soares De Camargo") e a oportunidade marcava os sócios como CONTRATANTE.
- Dados corrigidos: 74 documentos e 1 oportunidade.

## 2026-10-01 — D4Sign: Webhook 2.0

- Conta passou para o Webhook 2.0 (JSON). O endpoint aceitava só form-data e rejeitaria todo evento com 400. Agora lê JSON (2.0) e form-data (1.0).
- Webhook cadastrado no cofre inteiro (`POST /webhooks/v2/`, `type: "cofre"`) uma vez, pela rodada do sync ou pelo envio; acabou o cadastro por documento.
- Finalização do 2.0 traz os signatários completos e grava sem `GET /list`; assinatura/bounce acrescentam signatário ausente; documento fora do catálogo é criado na hora; evento atrasado não reabre documento encerrado.
- Sem `Content-Hmac`, o evento só reenfileira o documento (não altera dados).
- Pendentes com signatários: atualização periódica de 12h para 24h (o webhook cobre o tempo real).
- Migration `20260727170000_harden_webhooks` aplicada em produção (2026-10-01) só no trecho de webhooks: colunas de controle, check, índice único por (documento, tipo, e-mail) e índice de falhas. A `finalize_d4sign_opportunity` dela ficou de fora (a de `20260812122000` é mais nova).

## 2026-10-01 — D4Sign: coleta de documentos e signatários

- Cron: o workflow `d4sign-sync` nunca rodou pelo agendamento. Reforço: o layout de `/crm` dispara a rodada em `after()` se a última tiver mais de 4 min (`runD4SignSyncRoundIfStale`).
- Fases: o ciclo de `/documents/{fase}/status` cobre todas as fases (3, 2, 4, 1, 6, 5, 7). Antes só 3 e 2: finalizado em pasta ainda não varrida nunca entrava.
- Data: `created_at_d4sign` estimado por UUIDv7 ou prefixo `AAAA MM DD` do nome (320 de 321 estavam sem data), para a fila ir do mais recente ao mais antigo.
- Signatários: fila em 4 faixas; pendentes com signatários voltam a ser atualizados a cada 12h; documento que voltou vazio não é refeito antes de 6h.
- Dados: upserts em lote passam a mandar sempre as mesmas colunas (o supabase-js gravava NULL em `oportunidade_id`, pasta e datas); "Atualizar cofre" não apaga mais pasta/datas; listagens não marcam mais `details_fetched_at`.

## 2026-09-30 — D4Sign: cota por método, PDF e "Abrir no D4Sign"

- Cota: a D4Sign limita 10 req/h **por método**, não global. `getD4SignQuotaStatus(método)` conta só o método; o cron (`planD4SignSyncBudget`) usa a cota de cada etapa e preserva `D4SIGN_HUMAN_RESERVE`. Antes, 10 listagens de pasta do cron bloqueavam a visualização de PDF por 1 hora.
- PDF: `download-document.ts` aceita URL temporária em `*.d4sign.com.br`/`*.amazonaws.com`/`*.cloudfront.net`, segue `Refresh`/meta refresh, decodifica Base64 e devolve `stage` do erro; o dialog mostra o motivo real. Diagnóstico: 5 `POST /download` com 200 em 24h e bucket `d4sign-contracts` vazio.
- "Abrir no D4Sign": nova rota `GET /api/crm/d4sign/documents/[uuid]/open` (`generate-document-view`, sem login), com `/desk/viewblob` como reserva. Card do lead usa a rota quando há `d4sign_document_uuid` (antes abria o link de assinatura do 1º signatário).
- Validações: `npx tsc --noEmit` ok; `npx vitest run` 114 arquivos / 719 testes ok; eslint sem novos avisos.
- Ajuste pós-teste: `generate-document-view` abre o original **sem assinaturas**. `/open` passa a redirecionar para `/desk/viewblob/{uuid}` (versão assinada). Cache e pré-cache só para contrato finalizado. Busca do arquivo do `/download` com redirecionamento manual + cookies, 45s e erro com host/motivo; `generate-document-view` vira 2ª via só para pendentes.

## 2026-07-28 — Onda 1 (fechada)

- Spec: `docs/superpowers/specs/2026-07-28-crm-ajuste-completo-design.md`
- Plan de fecho: `docs/superpowers/plans/2026-07-28-onda-1-fecho-hardening.md`
- Docs (Task 4): `AGENTS.md`, `docs/system-context.md`, `docs/change-log.md`
- CI (Task 2): `.github/workflows/ci.yml`
- Deps (Task 3): `shadcn` movido para `devDependencies`
- Lint (Task 5): 43→3 warnings; 0 errors; `no-img-element` adiados Onda 5

### Gate final (Task 6) — 2026-07-28

| Comando | Exit |
|---------|-----:|
| `npm test` | 0 — 24 files, 113 tests |
| `npm run lint` | 0 — 0 errors, 3 warnings (`no-img-element`) |
| `npx tsc --noEmit` | 0 |
| `npm run build` | 0 — env placeholder Supabase (igual CI) |
| `npm audit` | 1 — 5 vulns (2 low, 3 high); ver abaixo |

**Audit:** `@babel/core` (low), `brace-expansion` (high, fixável), `esbuild` (low, fixável), `js-yaml` (high, fixável), `xlsx` (high, sem fix upstream). Nenhuma critical.

**Lint adiado Onda 5:** `@next/next/no-img-element` em `d4sign-dashboard.tsx`, `contrato-document-builder.tsx`.

### Fecho de revisão final — 2026-07-28

- Segurança P1: autorização explícita de visualização de PDF D4Sign por role, regra de documento órfão exclusiva para admin e validação da oportunidade vinculada.
- Segurança P1: RPCs `admin_change_user_role` e `admin_delete_user` serializam a contagem de admins e eliminam a corrida de último administrador; essas correções fecham as lacunas de segurança restantes da revisão final da Onda 1.
- Adiado: bump advisory de Next.js/eslint-config-next (Task 7 Step 1), pois exige janela de compatibilidade dedicada.
- Adiado: padrões React 19 de refs/ícones/estado derivado (Task 8 Steps 2–4), pois exigem regressão visual e funcional transversal.

**Onda 1 fechada — próximo: Onda 2 autorização fina.**

## 2026-07-28 — Catálogo de escopos (admin) — redesign

- Spec: `docs/superpowers/specs/2026-07-28-catalogo-escopos-redesign-design.md`
- Plan: `docs/superpowers/plans/2026-07-28-catalogo-escopos-redesign.md`
- Branch: `catalogo-escopos-redesign` (sem commit automático)
- Rota: `/crm/admin/proposta-escopo` — fora de escopo: `proposta-escopo-por-area` (lead)

### Bugs corrigidos (B1–B8)

| ID | Correção |
|----|----------|
| B1 | Removido `router.refresh()` dos handlers CRUD do catálogo |
| B2 | Investimentos sem L1 fantasma (`hideLabel`, lista plana) |
| B3 | Seleção órfã limpa via `selectionStillValid` pós-delete |
| B4 | Seleções separadas por aba + empty detail coerente |
| B5 | **Ignorado intencionalmente** — `NewItemDialog` mantém `<select>` nativo (sem Base UI Select); padrão `modal-select-safety` não aplicável |
| B6 | Contagens da UI lidas do `data` devolvido pela API |
| B7 | `catalog-empty-detail.tsx` com CTAs |
| B8 | Dirty-guard (`window.confirm`) ao trocar seleção/aba |

### Testes

- `scope-catalog-tree.test.ts`: 14 testes (builders, filtro, seleção pós-CRUD, `findCreatedId`)

### Gate final (Task 6) — 2026-07-28

| Comando | Exit |
|---------|-----:|
| `npm test -- src/components/crm/scope-catalog` | 0 — 1 file, 14 tests |
| `npm test` | 0 — 25 files, 134 tests |
| `npx tsc --noEmit` | 0 |
| `npm run lint` | 0 — 0 errors, 4 warnings pré-existentes (`no-img-element` ×3, `no-unused-vars` ×1) |
| `git diff --name-only -- src/app/(crm)/crm/leads/` | 0 — sem alterações em leads |

**Smoke manual (browser): pendente** — seed → criar tipo/subtipo → editar/salvar → trocar aba → delete → busca/filtro área.
