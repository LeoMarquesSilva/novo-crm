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
