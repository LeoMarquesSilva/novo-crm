# Design system atual do CRM

> Estado documentado em 14 de setembro de 2026.
>
> Este documento descreve o design que está implementado hoje. Ele é uma referência de manutenção e não uma proposta de redesign.

## Sumário

1. [Objetivo e escopo](#1-objetivo-e-escopo)
2. [Resumo visual](#2-resumo-visual)
3. [Stack de interface](#3-stack-de-interface)
4. [Arquitetura dos tokens](#4-arquitetura-dos-tokens)
5. [Cores](#5-cores)
6. [Tipografia](#6-tipografia)
7. [Raios, bordas e sombras](#7-raios-bordas-e-sombras)
8. [Espaçamento, dimensões e responsividade](#8-espaçamento-dimensões-e-responsividade)
9. [Ícones, movimento e scroll](#9-ícones-movimento-e-scroll)
10. [Layout global e navegação](#10-layout-global-e-navegação)
11. [Superfícies e famílias visuais](#11-superfícies-e-famílias-visuais)
12. [Botões](#12-botões)
13. [Campos de formulário](#13-campos-de-formulário)
14. [Selects, dropdowns e pickers](#14-selects-dropdowns-e-pickers)
15. [Modais e confirmações](#15-modais-e-confirmações)
16. [Cards, painéis e headers](#16-cards-painéis-e-headers)
17. [Tabs, badges, switches e progressos](#17-tabs-badges-switches-e-progressos)
18. [Utilizadores, avatares e identidade](#18-utilizadores-avatares-e-identidade)
19. [Tabelas, listas e tooltips](#19-tabelas-listas-e-tooltips)
20. [Datas, horas e calendário](#20-datas-horas-e-calendário)
21. [Estados de loading, vazio, erro e sucesso](#21-estados-de-loading-vazio-erro-e-sucesso)
22. [Padrões por área do sistema](#22-padrões-por-área-do-sistema)
23. [Acessibilidade e conteúdo](#23-acessibilidade-e-conteúdo)
24. [Camadas e z-index](#24-camadas-e-z-index)
25. [Dark mode](#25-dark-mode)
26. [Inconsistências conhecidas](#26-inconsistências-conhecidas)
27. [Checklist de implementação](#27-checklist-de-implementação)
28. [Fontes de verdade no código](#28-fontes-de-verdade-no-código)

---

## 1. Objetivo e escopo

Este guia registra:

- identidade visual, cores e tipografia;
- tokens globais e valores locais recorrentes;
- layout, sidebar e responsividade;
- componentes compartilhados de UI;
- modais, selects, dropdowns, popovers e pickers;
- estados de interação e feedback;
- padrões específicos das principais telas;
- regras obrigatórias que evitam regressões de UX;
- divergências que fazem parte do estado atual.

O escopo principal é `src/app`, `src/components/ui`, `src/components/crm` e `src/lib/ui`.

## 2. Resumo visual

O CRM opera em **light mode**, com:

- fundo cinza-azulado muito claro `#f8f9fb`;
- navy `#172033` como cor estrutural e de texto;
- teal `#0f9f8f` como acento de ação, seleção e foco;
- cards brancos com bordas discretas e sombras difusas;
- tipografia Plus Jakarta Sans, frequentemente com tracking negativo;
- botões em formato pill;
- sidebar cinza-clara, recolhida por padrão;
- uso pontual de headers navy escuros no detalhe do lead e no cadastro de lead.

Há três famílias visuais em uso:

1. **Glass + navy/teal:** linguagem principal e mais difundida.
2. **Neutra zinc:** superfícies recentes, especialmente toolbar e shell do kanban.
3. **Novo Lead / Lead Hero:** linguagem local, mais contrastada, com header `#0b1724` e campos maiores.

Essas famílias coexistem no sistema atual.

## 3. Stack de interface

| Camada | Tecnologia atual |
|---|---|
| Framework | Next.js 16 e React 19 |
| Estilo | Tailwind CSS v4, configuração CSS-first |
| Base de componentes | shadcn/ui, estilo `base-nova` |
| Primitivos | Base UI e Radix UI |
| Variantes | Class Variance Authority |
| Ícones | Lucide React |
| Animações | Tailwind, `tw-animate-css` e Framer Motion |
| Drag and drop | dnd-kit |
| Datas | date-fns e react-day-picker |

Não existe `tailwind.config.*`. A configuração visual é exposta pelo bloco `@theme inline` em `src/app/globals.css`.

## 4. Arquitetura dos tokens

### 4.1 Camada primitiva

Valores literais como:

- `#172033`;
- `#0f9f8f`;
- `rgba(16, 31, 46, 0.1)`;
- `0.9rem`.

### 4.2 Camada semântica

Variáveis que expressam função:

- `--background`;
- `--foreground`;
- `--primary`;
- `--muted`;
- `--destructive`;
- `--border`;
- `--input`;
- `--ring`.

### 4.3 Camada de componente

O sistema não possui uma camada formal completa de tokens por componente. Ela é representada por:

- classes CVA de `Button`, `Badge` e `Tabs`;
- classes compartilhadas como `CRM_SELECT_CONTENT_CLASS`;
- utilitários como `.glass-card`;
- constantes de superfície como `crmSurfaceCardClass`;
- classes locais de features, como `newLeadModalFieldClass`.

### 4.4 Exposição ao Tailwind

Os tokens CSS são ligados a utilities Tailwind no `@theme inline`. Exemplos:

| Variável CSS | Utility resultante |
|---|---|
| `--primary-dark` | `text-primary-dark`, `bg-primary-dark` |
| `--accent-teal` | `text-accent-teal`, `bg-accent-teal` |
| `--background` | `bg-background` |
| `--border` | `border-border` |
| `--ring` | `ring-ring` |
| `--radius-lg` | `rounded-lg` |

## 5. Cores

### 5.1 Paleta CRM

| Token | Valor | Uso atual |
|---|---:|---|
| `--primary-dark` | `#172033` | Texto principal, navegação ativa, CTAs escuros |
| `--primary-medium` | `#2c3a52` | Gradientes e texto secundário escuro |
| `--primary-light` | `#65758f` | Texto auxiliar |
| `--accent-teal` | `#0f9f8f` | Ações, foco, seleção e destaques |
| `--accent-green` | `#35c68a` | Sucesso e gradiente do Switch |
| `--accent-yellow` | `#fff2c7` | Fundo de destaque amarelo |
| `--accent-yellow-dark` | `#d89d19` | Alertas e favoritos |
| `--accent-pink` | `#ffe2ea` | Destaques rosados |
| `--crm-surface-warm` | `#f8f6ef` | Superfícies quentes |
| `--crm-surface-warm-muted` | `#f4f0e6` | Superfície quente secundária |
| `--crm-border-warm` | `#ded8c8` | Borda quente |
| `--crm-border-warm-strong` | `#d8ded8` | Borda quente forte |

### 5.2 Tokens semânticos claros

| Token | Valor | Função |
|---|---:|---|
| `--background` | `#f8f9fb` | Fundo global |
| `--foreground` | `#172033` | Texto padrão |
| `--card` | `#ffffff` | Cards |
| `--card-foreground` | `#172033` | Texto em cards |
| `--popover` | `#ffffff` | Popovers e dropdowns |
| `--popover-foreground` | `#172033` | Texto em popovers |
| `--primary` | `#172033` | Cor primária semântica |
| `--primary-foreground` | `#ffffff` | Texto sobre primary |
| `--secondary` | `#f1f3f5` | Ações e superfícies secundárias |
| `--secondary-foreground` | `#28364b` | Texto sobre secondary |
| `--muted` | `#f2f4f7` | Fundos discretos |
| `--muted-foreground` | `#65758f` | Texto auxiliar |
| `--accent` | `#0f9f8f` | Acento semântico |
| `--accent-foreground` | `#ffffff` | Texto sobre accent |
| `--destructive` | `#d94862` | Erro e ação destrutiva |
| `--border` | `rgba(16,31,46,.10)` | Borda padrão |
| `--input` | `rgba(16,31,46,.14)` | Borda/fundo de campos |
| `--ring` | `rgba(15,159,143,.42)` | Foco |

### 5.3 Sidebar

| Token | Valor |
|---|---:|
| `--sidebar` | `#f3f5f8` |
| `--sidebar-foreground` | `#172033` |
| `--sidebar-primary` | `#172033` |
| `--sidebar-primary-foreground` | `#ffffff` |
| `--sidebar-accent` | `rgba(15,159,143,.10)` |
| `--sidebar-accent-foreground` | `#17322f` |
| `--sidebar-border` | `rgba(49,70,96,.12)` |
| `--sidebar-ring` | `rgba(15,159,143,.45)` |

### 5.4 Gráficos e tons semânticos

| Token | Valor | Família |
|---|---:|---|
| `--chart-1` | `#0f9f8f` | Teal |
| `--chart-2` | `#2563eb` | Azul |
| `--chart-3` | `#d89d19` | Âmbar |
| `--chart-4` | `#8b5cf6` | Violeta |
| `--chart-5` | `#ef6f6c` | Coral |

KPIs e painéis também usam escalas Tailwind locais como `amber`, `blue`, `rose`, `emerald`, `violet`, `indigo`, `sky` e `slate`.

### 5.5 Gradientes

| Nome | Valor |
|---|---|
| Primary | `linear-gradient(135deg, #17322f 0%, #0f766e 48%, #15b8a6 100%)` |
| Fundo claro | `linear-gradient(135deg, #f8f9fb 0%, #f4f6f8 46%, #fbfaf7 100%)` |
| Switch ativo | `linear-gradient(135deg, var(--accent-teal), var(--accent-green))` |
| Logo BP | `linear-gradient(135deg, #101F2E 0%, #24615b 58%, #C8A96B 100%)` |

Utilities globais:

- `.bg-crm-gradient-primary`;
- `.bg-crm-gradient-dark`.

### 5.6 Cores locais recorrentes

Estes valores estão implementados diretamente em features:

| Valor | Uso |
|---|---|
| `#0b1724` | Hero do lead e header do modal Novo Lead |
| `#101f2e` / `#101F2E` | CTAs, logo e foco local |
| `#dfe5ee` | Bordas de hero, modal e section cards |
| `#e6e9ef` | Sidebar, mobile header e separadores |
| `#e1e5eb` | Inputs e botões locais da sidebar |
| `#fbfbfc` | Header de coluna do kanban |
| `#111827` | Texto local do modal Novo Lead |
| `#6b7280` | Texto auxiliar local |
| `#9ca3af` | Placeholder local |

## 6. Tipografia

### 6.1 Famílias

| Família | Pesos | Uso |
|---|---|---|
| Plus Jakarta Sans | 400, 500, 600, 700, 800 | Fonte global e `font-sans` |
| Geist Mono | padrão da fonte | UUIDs, dados técnicos e `font-mono` |
| Inter | 400, 500, 600 | Somente no escopo `.font-new-lead-modal` |

Fallback global:

```css
var(--font-plus-jakarta), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

O body habilita as features `"cv02"`, `"cv03"` e `"cv04"`.

### 6.2 Escala de destaque

| Classe | Tamanho | Peso | Tracking | Line-height |
|---|---|---:|---:|---:|
| `.heading-xl` | `clamp(2rem, 3vw, 3rem)` | 800 | `-0.045em` | 1.05 |
| `.heading-lg` | `clamp(1.55rem, 2vw, 2.25rem)` | 700 | `-0.035em` | 1.08 |

### 6.3 Escala recorrente

| Papel | Padrão atual |
|---|---|
| Título de página | `text-2xl`, bold, `tracking-tight` |
| Título de card | `text-base`, semibold, `tracking-[-0.02em]` |
| Corpo | `text-sm` |
| Metadado | `text-[13px]` ou `text-xs` |
| Label de campo | `text-xs`, semibold/bold |
| Eyebrow/label de seção | `text-[10px]` ou `text-[11px]`, uppercase, tracking amplo |
| KPI | `text-4xl`, extrabold |

Tracking negativo entre `-0.01em` e `-0.06em` aparece em botões, títulos, KPIs e navegação.

## 7. Raios, bordas e sombras

### 7.1 Raios

Token base: `--radius: 0.9rem`, aproximadamente `14.4px`.

| Token | Fórmula | Aproximação |
|---|---|---:|
| `--radius-sm` | `0.6 × radius` | 8.6px |
| `--radius-md` | `0.8 × radius` | 11.5px |
| `--radius-lg` | `radius` | 14.4px |
| `--radius-xl` | `1.4 × radius` | 20.2px |
| `--radius-2xl` | `1.8 × radius` | 25.9px |
| `--radius-3xl` | `2.2 × radius` | 31.7px |
| `--radius-4xl` | `2.6 × radius` | 37.4px |

Raios locais frequentes:

- `rounded-full`: botões, badges, pills e switches;
- `10px` e `12px`: botões compactos;
- `13px` e `14px`: campos e cards do modal/kanban;
- `16px`: logo e colunas do kanban;
- `18px`: `.glass-card` e section cards;
- `22px` e `28px`: hero, tabs container e headers de página.

### 7.2 Bordas

- padrão: `border-border`;
- campo: `border-input`;
- foco: `border-accent-teal/45` ou `border-ring`;
- erro: `border-destructive`;
- superfícies neutras recentes: `border-zinc-200/90`;
- glass: `rgba(16,31,46,.09)`;
- dialog: `border-white/30`.

### 7.3 Sombras

**Glass card padrão**

```css
box-shadow:
  0 1px 2px rgba(16, 31, 46, 0.035),
  0 14px 34px rgba(16, 31, 46, 0.055);
```

No hover, o card sobe `1px` e recebe sombra mais ampla. A classe `.glass-card-no-float` remove apenas o deslocamento.

Sombras recorrentes:

| Contexto | Sombra |
|---|---|
| Botão primary | `0 14px 30px rgba(15,118,110,.22)` |
| Botão teal | `0 12px 28px rgba(15,159,143,.26)` |
| Botão CTA | `0 14px 32px rgba(23,32,51,.22)` |
| Sidebar | `18px 0 45px rgba(16,31,46,.045)` |
| Nav ativo | `0 10px 26px rgba(16,31,46,.08)` |
| Dialog | `shadow-xl` |
| Select/Popover | `shadow-lg` ou `shadow-xl` |

## 8. Espaçamento, dimensões e responsividade

### 8.1 Breakpoints

São usados os breakpoints padrão do Tailwind:

| Prefixo | Largura mínima |
|---|---:|
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |
| `2xl` | 1536px |

`lg` é o breakpoint estrutural da sidebar.

### 8.2 Shell

| Elemento | Dimensão |
|---|---:|
| Sidebar recolhida | 88px |
| Sidebar expandida | 282px |
| Padding do main | `px-4 py-5`, `sm:px-6`, `lg:py-6` |
| Padding da sidebar | `px-3 py-4` |
| Item de navegação | `px-3 py-2.5` |
| Ícone de navegação | container 32px, ícone 16px |
| Busca da sidebar | altura 36px |

### 8.3 Densidade de componentes

| Componente | Default |
|---|---:|
| Button | 40px |
| Button sm | 32px |
| Button xs | 28px |
| Button lg | 44px |
| Input | 32px |
| Select trigger | 32px |
| Select trigger sm | 28px |
| Novo Lead input | 44px |
| Switch | 44 × 24px |
| Avatar base | 40 × 40px |
| Badge | 20px |

### 8.4 Responsividade recorrente

- headers mudam de coluna para linha em `sm`;
- grids de KPI: `sm:grid-cols-2 lg:grid-cols-4`;
- tabs densas usam scroll horizontal e `min-w-max`;
- tabelas ficam em `overflow-x-auto`;
- kanban usa scroll horizontal e colunas com `min-width` entre 250px e 268px;
- drawer mobile tem `w-[min(88vw,320px)]`;
- footers de dialog são coluna invertida no mobile e linha no `sm`;
- chips do hero do lead rolam horizontalmente no mobile.

## 9. Ícones, movimento e scroll

### 9.1 Ícones

- biblioteca: Lucide React;
- tamanhos comuns: 12px, 14px, 16px, 20px;
- navegação: 16px com `strokeWidth={1.9}`;
- header de página: 20px com `strokeWidth={1.75}`;
- ícones dentro de botões herdam 16px quando nenhuma classe específica é informada.

### 9.2 Movimento

| Interação | Comportamento |
|---|---|
| Button hover | sobe 2px (`-translate-y-0.5`) |
| Button active | desce 1px, exceto trigger com popup |
| Glass card hover | sobe 1px |
| Select/Popover | fade, zoom e slide conforme o lado |
| Dialog | fade, zoom e deslocamento ao centro |
| Drawer mobile | Framer Motion, cerca de 0.2s, ease-out |
| Sidebar hover | debounce de 120ms |
| Skeleton | `animate-pulse` |
| Loading | `Loader2 animate-spin` |

### 9.3 Scrollbar

A classe `.crm-scrollbar` define:

- barra de 10px;
- track `rgba(49,70,96,.08)`;
- thumb em gradiente teal;
- borda branca translúcida;
- raio pill;
- estado hover mais saturado.

## 10. Layout global e navegação

### 10.1 AppShell

Fonte: `src/components/crm/app-shell.tsx`.

- fundo do app: `#f8f9fb`;
- sidebar fixa no desktop;
- sidebar recolhida por padrão;
- preferência persistida em `crm.sidebar.collapsed.v1`;
- ausência da chave significa recolhida;
- ao passar o mouse, a sidebar recolhida pode expandir como overlay;
- o conteúdo usa padding esquerdo de 88px ou 282px no desktop;
- mobile mantém header sticky e drawer sobreposto.

Outras preferências:

- favoritos: `crm.sidebar.favorites.v1`;
- grupos: `crm.sidebar.groups.v2`.

### 10.2 Navegação

Item inativo:

- texto slate;
- borda transparente;
- hover com fundo branco translúcido;
- ícone em slate.

Item ativo:

- fundo branco;
- texto navy;
- borda navy suave;
- sombra discreta;
- ícone branco em container navy.

Labels de seção usam caixa alta, 11px, bold e tracking `0.16em`.

### 10.3 Mobile

- header visível abaixo de `lg`;
- overlay navy com 25% de opacidade;
- drawer em `z-[60]`;
- largura máxima de 320px;
- sidebar desktop não herda o comportamento do drawer.

## 11. Superfícies e famílias visuais

### 11.1 Glass

Classe canônica: `.glass-card`.

Características:

- fundo branco;
- borda muito suave;
- raio 18px;
- sombra difusa;
- hover elevado.

Use `.glass-card-no-float` quando o elemento não deve deslocar, como kanban e KPIs.

### 11.2 Superfície neutra zinc

Fonte: `src/components/crm/crm-surface-header.tsx`.

| Export | Visual |
|---|---|
| `crmSurfaceCardClass` | `rounded-xl`, borda zinc, fundo branco, sombra pequena |
| `crmSurfaceHeaderClass` | header plano, branco, borda inferior zinc |
| `CrmSurfaceHeaderIcon` | 32px, fundo zinc-50, borda zinc |
| `crmSurfaceHeaderTitleClass` | 15px, semibold |
| `crmSurfaceHeaderSubtitleClass` | 13px, zinc-500 |
| `crmSurfaceSegmentedRootClass` | controle segmentado zinc |
| `crmSurfaceMetaClass` | 13px, números tabulares, zinc-500 |

Essa família é usada principalmente no shell e toolbar do kanban.

### 11.3 Hero escuro

Usado no detalhe do lead e no modal Novo Lead:

- fundo base `#0b1724`;
- texto branco;
- overlays navy/teal;
- bordas `#dfe5ee` no container externo;
- botões translúcidos ou brancos;
- raio entre 22px e 28px.

## 12. Botões

Fonte: `src/components/ui/button.tsx`.

### 12.1 Base

- formato pill;
- `text-sm`;
- `font-semibold`;
- tracking `-0.01em`;
- transição de 200ms;
- foco com borda e ring teal;
- disabled com 50% de opacidade e sem eventos;
- `aria-invalid` ativa estilo destructive.

### 12.2 Variantes

| Variante | Aparência e uso |
|---|---|
| `default` | Gradiente teal e sombra; igual a `primary` |
| `primary` | Ação principal em gradiente teal |
| `cta` | Gradiente navy e padding horizontal ampliado |
| `hero` | Fundo branco para superfícies escuras |
| `teal` | Fundo teal sólido |
| `outline` | Fundo branco translúcido, borda e hover teal |
| `secondary` | Fundo secondary com borda suave |
| `ghost` | Fundo branco muito translúcido e borda discreta |
| `destructive` | Fundo destructive a 10% e texto destructive |
| `link` | Texto sublinhado no hover |

### 12.3 Tamanhos

| Size | Dimensão |
|---|---|
| `default` | `h-10`, `px-6` |
| `xs` | `h-7`, `px-2`, texto xs |
| `sm` | `h-8`, `px-3`, texto 0.8rem |
| `lg` | `h-11`, `px-7` |
| `icon` | 32px |
| `icon-xs` | 24px |
| `icon-sm` | 28px |
| `icon-lg` | 36px |

### 12.4 Loading

O componente não possui prop `loading`. O padrão atual é:

- desabilitar o botão;
- renderizar `Loader2` com `animate-spin`;
- trocar ou preservar o label conforme o contexto.

## 13. Campos de formulário

### 13.1 Input

Fonte: `src/components/ui/input.tsx`.

- altura 32px;
- raio xl;
- fundo branco a 70%;
- borda `input`;
- sombra interna muito suave;
- texto base no mobile e `text-sm` a partir de `md`;
- focus com fundo branco, borda teal e ring de 3px;
- disabled com fundo `input/50`, opacidade 50% e cursor bloqueado;
- erro via `aria-invalid`.

### 13.2 Textarea

Fonte: `src/components/ui/textarea.tsx`.

- altura mínima 64px;
- conteúdo pode ajustar a altura;
- raio lg;
- padding horizontal 10px e vertical 8px;
- mesmos estados de foco, disabled e erro do Input.

### 13.3 Label

Labels de formulário usam normalmente:

- `text-xs`;
- semibold ou bold;
- `text-primary-dark` ou `text-muted-foreground`;
- uppercase e tracking amplo em formulários mais editoriais.

### 13.4 Formulário dinâmico

Fonte: `src/components/crm/dynamic-form.tsx`.

Tipos suportados:

- text;
- email;
- phone;
- url;
- number;
- percent;
- date;
- date_br;
- time;
- user;
- select;
- multiselect;
- textarea.

Validação:

- `aria-invalid` no controle;
- mensagem abaixo do campo;
- cor destructive;
- selects com wrappers CRM.

### 13.5 Campos do modal Novo Lead

O modal possui uma escala local:

- altura 44px;
- raio aproximado de 13px;
- borda `#dfe5ee`;
- foco escuro;
- fonte Inter;
- section cards com raio 18px.

## 14. Selects, dropdowns e pickers

Não há um componente `DropdownMenu` no projeto. As opções atuais são:

1. Select Base UI;
2. wrapper `CrmSelect`;
3. Popover Radix;
4. picker customizado com busca e portal.

### 14.1 Select base

Fonte: `src/components/ui/select.tsx`.

**Trigger**

- altura 32px ou 28px em `size="sm"`;
- largura pelo conteúdo;
- raio lg;
- borda `input`;
- placeholder muted;
- focus ring de 3px;
- disabled com opacidade 50%;
- chevron à direita.

**Content**

| Propriedade | Default |
|---|---|
| `side` | `bottom` |
| `align` | `center` |
| `sideOffset` | 4 |
| `alignOffset` | 0 |
| `alignItemWithTrigger` | `false` |
| `portalled` | `true` |

O painel:

- acompanha a largura do trigger;
- tem mínimo de 12rem;
- usa fundo `popover`;
- tem raio xl, padding 6px e sombra;
- possui scroll vertical;
- é renderizado em portal por padrão.

**Item**

- `text-sm`;
- raio lg;
- padding vertical 8px;
- highlight em `emerald-50`;
- check à direita;
- item disabled sem interação e com 50% de opacidade.

### 14.2 CrmSelect

Fonte: `src/components/crm/crm-select.tsx`.

É o padrão preferencial para filtros e formulários do CRM.

**CrmSelectContent**

- força `side="bottom"`;
- força `align="start"`;
- usa `sideOffset={6}`;
- mínimo entre a largura do trigger e 16rem;
- máximo de 28rem ou viewport menos 2rem;
- altura máxima 18rem;
- `z-[400]` fora de modal.

**CrmSelectItem**

- padding vertical 10px;
- padding horizontal mais confortável;
- texto em uma linha.

**CrmSelectValue**

- recebe mapa `labels`;
- usa `"Selecione…"` como placeholder;
- nunca deve expor valores internos como `all`, `todos`, `__empty__`, UUIDs ou códigos quando existe label de negócio.

### 14.3 Select dentro de Dialog

Este é um contrato obrigatório.

```tsx
<Dialog modal={false}>
  <DialogContent
    onPointerDownOutside={(event) => {
      if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
    }}
    onFocusOutside={(event) => {
      if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
    }}
  >
    <Select modal={false}>
      <SelectTrigger>{/* ... */}</SelectTrigger>
      <CrmSelectContent inModal>
        {/* itens */}
      </CrmSelectContent>
    </Select>
  </DialogContent>
</Dialog>
```

Também pode ser usado:

```tsx
<DialogContent {...dialogSelectOutsideHandlers()}>
```

Regras:

- `Dialog` usa `modal={false}`;
- cada `Select` dentro do dialog usa `modal={false}`;
- o `DialogContent` protege interações no portal do Base UI Select;
- reutilizar `isInteractionFromBaseUiSelectLayer`;
- não substituir o helper por `target.closest(...)`;
- posicionar abaixo e alinhado ao início;
- usar `inModal` quando o dropdown puder ser cortado por overflow.

### 14.4 Popover

Fonte: `src/components/ui/popover.tsx`.

Uso:

- filtros ricos;
- filtros com descrição;
- calendário;
- horário;
- menu da conta;
- notificações;
- inserção de placeholders.

Padrão:

- portal Radix;
- `z-[400]`;
- raio xl;
- sombra forte;
- animação por lado;
- conteúdo controla seu próprio padding;
- em formulários, costuma usar `side="bottom"` e `align="start"`.

Filtros com muitas opções ou explicações, como situação de prazo na DUE, preferem Popover a Select.

### 14.5 SearchablePicker

Fonte: `src/components/crm/new-lead-modal/searchable-picker.tsx`.

Uso:

- pesquisa de opções;
- escolha de utilizador;
- escolha de cliente;
- listas com avatar e metadados.

É um listbox customizado, renderizado em portal, usado no subsistema do Novo Lead.

## 15. Modais e confirmações

### 15.1 Dialog padrão

Fonte: `src/components/ui/dialog.tsx`.

**Overlay**

- tela inteira;
- preto a 50%;
- blur pequeno;
- `z-[100]`;
- fade na entrada e saída.

**Content**

- centralizado;
- largura total até `max-w-lg`;
- fundo branco a 90%;
- backdrop blur xl;
- borda branca a 30%;
- padding 24px;
- sombra xl;
- raio 2xl a partir de `sm`;
- animação combinando fade, zoom e slide.

**Estrutura**

- `DialogHeader`: centralizado no mobile e alinhado à esquerda no `sm`;
- `DialogTitle`: 18px, semibold, navy;
- `DialogDescription`: 14px, muted;
- `DialogFooter`: ações empilhadas em ordem invertida no mobile; linha à direita em `sm`;
- botão X no canto superior direito, salvo `hideCloseButton`.

O backdrop é montado mesmo com `modal={false}`, preservando escurecimento e fechamento por clique externo.

### 15.2 Dialog com Select

Aplicar integralmente o padrão da seção [14.3](#143-select-dentro-de-dialog). Sem os handlers, um clique no dropdown portalled pode ser interpretado como clique fora e fechar o modal.

### 15.3 Dialog aninhado

Quando um dialog abre sobre outro:

- pai: `z-[100]`;
- overlay filho: `overlayClassName="z-[120]"`;
- conteúdo filho: `className="z-[130]"`.

### 15.4 AlertDialog

Fonte: `src/components/ui/alert-dialog.tsx`.

Uso:

- exclusão;
- descarte;
- confirmação destrutiva;
- ações irreversíveis.

Padrão de ações:

- cancelar com botão `outline`;
- confirmar com botão padrão ou `destructive`, conforme o risco;
- não usar para formulários com Select.

### 15.5 Modal Novo Lead

É uma exceção arquitetural: não usa `Dialog`.

- portal próprio;
- camada base `z-[70]`;
- backdrop `rgba(7,12,20,.72)`;
- blur médio;
- largura até `min(100vw - 1.5rem, 1280px)`;
- header escuro;
- fonte Inter;
- campos de 44px;
- section cards;
- footer sticky;
- fluxo multi-step.

Componentes em `src/components/crm/new-lead-modal/`.

### 15.6 Checklist funcional de modal

Todo modal deve:

- abrir sem fechar imediatamente;
- manter foco e navegação por teclado;
- fechar pelo X, cancelamento e ação prevista;
- não fechar ao selecionar item de Select;
- exibir dropdown abaixo do campo;
- manter dropdown acima do overlay;
- apresentar ações acessíveis no mobile;
- bloquear ações duplicadas durante loading.

## 16. Cards, painéis e headers

### 16.1 Card base

Fonte: `src/components/ui/card.tsx`.

Estrutura:

- `Card`;
- `CardHeader`;
- `CardTitle`;
- `CardDescription`;
- `CardAction`;
- `CardContent`;
- `CardFooter`.

Tamanhos:

| Size | Gap | Padding vertical | Padding horizontal |
|---|---:|---:|---:|
| `default` | 16px | 16px | 16px |
| `sm` | 12px | 12px | 12px |

O Card usa `.glass-card`. O footer adiciona borda superior e fundo branco translúcido.

### 16.2 CrmPageHeader

Fonte: `src/components/crm/crm-page-header.tsx`.

- raio 28px;
- borda branca;
- fundo branco a 70%;
- sombra navy suave;
- ícone em container branco com borda zinc;
- título zinc-900;
- descrição zinc-600;
- badges neutros;
- stats em cards zinc com números tabulares;
- actions à direita a partir de `sm`.

Grid de stats:

- 1: uma coluna;
- 2: duas colunas;
- 3: duas colunas, três em `sm`;
- 4: duas colunas, quatro em `lg`;
- 5+: duas, três em `sm`, cinco em `lg`.

### 16.3 KanbanPanelShell

Painéis de etapa usam tons locais:

- violet;
- indigo;
- sky;
- amber;
- emerald;
- slate.

Os painéis DUE canônicos estão em `src/components/crm/pipeline-stage-panels.tsx`. Não reintroduzir blocos `<details>` ad hoc nos cards.

## 17. Tabs, badges, switches e progressos

### 17.1 Tabs

Fonte: `src/components/ui/tabs.tsx`.

Orientações:

- horizontal, padrão;
- vertical.

Variantes:

| Variante | Aparência |
|---|---|
| `default` | Container muted e trigger ativo branco com sombra |
| `line` | Fundo transparente e indicador linear |

Estados:

- inativo em `foreground/60`;
- hover em foreground;
- ativo em foreground;
- focus com ring de 3px;
- disabled com 50% de opacidade.

O detalhe do lead aplica estilos locais e scroll horizontal.

### 17.2 Badge

Fonte: `src/components/ui/badge.tsx`.

- altura 20px;
- raio `rounded-4xl`;
- texto xs semibold;
- ícones de 12px;
- variantes `default`, `secondary`, `destructive`, `outline`, `ghost` e `link`.

Badges de negócio podem usar cores locais por tipo ou estado.

### 17.3 Switch

Fonte: `src/components/ui/switch.tsx`.

- track 44 × 24px;
- thumb 20px;
- unchecked em slate-200;
- checked em gradiente teal/green;
- focus ring teal;
- disabled com 50% de opacidade.

No kanban, controla a visibilidade de leads RD Station. O default é desligado e a preferência é persistida em `crm.kanban.prefs.v1`.

### 17.4 Progress

Fonte: `src/components/ui/progress.tsx`.

- trilho com 8px de altura, fundo branco e raio pill;
- indicador com o gradiente primary do CRM;
- transição de 500ms;
- o preenchimento é controlado por `transform: translateX(...)`;
- aceita `indicatorClassName` para variações locais.

Barras específicas, como a do funil no hero do lead, podem aplicar cores e composição próprias.

## 18. Utilizadores, avatares e identidade

### 18.1 Regra principal

Sempre que a UI mostrar o nome de um utilizador do CRM, usar `CrmUserLabel`.

Não renderizar apenas:

```tsx
<span>{fullName}</span>
```

Fonte: `src/components/crm/crm-user-label.tsx`.

### 18.2 CrmUserLabel

| Prop | Valores |
|---|---|
| `size` | `xs`, `sm`, `md` |
| `variant` | `inline`, `stacked` |
| `name` | nome ou e-mail resolvido |
| `avatarUrl` | URL opcional |
| `prefix` | exemplo: “Aberto por” |
| `sublabel` | texto secundário |

Tamanhos:

| Size | Avatar | Nome |
|---|---:|---|
| `xs` | 20px | 11px |
| `sm` | 28px | 12px |
| `md` | 32px | 14px |

O fallback gera iniciais, inclusive quando o identificador disponível é e-mail.

### 18.3 Dados

Ao consultar pessoas:

- buscar `avatar_url` junto com `full_name`;
- para solicitante interno, resolver o avatar por e-mail;
- manter razão social/empresa sem avatar de utilizador;
- sistema e automações RD também podem ficar sem avatar.

### 18.4 Avatar base

Fonte: `src/components/ui/avatar.tsx`.

- default 40px;
- forma circular;
- fallback navy translúcido;
- suporta status `online`, `busy`, `away` e `offline`.

## 19. Tabelas, listas e tooltips

### 19.1 Table

Fonte: `src/components/ui/table.tsx`.

- wrapper com scroll horizontal;
- head com altura 40px e peso medium;
- célula com padding 8px;
- texto sem quebra por padrão;
- row hover em `muted/50`;
- row selecionada por `data-state`;
- footer em `muted/50`.

Não existe variante formal de densidade. Ajustes são feitos por `className`.

### 19.2 Listas e grids

- dashboard usa listas em cards;
- admin de utilizadores usa grid de cards;
- clientes usa tabela;
- kanban usa colunas e cards;
- listas vazias variam entre texto, row única e caixa tracejada.

### 19.3 Tooltip

Fonte: `src/components/ui/tooltip.tsx`.

- portal em `z-[100]`;
- offset 8px;
- collision padding 12px;
- largura máxima 300px;
- altura máxima 72vh;
- scroll interno quando necessário;
- fundo branco, borda slate e sombra forte;
- exige `TooltipProvider`.

A sidebar pode sobrescrever o visual para fundo navy e texto branco.

## 20. Datas, horas e calendário

### 20.1 CalendarBr

Fonte: `src/components/ui/calendar-br.tsx`.

- react-day-picker;
- locale pt-BR;
- integrado a Popover;
- segue tokens de foco e seleção do CRM.

### 20.2 DateInputBr

Fonte: `src/components/ui/date-input-br.tsx`.

- valor de dados: `yyyy-mm-dd`;
- exibição: `dd/mm/aaaa`;
- trigger outline com 32px;
- suporta `minYmd`, `maxYmd`, `disabled`, `aria-invalid` e `aria-describedby`;
- usa input hidden para forms.

### 20.3 TimeInputBr

Fonte: `src/components/ui/time-input-br.tsx`.

- valor de dados: `HH:mm`;
- exibição: exemplo `09h30`;
- usa Popover com `input type="time"`;
- pode exibir sugestões;
- suporta os mesmos estados acessíveis do campo de data.

## 21. Estados de loading, vazio, erro e sucesso

### 21.1 Loading

Padrões:

- `Skeleton` com pulse, raio md e navy a 8%;
- `Loader2 animate-spin` em botões;
- botão disabled durante operação;
- conteúdo mantém dimensões para evitar layout shift.

Kanban:

- não monta `PipelineBoard` vazio no fetch inicial;
- usa `PipelineBoardSkeleton` com as colunas do tab ativo;
- refresh silencioso mantém o board visível;
- spinner aparece durante `silentRefreshing`.

### 21.2 Empty state

Variações existentes:

1. texto simples em `text-sm text-muted-foreground`;
2. célula de tabela centralizada;
3. caixa tracejada, branca e centralizada;
4. empty state local com ícone e ação.

O texto deve explicar a ausência de dados; uma ação é adicionada quando há resolução imediata.

### 21.3 Erro

Padrões:

- `Alert variant="destructive"` em erros server-side;
- caixa inline destructive em forms;
- mensagem abaixo de campo com `aria-invalid`;
- estado fatal do kanban com botão “Tentar de novo”;
- banner no header quando há erro, mas os dados anteriores continuam válidos.

### 21.4 Sucesso e informação

Não existe biblioteca global de toast.

O feedback é contextual:

- sucesso em emerald;
- erro em destructive/rose;
- badge “Não salvo” ou mensagem de alterações pendentes;
- indicador “Atualizado agora” no kanban;
- loading no botão que iniciou a ação.

## 22. Padrões por área do sistema

### 22.1 Login

Arquivos:

- `src/app/login/page.tsx`;
- `src/components/auth/login-form.tsx`.

Visual:

- fundo em gradiente claro;
- blobs teal, azul e âmbar com blur;
- grid com formulário de 430px no desktop;
- card glass sem hover;
- labels uppercase;
- inputs de 48px com ícones;
- botão principal full-width de 48px;
- erros inline.

### 22.2 Dashboard

Estrutura:

1. `CrmPageHeader`;
2. KPIs em grid;
3. card de distribuição por etapa;
4. fila de aprovação.

KPIs usam teal, amber, blue e rose. Valores são grandes, extrabold e tabulares quando aplicável.

### 22.3 Kanban de leads

Arquivos centrais:

- `src/app/(crm)/crm/leads/page.tsx`;
- `src/components/crm/pipeline-board.tsx`;
- `src/components/crm/leads-pipeline-toolbar.tsx`;
- `src/components/crm/pipeline-lead-card-content.tsx`.

Padrões:

- toolbar em superfície zinc;
- busca com sugestões;
- filtros com CrmSelect;
- controle segmentado Vendas/Pós-venda;
- Switch para RD Station, desligado por padrão;
- board horizontal;
- colunas glass sem elevação;
- cards com raio 14px;
- DnD;
- skeleton estrutural;
- erro com retry;
- indicador de refresh.

### 22.4 Detalhe do lead

Arquivos:

- `src/app/(crm)/crm/leads/[id]/page.tsx`;
- `src/app/(crm)/crm/leads/[id]/lead-detail-view.tsx`.

Padrões:

- hero escuro;
- badges de contexto;
- metadados em chips;
- progresso do funil;
- tabs em container branco com raio 22px;
- scroll horizontal das tabs no mobile;
- painéis contextuais de DUE, proposta, contrato, faturamento, notas, assinatura e histórico.

### 22.5 Due diligence

- filtros descritivos podem usar Popover;
- pessoas usam `CrmUserLabel`;
- painéis do kanban devem reutilizar componentes unificados;
- estados de prazo usam cores semânticas locais.

### 22.6 Admin

- `CrmPageHeader` é o header predominante;
- campos usam Tabs e `FieldConfigPanel`;
- utilizadores usam grid de cards e dialogs CRUD;
- integrações usam tabs;
- erros server-side usam Alert destructive;
- dialogs com Select seguem o contrato Base UI + Radix.

### 22.7 Clientes

- card com tabela;
- scroll horizontal;
- row hover;
- empty state em célula central;
- erros podem aparecer inline em destructive.

### 22.8 Contratos e propostas

- tabs `line` em hubs e detalhes;
- builders multi-step;
- dialogs aninhados usam camadas 120/130;
- feedback de salvamento é inline;
- estados vazios podem usar caixas tracejadas.

## 23. Acessibilidade e conteúdo

### 23.1 Foco

- foco visível usa ring de 3px;
- a cor padrão é teal translúcido;
- ações destructive usam ring destructive;
- não remover outline sem fornecer estado equivalente.

### 23.2 Semântica

- usar `aria-invalid` em campos inválidos;
- conectar mensagens por `aria-describedby`;
- botões apenas com ícone precisam de `aria-label`;
- decorativos usam `aria-hidden`;
- dialogs devem ter título e, quando aplicável, descrição;
- loading estrutural usa `aria-busy`.

### 23.3 Teclado e portais

- Base UI Select e Radix Dialog usam portais diferentes;
- o helper compartilhado preserva foco e clique;
- dropdown não pode fechar o dialog indevidamente;
- tabs, selects, popovers e dialogs devem continuar navegáveis por teclado.

### 23.4 Idioma e formatos

- documento HTML: `lang="pt-BR"`;
- datas visuais: `dd/mm/aaaa`;
- horário visual: `09h30`;
- labels de negócio em português;
- valores internos nunca devem aparecer no trigger de Select.

## 24. Camadas e z-index

| Camada | Uso |
|---:|---|
| 40 | Sidebar desktop e mobile header |
| 50 | Overlay mobile e expansão de sidebar |
| 60 | Drawer mobile |
| 70 | Modal Novo Lead |
| 100 | Dialog, AlertDialog, Tooltip, picker e Select em modal |
| 120 | Overlay de dialog aninhado |
| 130 | Conteúdo de dialog aninhado |
| 200 | Positioner do Base UI Select |
| 400 | Popup de Select, Popover e wrapper Radix Popper |

O `globals.css` força `[data-radix-popper-content-wrapper]` para `z-index: 400`.

## 25. Dark mode

Há tokens `.dark` e variantes `dark:` nos componentes, mas o tema escuro não está ativo:

- o `<html>` não recebe classe `dark`;
- não há ThemeProvider;
- não há toggle de tema;
- as telas atuais devem ser avaliadas em light mode.

Os tokens dark são preparação técnica herdada da base shadcn, não uma experiência validada do produto.

## 26. Inconsistências conhecidas

Estas divergências existem no código atual:

1. glass/teal e superfícies zinc convivem na mesma aplicação;
2. o modal Novo Lead possui fonte, campos, portal e z-index próprios;
3. hero escuro aparece apenas em áreas ligadas ao lead;
4. há cores hardcoded além dos tokens globais;
5. raios de 13px, 14px, 16px, 18px, 22px e 28px coexistem;
6. feedback varia entre Alert, banner, texto inline e indicador local;
7. não há toast global;
8. tabs do detalhe do lead sobrescrevem o componente base;
9. algumas áreas usam zinc e outras usam `primary-dark`/`muted`;
10. parte dos badges usa variantes locais em vez do componente global;
11. tabelas são menos frequentes que cards e listas customizadas;
12. o dark mode está definido, mas não operacional.

Ao manter a UI, trate essas divergências como estado atual. Uma consolidação deve ser feita como iniciativa separada, não misturada a correções locais.

## 27. Checklist de implementação

### Fundação

- [ ] Usar tokens semânticos quando já existirem.
- [ ] Manter Plus Jakarta Sans como fonte global.
- [ ] Respeitar navy + teal como eixo principal.
- [ ] Não ativar dark mode parcialmente.
- [ ] Manter a sidebar recolhida por padrão.

### Formulários

- [ ] Usar `Input`, `Textarea` e componentes compartilhados.
- [ ] Expor erro com `aria-invalid`.
- [ ] Associar ajuda/erro com `aria-describedby`.
- [ ] Desabilitar ação durante loading.
- [ ] Não expor códigos internos.

### Select e dropdown

- [ ] Preferir `CrmSelectContent`, `CrmSelectValue` e `CrmSelectItem`.
- [ ] Usar mapa de labels.
- [ ] Posicionar abaixo e alinhado ao início.
- [ ] Em Dialog, usar `modal={false}` no Dialog e no Select.
- [ ] Aplicar `isInteractionFromBaseUiSelectLayer` ou `dialogSelectOutsideHandlers`.
- [ ] Usar Popover para lista rica ou descritiva.

### Modal

- [ ] Validar abertura e fechamento.
- [ ] Validar interação com Select.
- [ ] Validar ordem das ações no mobile.
- [ ] Usar AlertDialog para confirmação destrutiva.
- [ ] Ajustar z-index para dialog aninhado.
- [ ] Preservar foco visível e navegação por teclado.

### Utilizadores

- [ ] Usar `CrmUserLabel`.
- [ ] Consultar `avatar_url` com `full_name`.
- [ ] Escolher `inline` para linhas compactas.
- [ ] Escolher `stacked` para cards e células.
- [ ] Não aplicar avatar de pessoa a empresa, sistema ou automação.

### Kanban

- [ ] Exibir skeleton no loading inicial.
- [ ] Manter RD Station oculto por padrão.
- [ ] Exibir erro fatal com retry.
- [ ] Manter dados existentes em erro parcial.
- [ ] Exibir indicador de refresh silencioso.
- [ ] Reutilizar os painéis DUE unificados.

### Responsividade

- [ ] Testar abaixo e acima de `sm`, `md` e `lg`.
- [ ] Garantir scroll horizontal em tabs, tabelas e kanban.
- [ ] Manter drawer mobile separado da sidebar desktop.
- [ ] Evitar conteúdo encoberto pelos 88px/282px do shell.

## 28. Fontes de verdade no código

### Fundação

| Tema | Arquivo |
|---|---|
| Tokens, utilities e scrollbar | `src/app/globals.css` |
| Fontes e metadata | `src/app/layout.tsx` |
| Configuração shadcn | `components.json` |
| Dependências | `package.json` |

### Layout e superfícies

| Tema | Arquivo |
|---|---|
| Shell e sidebar | `src/components/crm/app-shell.tsx` |
| Header de página | `src/components/crm/crm-page-header.tsx` |
| Superfície zinc | `src/components/crm/crm-surface-header.tsx` |

### Primitivos de UI

| Componente | Arquivo |
|---|---|
| AlertDialog | `src/components/ui/alert-dialog.tsx` |
| Alert | `src/components/ui/alert.tsx` |
| Avatar | `src/components/ui/avatar.tsx` |
| Badge | `src/components/ui/badge.tsx` |
| Button | `src/components/ui/button.tsx` |
| CalendarBr | `src/components/ui/calendar-br.tsx` |
| Card | `src/components/ui/card.tsx` |
| DateInputBr | `src/components/ui/date-input-br.tsx` |
| Dialog | `src/components/ui/dialog.tsx` |
| Input | `src/components/ui/input.tsx` |
| Label | `src/components/ui/label.tsx` |
| Popover | `src/components/ui/popover.tsx` |
| Progress | `src/components/ui/progress.tsx` |
| Select | `src/components/ui/select.tsx` |
| Skeleton | `src/components/ui/skeleton.tsx` |
| Switch | `src/components/ui/switch.tsx` |
| Table | `src/components/ui/table.tsx` |
| Tabs | `src/components/ui/tabs.tsx` |
| Textarea | `src/components/ui/textarea.tsx` |
| TimeInputBr | `src/components/ui/time-input-br.tsx` |
| Tooltip | `src/components/ui/tooltip.tsx` |

### Componentes CRM canônicos

| Tema | Arquivo |
|---|---|
| Select CRM | `src/components/crm/crm-select.tsx` |
| Proteção Dialog + Select | `src/lib/ui/base-ui-select-dialog.ts` |
| Nome + avatar | `src/components/crm/crm-user-label.tsx` |
| Linha de utilizador | `src/components/crm/crm-app-user-row.tsx` |
| Formulário dinâmico | `src/components/crm/dynamic-form.tsx` |
| Modal Novo Lead | `src/components/crm/new-lead-modal/` |
| Skeleton do pipeline | `src/components/crm/pipeline-board-skeleton.tsx` |
| Estados do kanban | `src/components/crm/pipeline-kanban-status.tsx` |
| Painéis das etapas | `src/components/crm/pipeline-stage-panels.tsx` |

---

## Regra de precedência

Quando houver conflito entre este documento e o código:

1. o componente compartilhado implementado é a fonte operacional;
2. as regras do workspace definem os contratos obrigatórios;
3. este documento deve ser atualizado para refletir a decisão consolidada.

