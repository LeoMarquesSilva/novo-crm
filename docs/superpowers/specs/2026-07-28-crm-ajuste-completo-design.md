# Design: Programa de ajuste completo do CRM jurídico

**Data:** 2026-07-28  
**Abordagem:** Programa em ondas (recomendação aprovada)  
**Produto:** CRM jurídico (Next.js 16 + Supabase) em `crm/`

## 1) Problema

O CRM já cobre o funil jurídico principal (lead → DUE → proposta → contrato/D4Sign), mas acumulou dívida em três eixos:

1. **Segurança e consistência** — service role nas páginas, autorização fina incompleta, webhooks/atomicidade parcialmente endurecidos, drift de migrations Git ↔ remoto.
2. **Produto incompleto** — `/crm/clientes` e partes de contratos ainda superficiais/mock no contexto; pós-venda pouco operacional; VIOS stub; reconcilição RD parcial.
3. **Estrutura** — hotspots monolíticos (`contrato-document-builder`, `lead-detail-view`, `d4sign-dashboard`, `new-demand-form`, `pipeline-board`) e `system-context.md` desatualizado em pontos críticos.

Não cabe um “big bang”: o risco e o tamanho exigem ondas com critério de pronto verificável.

## 2) Objetivo

Levar o CRM a um estado em que:

- mutações críticas são autenticadas, autorizadas e atómicas;
- papéis (`admin` | `comercial` | `controladoria` | `financeiro`) e áreas de prática limitam ações na API e na UI;
- fluxos jurídicos DUE → proposta → contrato → pós-venda e cadastro de clientes/contratos são utilizáveis end-to-end com dados reais;
- integrações externas são fail-closed, com timeout e sem stubs “fantasma” em produção;
- hotspots grandes estão fatiados o suficiente para manutenção segura;
- `docs/system-context.md` reflete o código real.

## 3) Fora de escopo (programa)

- Redesign visual completo / rebrand.
- Troca de stack (Next, Supabase, D4Sign).
- Migração massiva de dados históricos do RD além do que já existe.
- Implementação completa do VIOS se a decisão da Onda 4 for “remover stub e desligar endpoint” (documentar e desativar, não construir o ERP).

## 4) Arquitetura de execução

```
Onda 1 (base) → Onda 2 (authz) → Onda 3 (produto)
                      ↘
                       Onda 4 (integrações) pode paralelizar com 3 após Onda 1
Onda 5 (estrutura) — só nos hotspots que bloqueiem a onda corrente; fecho dedicado no fim
```

Cada onda produz, nesta ordem:

1. Spec curta em `docs/superpowers/specs/` (se a onda não estiver já coberta por plan existente).
2. Plan em `docs/superpowers/plans/` com tasks checkbox.
3. Implementação (preferência: `subagent-driven-development`).
4. Atualização de `docs/system-context.md` + entrada em changelog técnico (quando existir).
5. Gate: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` (e advisors Supabase quando a onda tocar DB).

**Fonte de verdade Onda 1:** o plan já existente  
`docs/superpowers/plans/2026-07-27-system-hardening.md` — não reescrever; executar, marcar checkboxes e registar gaps reais encontrados.

## 5) Ondas

### Onda 1 — Segurança e base operacional

**Objetivo:** fechar o hardening já especificado.

**Inclui (do plan 2026-07-27):**

- Auth admin (senha, último admin, `requireAuthApi` com profile não nulo).
- Policies de acesso a documentos D4Sign e PATCH de lead.
- Webhooks D4Sign/RD fail-closed + idempotência.
- RPCs atómicas de transição/delete.
- Advisors DB (search_path, grants, índices FK, policies).
- `fetchWithTimeout` nos conectores.
- Dependências, CI, Node engines.
- Lint React 19 / qualidade estática.
- Documentação e verificação final do hardening.

**Critério de pronto:**

- Checkboxes do plan 2026-07-27 concluídos ou explicitamente adiados com motivo no changelog.
- Suíte final do plan verde.
- Nenhuma regressão conhecida em transição de etapa, webhook D4Sign ou admin users.

**Não inclui:** matriz completa role×área na UI (Onda 2); clientes reais (Onda 3).

### Onda 2 — Autorização fina (papel + área)

**Objetivo:** uma política única de acesso consumida por APIs e UI.

**Componentes:**

- Estender `src/lib/auth/crm-access-policy.ts` (e testes) com matriz documentada:
  - quem cria/edita lead, quem avança etapa, quem edita DUE por área, quem envia proposta/contrato, quem gere admin.
- Rotas sob `src/app/api/crm/**` e `src/app/api/admin/**` passam a consultar a mesma política (não só “tem sessão”).
- UI: ocultar/desabilitar ações no kanban, ficha do lead e admin conforme a política (sem confiar só no esconder botão).
- Reduzir leituras SSR com `createSupabaseAdminClient` onde o client autenticado + RLS bastar; service role só em jobs, webhooks e operações que exijam bypass documentado.

**Critério de pronto:**

- Matriz role×ação (e área, onde aplicável) em `system-context.md`.
- Testes de política cobrindo negação para cada papel sensível.
- Spot-check manual: comercial não executa ações de admin; área X não muta DUE de área Y sem regra explícita.

### Onda 3 — Produto jurídico completo

**Objetivo:** fechar buracos de produto que o contexto já marca como mock/parcial.

**Escopo:**

- **Clientes:** `/crm/clientes` com dados reais (`clientes`, contatos), CRUD alinhado a papéis, sem badge “Ativo” hardcoded sem fonte.
- **Contratos:** alinhar `/crm/contratos` e ficha ao modelo `contratos` / `aditivos` / estado D4Sign (sair de tabela mock se ainda existir).
- **Pós-venda:** tornar operacionais as colunas `POS_VENDA_PIPELINE_COLUMNS` (pré-condições, campos, transições, painéis mínimos).
- **Auditoria:** toda mutação relevante de lead chama `recordLeadActivityEvent` (ou equivalente); gap listado e fechado nas rotas tocadas.
- **Solicitante / avatares:** manter regra `CrmUserLabel` em ecrãs de pessoas.

**Critério de pronto:**

- Fluxo demo documentado: abrir demanda → (DUE se aplicável) → proposta → contrato → assinatura → pelo menos uma etapa pós-venda, com cliente persistido.
- `system-context.md` deixa de classificar clientes/contratos como mock.

### Onda 4 — Integrações

**Objetivo:** limites externos previsíveis e sem stubs silenciosos.

**Escopo:**

- RD: webhook só por header; import/cron estáveis; relatório de reconciliação real ou endpoint descontinuado (410) com nota no contexto.
- D4Sign: cron sync, quota, webhook; endpoint `d4sign/debug` restrito e documentado (ou removido em produção).
- Evolution/WhatsApp DUE, SharePoint agendamentos, Microsoft mail: timeouts + erros sanitizados (complemento Onda 1).
- **Decisão VIOS (obrigatória no início da onda):**
  - **A)** implementar cliente mínimo real, ou  
  - **B)** remover stub, desligar rota pública e documentar “não disponível”.  
  Sem meio-termo: stub que parece integração real é proibido após esta onda.

**Critério de pronto:**

- Decisão VIOS registada e refletida no código + docs.
- Integrações críticas com auth fail-closed e timeout.
- Sem endpoint “stub” exposto como se fosse produção.

### Onda 5 — Qualidade estrutural

**Objetivo:** reduzir risco de regressão nos ficheiros mais pesados.

**Hotspots alvo (partir / extrair módulos, sem rewrite cosmético):**

| Ficheiro | Direção |
|----------|---------|
| `contrato-document-builder.tsx` | Extrair secções, estado, calls API |
| `lead-detail-view.tsx` | Tabs/containers por domínio |
| `d4sign-dashboard.tsx` | Lista, detalhe, ações |
| `new-demand-form.tsx` | Steps / validação / submit |
| `pipeline-board.tsx` | Board shell vs card vs DnD handlers |

**Regras:**

- Extrair só com testes ou contratos de props claros.
- Não misturar mudança de comportamento de produto nesta onda (exceto bugs descobertos).
- Meta prática: hotspots principais abaixo de ~500 linhas ou com pastas de feature colocalizadas.

**Critério de pronto:**

- Hotspots listados fatiados ou justificados (exceção documentada).
- Lint/typecheck/build verdes.
- Contexto atualizado com mapa de componentes.

## 6) Dados e migrations

- DDL continua versionado em `crm/supabase/migrations/`.
- Aplicação remota via MCP `user-supabase-crm-new` / `apply_migration` quando o utilizador pedir base aplicada.
- Onda 1 documenta o procedimento de drift (repo com poucas migrations vs schema remoto rico).
- Novas RPCs: `REVOKE` de `public`/`anon`/`authenticated`; `GRANT` só a `service_role`.

## 7) Erros, segurança e testes

- APIs: Zod na borda; erros de negócio estruturados; sem vazar tokens/payloads de integração.
- Webhooks: segredo obrigatório; comparação segura; idempotência onde houver efeito.
- Testes: Vitest para políticas, webhooks helpers, transições; gates de onda listados na secção 4.
- Não desabilitar regras ESLint para “passar” a onda; corrigir causa.

## 8) Ordem de trabalho imediata

1. **Agora:** esta spec (programa).
2. **Seguinte:** executar Onda 1 via plan `2026-07-27-system-hardening.md` (writing-plans só se forem necessários gaps novos; caso contrário `executing-plans` / `subagent-driven-development` sobre o plan existente).
3. Depois: specs dedicadas para Ondas 2–5 antes de cada implementação.

## 9) Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Escopo “tudo” dilui foco | Gates por onda; proibir misturar Onda 5 com features |
| Hardening plan checkboxes desatualizados vs código já parcialmente feito | Auditar estado real no início da Onda 1 e marcar feito/pendente |
| Quebrar produção interna | Preferir RPCs/testes; não aplicar SQL remoto sem pedido explícito |
| Docs drift | Atualizar `system-context.md` no fecho de cada onda |

## 10) Sucesso do programa

O programa termina quando as cinco ondas cumprem o respetivo critério de pronto e o `system-context.md` descreve autenticação (proxy), rotas, mocks eliminados, VIOS decidido e matriz de autorização alinhada ao código.
