<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# CRM agent rules

Antes de qualquer mudança de comportamento, autenticação, schema ou integração:

1. Ler `docs/system-context.md`.
2. Se o código divergir do documento, atualizar o documento na mesma alteração.
3. Migrations DDL: versionar em `supabase/migrations/` e aplicar no remoto só com pedido explícito (MCP `user-supabase-crm-new`).
4. Programa de ajuste: `docs/superpowers/specs/2026-07-28-crm-ajuste-completo-design.md`.

## Redesign visual (Design System V2)

Se a tarefa envolver qualquer mudança visual/UI, ler nesta ordem antes de codar:

1. `docs/STATUS_REDESIGN.md` — fase atual, decisões e bloqueios (log vivo — atualizar ao concluir uma etapa).
2. `docs/FILE_MAP_REDESIGN.md` — onde fica cada componente/rota por área do CRM.
3. `docs/DESIGN_TOKENS_CHEATSHEET.md` — valores exatos de cor, tipografia, espaçamento, raio, sombra, motion e z-index.
4. `DESIGN_SYSTEM_V2_CRM_BP.md` (raiz) — especificação completa; consultar para regras de uso e casos não cobertos pelo cheat-sheet.

Não reescrever regra de negócio, cláusulas contratuais ou lógica de `src/modules/**` durante trabalho visual.
