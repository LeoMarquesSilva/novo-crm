# Cheat-sheet de Tokens — Design System V2 (Corporate Clean SaaS)

> Referência rápida dos valores exatos. Para regras de uso, contexto e exceções, consultar `DESIGN_SYSTEM_V2_CRM_BP.md` (fonte da verdade) — este arquivo só existe para evitar reler o documento inteiro a cada tarefa visual pontual.

## Cores — neutros

| Token | Valor |
|---|---:|
| `neutral-0` | `#FFFFFF` |
| `neutral-25` | `#FCFCFD` |
| `neutral-50` | `#F7F8FA` |
| `neutral-100` | `#F3F5F7` |
| `neutral-150` | `#EEF1F4` |
| `neutral-200` | `#E4E7EC` |
| `neutral-300` | `#D0D5DD` |
| `neutral-400` | `#98A2B3` |
| `neutral-500` | `#667085` |
| `neutral-600` | `#475467` |
| `neutral-700` | `#344054` |
| `neutral-800` | `#182230` |
| `neutral-900` | `#101828` |

## Cores — marca e interação

| Token | Valor |
|---|---:|
| `brand-navy` | `#16263B` |
| `brand-navy-hover` | `#0F1D2D` |
| `interactive-50` | `#EFF6FF` |
| `interactive-100` | `#DBEAFE` |
| `interactive-300` | `#93C5FD` |
| `interactive-500` | `#3B82F6` |
| `interactive-600` (primary) | `#2563EB` |
| `interactive-700` (hover) | `#1D4ED8` |
| `interactive-800` (active) | `#1E40AF` |

## Cores — estados semânticos (texto / fundo / borda)

| Estado | Texto | Fundo | Borda |
|---|---:|---:|---:|
| Success | `#067647` | `#ECFDF3` | `#ABEFC6` |
| Warning | `#B54708` | `#FFFAEB` | `#FEDF89` |
| Danger | `#B42318` | `#FEF3F2` | `#FECDCA` |
| Info | `#175CD3` | `#EFF8FF` | `#B2DDFF` |
| Violet | `#6941C6` | `#F9F5FF` | `#D9D6FE` |

## Cores — gráficos (paleta categórica, ordem de importância)

`#2563EB` → `#16875D` → `#C17A0A` → `#7F56D9` → `#D92D48` → `#0284C7`

## Tipografia

- Interface: **Plus Jakarta Sans** (remover Inter completamente do escopo)
- Conteúdo técnico: **Geist Mono**

| Token | Tamanho/linha | Peso | Uso |
|---|---:|---:|---|
| `display-sm` | 30/38px | 700 | KPI principal |
| `heading-xl` | 24/32px | 700 | título de página |
| `heading-lg` | 20/28px | 700 | título de painel |
| `heading-md` | 16/24px | 600 | título de seção/card |
| `body-md` | 14/22px | 400 | corpo padrão |
| `body-md-medium` | 14/22px | 500 | conteúdo enfatizado |
| `body-sm` | 13/20px | 400 | metadado/tabela compacta |
| `body-sm-medium` | 13/20px | 500 | label compacto |
| `caption` | 12/18px | 400 | ajuda/terciário |
| `caption-medium` | 12/18px | 600 | badge/eyebrow |

Números (tabelas, métricas, moeda, data) sempre com `font-variant-numeric: tabular-nums`.

## Espaçamento

| Token | Valor |
|---|---:|
| `space-0` | 0 |
| `space-0-5` | 2px |
| `space-1` | 4px |
| `space-1-5` | 6px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-12` | 48px |
| `space-16` | 64px |

## Raios

| Token | Valor | Uso |
|---|---:|---|
| `radius-sm` | 6px | elementos pequenos |
| `radius-md` | 8px | inputs, filtros, tabs, itens |
| `radius-lg` | 10px | botões e controles |
| `radius-xl` | 12px | cards, painéis, dropdowns |
| `radius-2xl` | 16px | dialogs, drawers |
| `radius-full` | 999px | avatar, badge, status, chip |

**Proibido:** 13px, 14px, 18px, 22px, 28px.

## Sombras

```css
--shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.05);
--shadow-sm: 0 2px 8px rgba(16, 24, 40, 0.08);
--shadow-md: 0 8px 24px rgba(16, 24, 40, 0.12);
--shadow-lg: 0 20px 48px rgba(16, 24, 40, 0.18);
```

Card comum e toolbar: **sem sombra**. Dropdown/Select: `shadow-sm`. Popover/Tooltip: `shadow-md`. Dialog/Drawer: `shadow-lg`.

## Movimento

| Token | Valor | Uso |
|---|---:|---|
| `motion-fast` | 120ms | hover, focus, cor |
| `motion-default` | 180ms | dropdown, popover, tabs |
| `motion-slow` | 240ms | dialog, drawer |

Easing: `cubic-bezier(0.2, 0, 0, 1)`. Botões e cards não sobem no hover.

## Z-index

| Token | Valor |
|---|---:|
| `z-base` | 0 |
| `z-sticky` | 20 |
| `z-navigation` | 40 |
| `z-navigation-overlay` | 50 |
| `z-drawer` | 60 |
| `z-floating` | 70 |
| `z-dialog-overlay` | 80 |
| `z-dialog` | 90 |
| `z-dialog-floating` | 100 |
| `z-nested-dialog` | 110 |
| `z-tooltip` | 120 |
| `z-drag-overlay` | 130 |

## Densidade

| Contexto | Altura | Tipografia |
|---|---:|---:|
| Compacto (tabela, ação pequena) | 32px | 13px |
| Toolbar/filtro | 36px | 13-14px |
| Formulário/default (input, select) | 40px | 14px |
| Ação confortável excepcional | 44px | 14px |

## Sidebar

Recolhida: **72px**. Expandida: **248px**. Busca da sidebar: 36px de altura.

## Iconografia

Lucide React. Tamanhos: 12/14/16/20/24px. Ícone de botão: 16px. Ícone de página: 20px. `strokeWidth`: 1.75 ou 2 (não misturar no mesmo contexto).
