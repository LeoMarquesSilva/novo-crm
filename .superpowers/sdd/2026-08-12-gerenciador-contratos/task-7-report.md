# Task 7 — Implantação do contrato no pós-venda

## Documentação lida

- `AGENTS.md`
- `docs/system-context.md`
- `docs/superpowers/specs/2026-08-12-gerenciador-contratos-design.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
- Skill TDD e `writing-good-tests.md`

## RED / GREEN

- RED: o teste `blocks leaving billing inclusion while the financial setup is incomplete` falhou porque a transição ainda retornava `ok: true`.
- GREEN: a precondição pura passou a considerar a etapa atual. Entrar em `inclusao_faturamento` continua permitido; somente `inclusao_faturamento -> boas_vindas` exige `financeiroConcluido=true`.
- Resultado focado final: 7 testes aprovados.

## Blocker, ficha do lead e SQL

- `transition-requirements` consulta a etapa real da oportunidade e só monta `transitionBlocker` para `inclusao_faturamento -> boas_vindas` quando o contrato vinculado não possui versão ativa válida.
- O blocker preserva o contrato `{ code, message, contractId, actionHref }` e direciona para `/crm/contratos/{id}?setup=1&returnTo=/crm/leads/{opportunityId}`.
- O POST de transição repete a validação no servidor e traduz o erro SQL estável para o mesmo fluxo acionável.
- O kanban usa `{ message, actionHref? }`, preserva os erros genéricos existentes e mostra o CTA apenas quando existe ação.
- A ficha do lead carrega resumo do contrato, versão ativa/rascunho, progresso, origem das sugestões, bloqueios e setup href. A aba `Faturamento` aparece de `inclusao_faturamento` em diante e não embute o wizard.
- `transition_opportunity_atomic` bloqueia em profundidade a transição com `CONTRACT_BILLING_SETUP_REQUIRED` sem contrato ativo, versão ativa e requisitos financeiros mínimos.

## Checks finais

- `npm.cmd test -- src/modules/crm/application/services/transition-opportunity.test.ts` — exit 0, 7/7.
- `npx.cmd tsc --noEmit` — exit 0.
- `git diff --check` — exit 0; apenas avisos de normalização LF/CRLF.
- Untracked preexistentes foram preservados e não entram no stage.
