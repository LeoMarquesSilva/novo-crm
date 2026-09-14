# Status do Redesign V2 — CRM BP

> **Como usar este arquivo:** este é o log vivo do redesign visual (Design System V2 / Corporate Clean SaaS). Antes de começar qualquer tarefa, leia a seção "Snapshot atual". Ao terminar uma fase, uma etapa relevante ou tomar uma decisão que afete outros agentes, **atualize este arquivo** (adicione uma entrada no changelog abaixo, não apague o histórico). Isso substitui precisar reexplicar contexto a cada terminal novo ou sessão reiniciada.

Responsável por manter atualizado: **Claude — Arquiteto/Lead (Maestro)**. Os demais agentes (Codex, Cursor/Grok) devem ler antes de iniciar e podem propor atualizações via `maestri ask` ao Lead.

Documento-fonte: `DESIGN_SYSTEM_V2_CRM_BP.md` (raiz do projeto) — é a especificação completa e não deve ser reescrita; este arquivo só registra progresso e decisões.

---

## Snapshot atual

*(Última atualização: 14/09/2026 — preencher com data/hora real a cada edição)*

- **Fase atual:** Fase 2 — Primitives — lote 1 concluído (Button, Input, Select+CrmSelect, Badge, Card/Surface, Dialog+AlertDialog); restam Checkbox/Radio/Switch, Tabs, Table/Skeleton/Progress/Alert, Popover/Tooltip, DateInputBr/TimeInputBr/CalendarBr
- **Fases concluídas:** Fase 0 — Auditoria; Fase 1 — Fundação de tokens
- **Próxima fase:** completar o restante da Fase 2, depois Fase 3 — Shell e padrões globais (AppShell, sidebar, PageHeader)
- **Bloqueios conhecidos:** ver seção "Bloqueios" abaixo

## Fases (referência rápida — ver seção 33 do documento-fonte para detalhes completos)

- [x] Fase 0 — Auditoria
- [x] Fase 1 — Fundação (tokens, cores, tipografia, raio, sombra, motion, z-index)
- [ ] Fase 2 — Primitives (Button, Input, Select/CrmSelect, Checkbox/Radio/Switch, Tabs, Badge, Card/Surface, Dialog/AlertDialog/Popover/Tooltip, Table/Skeleton/Progress/Alert, DateInputBr/TimeInputBr/CalendarBr) — **em andamento**
- [ ] Fase 3 — Shell e padrões globais (AppShell, sidebar 72/248px, navegação mobile, PageHeader V2, Toolbar, Surface, EntityHeader)
- [ ] Fase 4 — Kanban de Leads / Novo Lead
- [ ] Fase 5 — Propostas / Contratos
- [ ] Fase 6 — Demais módulos (Dashboard, Clientes, Due diligence, Administração, Login)
- [ ] Fase 7 — Limpeza (remoção de tokens legados, Inter, estilos locais órfãos)

## Decisões registradas

| Data | Decisão | Responsável | Motivo |
|---|---|---|---|
| 14/09/2026 | Commitar separadamente 15 mudanças não commitadas em proposta/contrato (regra de negócio) antes de iniciar trabalho visual | Claude (Lead) | Isolar mudanças funcionais pré-existentes do trabalho de redesign, evitando misturar histórico |
| 14/09/2026 | Fase 1: **não** sobrescrever a escala de raio legada (`--radius-sm/md/lg/xl/2xl/3xl/4xl`, calculada a partir de `--radius`) nem `shadow-sm/md/lg` nativos do Tailwind. Escala V2 entra sob nomes novos e não-colidentes: `--radius-v2-sm/md/lg/xl/2xl/full` e `--shadow-v2-xs/sm/md/lg`, como custom properties soltas em `:root` (fora de `@theme inline`), consumíveis via `rounded-[var(--radius-v2-lg)]` / `shadow-[var(--shadow-v2-md)]` | Claude (Lead) | A escala legada tem 482 usos em 99 arquivos; o Badge depende de `rounded-4xl` pra ficar pill-shaped. Sobrescrever direto quebraria isso antes da Fase 2 revisar cada primitive. Ver `DESIGN_TOKENS_CHEATSHEET.md` |
| 14/09/2026 | Mesma lógica para a escala tipográfica V2: classes `.text-v2-display-sm`, `.text-v2-heading-xl` etc. (prefixo `v2`), para não colidir com `.heading-xl`/`.heading-lg` já em uso (login, dashboard, clientes) | Claude (Lead) | Evitar recolorir telas ainda não migradas (Fases 4/6) |
| 14/09/2026 | Tokens de texto semântico (`--text-primary`, `--text-secondary`, `--text-muted`, `--text-placeholder`, `--text-disabled`) ficam como custom properties soltas em `:root`, **fora** do bloco `@theme inline`; o alias de utility Tailwind usa chave própria (`--color-text-primary-v2` etc.) apontando pro valor canônico | Claude (Lead), revisado por Codex | Dentro de `@theme`, um `--text-primary` bruto colide com o namespace `--text-*` de tamanho de fonte do Tailwind v4 e geraria um utilitário `text-primary` concorrente com o que já vem de `--color-primary` |
| 14/09/2026 | Tokens semânticos shadcn (`--background`, `--primary`, `--border`, `--input`, `--ring`, `--destructive`, paleta de gráficos) foram sobrescritos direto pros valores V2 já na Fase 1, sem alias temporário | Claude (Lead) | Blast radius mapeado por grep antes da troca. Correção (apontada pela Codex): a estilização pesada de Button/Card/sidebar (gradiente teal, `.glass-card`, pill, navy) continua vindo de classes/cores próprias (`--accent-teal`, `--primary-dark`, `--sidebar-*`) intocadas — mas há consumo semântico direto real desses tokens em Button (`primary-foreground`, `secondary`, `destructive`), Card (`card-foreground`), e `--border` alcança globalmente via `* { @apply border-border }` e as 682 utilities `border`/`border-x/y/t/r/b/s/e` em 110 arquivos. Risco avaliado como baixo mesmo assim: valores V2 próximos dos legados nesses pontos (cores de texto/estado, não a decoração visual pesada) |
| 14/09/2026 | Motion (`--motion-fast/default/slow/ease`) e z-index (`--z-base`…`--z-drag-overlay`) definidos na Fase 1 mas **não aplicados** a nenhum componente ainda; z-index hardcoded atual (40/50/60/70/100/120/130/400) permanece intacto | Claude (Lead) | Migração de z-index precisa ser um lote único coordenado (Fase 3 — Shell/overlays), não pontual, pra não quebrar empilhamento de overlays |
| 14/09/2026 | Fase 2, lote 1 (Button/Input/Select+CrmSelect/Badge/Card/Dialog+AlertDialog): todas as props/API existentes preservadas (`variant`/`size` do Button, `size` do Select etc.) — só as classes Tailwind internas mudaram. Button: `rounded-full`→`rounded-[var(--radius-v2-lg)]`(10px), removido hover/active translate, `teal` e `cta` passam a renderizar como `primary` (nomes mantidos por compat., 26+8 consumidores intocados), `secondary` virou `bg-white` (era `bg-secondary`), `inverse` (variante oficial nova) e `hero` (legada) usam branco-sobre-navy, disabled ganhou fundo neutro + texto disabled em vez de só opacidade, `icon`/`icon-sm`/`icon-lg` foram para 36/32/40px (V2), size `control`=36px é novo. Input/Select: 40px (36px em `data-size=sm`), raio 8px, foco azul. Card: parou de usar `.glass-card` (classe global, ainda usada por outros 15 consumidores intocados) e passou a ter raio/borda/fundo próprios sem sombra. Dialog/AlertDialog: conteúdo opaco (sem blur/translucidez), raio 16px, `shadow-v2-lg` | Claude (Lead), revisado por Codex | Reduzir risco: qualquer um dos ~700 call-sites desses componentes continua funcionando sem alteração de código |
| 14/09/2026 | `--text-placeholder` mudou de `#98A2B3` (neutral-400, ~2,58:1 sobre branco) para `#667085` (mesmo valor de `--text-secondary`/neutral-500, ~4,98:1) — desvio deliberado do valor literal do documento-fonte | Claude (Lead), achado bloqueante da Codex | `#98A2B3` não atinge WCAG AA (4,5:1) para texto normal e §27.1 exige AA; só ficou um problema real quando Input/Select passaram a consumir o token de fato, na Fase 2. `--text-disabled` manteve `#98A2B3` (WCAG isenta componente desabilitado do requisito) |

## Ressalvas da Codex (QA) — pendências não-bloqueantes para a Fase 2+

Registradas na revisão de fechamento da Fase 1 (aprovado com ressalvas):

1. Considerar registrar radius/shadow/tipografia V2 diretamente nos namespaces do `@theme` (mantendo o sufixo `v2`) à medida que cada primitive migrar, permitindo `rounded-v2-lg`, `shadow-v2-md`, `text-v2-heading-xl` como utilities de verdade em vez de custom properties soltas.
2. Tokens semânticos (`--primary`, `--border` etc.) hoje repetem o hex das primitivas (`--interactive-600`, `--neutral-200`) em vez de referenciá-las via `var(...)`. Encadear (`--primary: var(--interactive-600)`) reduziria risco de divergência futura.
3. ~~`--text-placeholder: #98A2B3` sobre fundo branco tem contraste ~2,58:1~~ — **resolvido na Fase 2**: quando Input/Select passaram a consumir o token de fato, a Codex escalou isso a bloqueador (viola WCAG AA, §27.1). `--text-placeholder` passou a usar o valor de `--text-secondary`/`neutral-500` (`#667085`, ~4,98:1), um desvio deliberado do valor literal do documento-fonte (que mapeia placeholder para `neutral-400`) — `--text-disabled` manteve `#98A2B3` porque WCAG isenta componentes desabilitados do requisito de contraste.
4. O contrato Dialog+Select (`src/lib/ui/base-ui-select-dialog.ts`) segue estruturalmente intacto (nada da Fase 1 tocou nisso) — **verificado e promovido a teste permanente na Fase 2**: `src/lib/ui/base-ui-select-dialog.test.tsx` (baseado no smoke test que a Codex escreveu para a revisão, adaptado ao `vitest.config.ts` do repo). Passa: selecionar uma opção do Select não fecha o Dialog.

## Ressalvas da Codex (QA) — pendências não-bloqueantes para o restante da Fase 2

Registradas na revisão de fechamento do lote 1 (Button/Input/Select+CrmSelect/Badge/Card/Dialog+AlertDialog — aprovado com ressalvas):

1. `src/components/ui/select.tsx`: o `SelectContent` de base tinha `align="center"` como default, enquanto §18.1 pede alinhamento inicial (`align="start"`) — **corrigido**. `CrmSelectContent` já fixava `start` explicitamente, então nenhum consumidor via `CrmSelect` foi afetado; só o default do primitive cru mudou.
2. Dialog/AlertDialog ainda carregam dívida visual anterior à Fase 2: sem contrato estrutural de largura/margem no mobile nem de `max-height`/scroll interno quando o conteúdo é maior que a viewport. Não é regressão desta fase — registrar para tratar quando Dialog for revisitado (Fase 3+, ou quando um consumidor concreto expuser o problema).

## Bloqueios / pontos de atenção

| Data | Item | Status |
|---|---|---|
| 14/09/2026 | Terminal "Cursor — Frontend/UI" trava visualmente na tela "Trusting workspace..." e não respondeu a cliques/teclas em teste manual | Não resolvido — não bloqueia os demais agentes; verificar manualmente no Maestri |

## Equipe e responsabilidades (referência)

- **Claude — Arquiteto/Lead** (Maestro): coordena fases, decide ordem, resolve conflitos, aciona revisão do Codex
- **Codex — QA/Revisor**: revisão independente de cada entrega (build, lint, typecheck, regressão de contratos funcionais)
- **Cursor — Frontend/UI**: generalista de execução visual
- **Grok — Leads/Kanban**: migração visual do pipeline de leads e Kanban
- **Grok — Propostas/Contratos**: migração visual do builder de propostas e contratos (área sensível — conteúdo jurídico não pode ser reescrito)

## Changelog

- **14/09/2026** — Arquivo criado. Snapshot inicial registrado com base no estado observado: Fase 0 concluída, Fase 1 em andamento (tokens sendo escritos em `globals.css`, dois builds de validação rodando em paralelo — Claude e Codex, cada um independente).
- **14/09/2026** — Fase 1 concluída e commitada (`eeff1f8`). Codex revisou o diff de `globals.css`, achou e teve confirmado a correção de dois problemas reais antes de aprovar: (1) comentário CSS malformado (`*/` acidental no meio do texto, fechando o comentário cedo — corrigido); (2) contrato §7.2 incompleto (`--secondary-hover` e `--text-disabled` ausentes, quatro tokens renomeados sem necessidade — corrigido, valores canônicos restaurados). Veredito final: **aprovado com ressalvas** (não-bloqueantes, listadas acima). Validação (lint/typecheck/vitest 479 testes/build) rodada de forma independente pelos dois lados, resultado idêntico. Iniciando Fase 2 (Primitives) em seguida, por pedido do usuário.
