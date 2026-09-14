# Status do Redesign V2 — CRM BP

> **Como usar este arquivo:** este é o log vivo do redesign visual (Design System V2 / Corporate Clean SaaS). Antes de começar qualquer tarefa, leia a seção "Snapshot atual". Ao terminar uma fase, uma etapa relevante ou tomar uma decisão que afete outros agentes, **atualize este arquivo** (adicione uma entrada no changelog abaixo, não apague o histórico). Isso substitui precisar reexplicar contexto a cada terminal novo ou sessão reiniciada.

Responsável por manter atualizado: **Claude — Arquiteto/Lead (Maestro)**. Os demais agentes (Codex, Cursor/Grok) devem ler antes de iniciar e podem propor atualizações via `maestri ask` ao Lead.

Documento-fonte: `DESIGN_SYSTEM_V2_CRM_BP.md` (raiz do projeto) — é a especificação completa e não deve ser reescrita; este arquivo só registra progresso e decisões.

---

## Snapshot atual

*(Última atualização: 14/09/2026 — preencher com data/hora real a cada edição)*

- **Fase atual:** Fase 3 — Shell e padrões globais — lote 1 concluído (AppShell: sidebar 72/248px + item ativo; CrmPageHeader; CrmSurfaceHeader). Restam: navegação mobile (header 56-60px, ainda ~64px), CrmToolbar, EntityHeader, limpeza dos hex crus restantes no AppShell
- **Fases concluídas:** Fase 0 — Auditoria; Fase 1 — Fundação de tokens; Fase 2 — Primitives
- **Próxima fase:** completar o restante da Fase 3, depois Fase 4 — Kanban de Leads / Novo Lead
- **Bloqueios conhecidos:** ver seção "Bloqueios" abaixo

## Fases (referência rápida — ver seção 33 do documento-fonte para detalhes completos)

- [x] Fase 0 — Auditoria
- [x] Fase 1 — Fundação (tokens, cores, tipografia, raio, sombra, motion, z-index)
- [x] Fase 2 — Primitives (Button, Input, Textarea, Select/CrmSelect, Switch, Tabs, Badge, Card/Surface, Dialog/AlertDialog/Popover/Tooltip, Table/Skeleton/Progress/Alert, DateInputBr/TimeInputBr/CalendarBr). Checkbox/RadioGroup: n/a (não existem no repo). Avatar/Label: revisados, sem alteração
- [ ] Fase 3 — Shell e padrões globais (AppShell, sidebar 72/248px, navegação mobile, PageHeader V2, Toolbar, Surface, EntityHeader) — **lote 1 concluído (AppShell/CrmPageHeader/CrmSurfaceHeader), em andamento**
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
| 14/09/2026 | **Todas** as ocorrências de `rounded-[var(--radius-v2-*)]`/`shadow-[var(--shadow-v2-*)]` (27, em 15 arquivos, incluindo os já commitados no lote 1) trocadas pela sintaxe curta do Tailwind v4 `rounded-(--radius-v2-*)`/`shadow-(--shadow-v2-*)` | Claude (Lead), achado bloqueante da Codex | `tailwind-merge` não reconhece de forma confiável duas classes `[var(--x)]` (bracket+var()) como conflitantes entre si — um `className` de consumidor com um `shadow-[...]`/`rounded-[...]` próprio ficava "empatado" com o do primitive nas duas classes convivendo no DOM, e o CSS compilado decidia por ordem de declaração (o primitive podia vencer silenciosamente, sem erro nenhum). A sintaxe `(--x)` é reconhecida corretamente. Regra para daqui pra frente: **sempre usar `rounded-(--token)`/`shadow-(--token)`, nunca `rounded-[var(--token)]`**, para qualquer arbitrary value que referencie uma custom property |
| 14/09/2026 | Tabs: variante `segmented` (§20.1) adicionada como alias visual de `default` (mesmas classes); raio do container 8px→10px (radius-v2-lg) e do trigger 14px legado→8px (radius-v2-md) | Claude (Lead), achado da Codex | `segmented` era o único valor de variant do documento-fonte ausente na implementação |
| 14/09/2026 | Table: `TableRow` ganhou `h-11` (44px) explícito | Claude (Lead), achado da Codex | Padding sozinho (`py-2.5` + `text-sm`) só alcançava ~40px, abaixo da faixa 44-52px do §21.1 |

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

## Decisões e achados — Fase 3, lote 1 (AppShell / CrmPageHeader / CrmSurfaceHeader)

| Data | Decisão/achado | Responsável | Motivo |
|---|---|---|---|
| 14/09/2026 | Sidebar: 88px→72px recolhida, 282px→248px expandida (§14.2); padding-left do conteúdo principal acompanhou | Claude (Lead) | Valor exato do documento-fonte |
| 14/09/2026 | Item ativo do nav: removido o "quadrado navy" ao redor do ícone e a sombra; agora `bg-interactive-50` + texto/ícone `interactive-700`, com barra lateral de 2px opcional (`before:`) | Claude (Lead) | §14.2 proíbe explicitamente ambos ("sem quadrado navy ao redor do ícone", "sem sombra") |
| 14/09/2026 | z-index do AppShell (mobile header/overlay/drawer, sidebar hover-overlay): números crus (40/50/60) trocados pelas custom properties `z-(--z-navigation)` etc. — **mesmos valores numéricos**, sem mudança visual, só formaliza a referência ao token definido na Fase 1 | Claude (Lead) | Entrega o que ficou pendente desde a Fase 1 ("migração de z-index é lote único coordenado na Fase 3") |
| 14/09/2026 | `CrmPageHeader`: removido o wrapper de card (`rounded-[28px] border shadow bg-white/70`), ícone deixou de ficar numa caixa 44×44 (agora solto, 20px), título perdeu o `md:` que duplicava o tamanho, badges/stats perderam sombra e foram para tokens | Claude (Lead) | §14.4 usa este componente como exemplo textual direto: "PageHeader deixa de ser um card gigante" |
| 14/09/2026 | `overflow-hidden` removido do `CrmPageHeader` (achado da Codex) | Claude (Lead), achado da Codex | Sobrou do card antigo (clipava cantos arredondados); sem o card, cortava o ring de foco dos botões de `actions` nas bordas |
| 14/09/2026 | `crmSurfaceCardClass`/`crmSurfaceHeaderClass`/`crmSurfaceSegmentedRoot/TabClass` (exports do `crm-surface-header.tsx`, usados no shell/toolbar do kanban): zinc-* trocado por tokens, raio para 12px (card) / 10px+8px (segmented), sombra removida do card | Claude (Lead) | §15.1 (Surface) e §20.1 (Tabs segmented) |
| 14/09/2026 | Verificação visual em browser **não realizada** neste lote — precisaria de sessão autenticada (Supabase) sem credenciais de teste disponíveis. Validação ficou restrita a lint/typecheck/vitest/build + revisão de diff e CSS compilado pela Codex | Claude (Lead) | Transparência: `DESIGN_SYSTEM_V2_CRM_BP.md` §36.4 pede inspeção visual quando há ambiente disponível — registrar a lacuna em vez de omitir |

Pendências não-bloqueantes para o próximo lote (achados da Codex):

1. Header mobile do AppShell mede ~64px (`size-10` + `py-3`); §14.3 pede 56-60px. Pré-existente, não é regressão deste lote.
2. Vários hex crus continuam no `app-shell.tsx` (`#f8f9fb`, `#e6e9ef`, `#e1e5eb`, `#f3f5f8`, gradiente do logo BP) — deliberadamente fora de escopo deste lote (focado no que o documento pede explicitamente para a sidebar); logo BP não é considerado violação (é a marca, não uma ação/botão).

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
- **14/09/2026** — Fase 2 concluída em dois lotes, ambos revisados pela Codex. Lote 1 (`882377d`): Button/Input/Select+CrmSelect/Badge/Card/Dialog+AlertDialog — achados corrigidos: `--text-placeholder` violava WCAG AA, variantes do Button (`inverse`/`teal`/`cta`/`secondary`/disabled) inconsistentes com §16; smoke test do contrato Dialog+Select promovido a teste permanente (`src/lib/ui/base-ui-select-dialog.test.tsx`). Lote 2 (`c4fdc82`): Alert/Textarea/Switch/Tabs/Table/Skeleton/Popover/Tooltip/Progress/CalendarBr/DateInputBr/TimeInputBr — achados corrigidos: Tabs sem a variante `segmented` do §20.1 (adicionada como alias de `default`), `TableRow` não alcançava 44px (`h-11` adicionado), e um achado sistêmico importante — `tailwind-merge` não resolve corretamente duas classes `rounded-[var(--x)]`/`shadow-[var(--x)]` como conflitantes, deixando um `className` de override de consumidor silenciosamente inoperante (achado no `PopoverContent` de `sidebar-account-menu.tsx`); todas as 27 ocorrências (dos dois lotes) trocadas pela sintaxe curta `rounded-(--x)`/`shadow-(--x)` do Tailwind v4, confirmada com teste direto do `twMerge`. Veredito final do lote 2: **aprovado, sem ressalvas**. Checkbox/RadioGroup não existem como componentes no repo; Avatar/Label revisados e mantidos como estão. Validação idêntica dos dois lados em ambos os lotes.
- **14/09/2026** — Fase 3 (Shell), lote 1: AppShell (sidebar 72/248px, item ativo, z-index formalizado), CrmPageHeader (removido o card de 28px de raio — exemplo textual direto do §14.4), CrmSurfaceHeader. Codex achou 1 bloqueador real (`overflow-hidden` sobrando no novo `CrmPageHeader` cortava o ring de foco dos botões de `actions`, corrigido) e confirmou duas dúvidas técnicas levantadas por mim (ícone da sidebar recolhida cabe sem corte a 72px; `before:` pseudo-elemento não precisa de `content-['']` explícito, Tailwind já inicializa `--tw-content: ""` globalmente). Duas ressalvas não-bloqueantes registradas acima (header mobile ~64px vs 56-60px do §14.3; hex crus restantes no AppShell). Verificação visual em browser autenticado não foi possível neste lote (sem credenciais de teste) — registrado como lacuna, não omitido. Codex terminou a revisão perto do limite de sessão (~5%); não pedi rodada extra depois dos dois ajustes finais (comentário desatualizado dizendo "88px", este changelog) — apliquei e validei sozinho (lint/typecheck/480 testes/build, um teste falhou uma vez por instabilidade do ambiente e passou limpo na repetição).
