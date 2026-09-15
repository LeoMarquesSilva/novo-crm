# CRM BP — Design System V2

> **Direção:** Corporate Clean SaaS  
> **Status:** especificação mestre para migração visual  
> **Data:** 14 de setembro de 2026  
> **Escopo:** CRM BP em Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, Base UI e Radix UI

---

## Navegação rápida

- [Objetivo, diagnóstico e princípios](#1-objetivo)
- [Tokens e fundação visual](#7-tokens-de-cor)
- [Layout, superfícies e componentes](#14-layout-global)
- [Feedback, overlays e acessibilidade](#23-feedback-e-estados)
- [Padrões por área do CRM](#29-padrões-por-área)
- [Mapeamento do legado](#31-mapeamento-do-legado-para-v2)
- [Estratégia de implementação](#33-estratégia-de-implementação)
- [Validação e checklist](#36-validação-e-critérios-de-aceite)
- [Prompt mestre para o Codex](#prompt-mestre-para-usar-no-codex)
- [Prompt curto para retomadas](#39-prompt-curto-para-retomadas-futuras)

---

## 1. Objetivo

Este documento define a nova linguagem visual e os contratos de interface do CRM BP. Ele substitui o design atual como referência para novas telas e orienta a migração das telas existentes.

O objetivo é transformar a aplicação em um produto:

- corporativo, moderno e limpo;
- consistente entre módulos;
- rápido de compreender em uso recorrente;
- denso o suficiente para uma operação de CRM;
- sóbrio, sem aparência de ERP antigo;
- refinado, sem aparência de template genérico de dashboard;
- acessível e previsível em desktop e mobile.

A percepção desejada é:

> **Software corporativo muito bem construído.**

O usuário deve entender rapidamente onde está, o que é clicável, qual informação é prioritária e qual é a próxima ação possível.

---

## 2. Contexto e diagnóstico

O sistema atual reúne boas soluções individuais, mas opera com linguagens visuais concorrentes:

1. navy + teal + glass;
2. superfícies neutras em zinc;
3. hero escuro no detalhe do lead;
4. modal Novo Lead com fonte, campos, portal, raios e identidade próprios;
5. estilos locais por feature.

As principais inconsistências identificadas são:

- Plus Jakarta Sans e Inter convivendo no mesmo produto;
- inputs de 32px e 44px para fluxos equivalentes;
- raios entre 10px e 28px sem uma hierarquia clara;
- botões pill, gradientes e sombras usados como linguagem principal;
- cards glass com movimento no hover em telas operacionais;
- teal, navy, zinc e hero escuro disputando protagonismo;
- cores hardcoded fora dos tokens;
- headers de página tratados como grandes cards decorativos;
- páginas de registro com aparência diferente do restante do workspace;
- componentes globais sobrescritos localmente.

O problema não será resolvido apenas trocando cores. A migração deve consolidar tokens, superfícies, densidade, componentes e padrões de composição.

---

## 3. Princípios do produto

### 3.1 Clareza antes de decoração

Hierarquia deve vir de tipografia, alinhamento, espaçamento, contraste e agrupamento. Sombras, gradientes e fundos coloridos não podem ser usados para compensar uma estrutura confusa.

### 3.2 Azul significa interação

O cobalt blue é funcional. Ele representa:

- botão primário;
- link;
- item selecionado;
- foco;
- controle ativo;
- informação acionável.

Azul não deve ser espalhado como decoração.

### 3.3 Navy significa identidade e estrutura

O navy institucional identifica o produto, a marca e áreas estruturais específicas. Não deve competir com o azul funcional.

### 3.4 Cor semântica tem significado

Verde, amarelo, vermelho, azul informativo e violeta devem representar estados ou categorias compreensíveis. Nunca usar uma cor semântica apenas para “deixar o card mais bonito”.

### 3.5 Nem tudo é card

Cards existem quando há um agrupamento semântico independente. Layout não deve ser construído como uma sequência de caixas dentro de caixas.

### 3.6 Elevação representa sobreposição

Sombras são reservadas para elementos que realmente estão acima de outros:

- dropdown;
- popover;
- tooltip;
- drawer;
- dialog.

Cards comuns não usam sombra.

### 3.7 Ação e estado têm formas diferentes

- botões usam raios de 8px ou 10px;
- status, chips, tags, contadores e avatares podem usar formato pill;
- o formato pill não é o padrão de toda ação.

### 3.8 Densidade adequada ao contexto

O sistema tem três densidades oficiais:

- **32px — compact:** tabelas, pequenas ações e controles densos;
- **36px — control:** filtros, buscas e toolbars;
- **40px — default:** botões e formulários.

### 3.9 Um único sistema

Novo Lead, detalhe do lead, propostas, contratos, administração e demais módulos devem usar a mesma fonte, os mesmos campos, estados, raios, overlays e componentes.

### 3.10 Evolução sem regressão funcional

A migração é visual e estrutural. Não deve alterar regras de negócio, permissões, integrações, persistência, drag and drop, validações ou contratos de dados sem uma solicitação específica.

---

## 4. Referências e limites

### 4.1 Referências conceituais

- **Attio:** densidade, workspace e estrutura de registros;
- **Twenty:** simplicidade operacional, navegação e painéis;
- **Linear:** disciplina de componentes, estados, espaçamento e sensação de velocidade;
- **RD Station CRM:** familiaridade operacional para usuários que já trabalharam com a ferramenta;
- **Dribbble:** apenas acabamento e repertório visual, nunca como fonte principal de UX.

### 4.2 O que não copiar

- gradientes decorativos em ações;
- excesso de blur;
- cards flutuantes em toda a página;
- dashboards pensados apenas para screenshot;
- tipografia grande demais para interfaces operacionais;
- ícones sem rótulo em ações pouco frequentes;
- redução excessiva de contraste;
- microinterações que deslocam elementos.

---

## 5. Escopo e não objetivos

### 5.1 Dentro do escopo

- tokens globais;
- cores e tipografia;
- raios, bordas, elevação e movimento;
- layout do aplicativo;
- sidebar e navegação mobile;
- botões, inputs, selects, tabs e badges;
- cards, superfícies, tabelas e toolbars;
- dialogs, drawers, popovers e tooltips;
- estados de loading, vazio, erro e sucesso;
- dashboard;
- pipeline de leads;
- detalhe do lead;
- Novo Lead;
- clientes;
- administração;
- propostas e contratos;
- login;
- acessibilidade e responsividade.

### 5.2 Fora do escopo inicial

- dark mode;
- mudança de marca ou logotipo;
- troca de stack;
- alteração de regras de negócio;
- reestruturação do banco de dados;
- substituição de Base UI, Radix UI ou dnd-kit sem necessidade comprovada;
- animações complexas;
- criação de temas por cliente;
- mudança dos formatos brasileiros de data e hora.

---

## 6. Arquitetura visual em cinco camadas

| Camada | Nome | Responsabilidade | Exemplos |
|---:|---|---|---|
| 0 | Canvas | fundo contínuo da aplicação | fundo global |
| 1 | Workspace | área principal de trabalho | página, tabela, kanban, formulário |
| 2 | Component | agrupamento semântico | card, seção, toolbar, painel |
| 3 | Floating | conteúdo temporariamente elevado | select, dropdown, popover, tooltip |
| 4 | Blocking | interrompe ou concentra a tarefa | dialog, drawer mobile, confirmação |

Regras:

- Canvas não recebe cards decorativos apenas para criar margens.
- Workspace pode ser fluido ou possuir largura máxima conforme o tipo de tela.
- Component usa borda e contraste, não sombra, como padrão.
- Floating e Blocking usam elevação proporcional ao nível.
- Um elemento deve pertencer claramente a uma camada.

---

## 7. Tokens de cor

### 7.1 Paleta primitiva

#### Neutros

| Token | Valor | Uso base |
|---|---:|---|
| `neutral-0` | `#FFFFFF` | superfície principal |
| `neutral-25` | `#FCFCFD` | superfície muito sutil |
| `neutral-50` | `#F7F8FA` | canvas |
| `neutral-100` | `#F3F5F7` | agrupamento sutil |
| `neutral-150` | `#EEF1F4` | hover discreto |
| `neutral-200` | `#E4E7EC` | borda padrão |
| `neutral-300` | `#D0D5DD` | borda forte e input |
| `neutral-400` | `#98A2B3` | placeholder e disabled |
| `neutral-500` | `#667085` | texto auxiliar |
| `neutral-600` | `#475467` | texto secundário |
| `neutral-700` | `#344054` | texto forte secundário |
| `neutral-800` | `#182230` | texto principal |
| `neutral-900` | `#101828` | contraste máximo |

#### Marca e interação

| Token | Valor | Uso base |
|---|---:|---|
| `brand-navy` | `#16263B` | identidade e estrutura |
| `brand-navy-hover` | `#0F1D2D` | interação em contexto navy |
| `interactive-50` | `#EFF6FF` | seleção e fundos ativos sutis |
| `interactive-100` | `#DBEAFE` | borda ou destaque suave |
| `interactive-300` | `#93C5FD` | foco auxiliar |
| `interactive-500` | `#3B82F6` | gráficos e informação |
| `interactive-600` | `#2563EB` | ação principal |
| `interactive-700` | `#1D4ED8` | hover |
| `interactive-800` | `#1E40AF` | active |

#### Estados semânticos

| Estado | Texto/ícone | Fundo | Borda |
|---|---:|---:|---:|
| Success | `#067647` | `#ECFDF3` | `#ABEFC6` |
| Warning | `#B54708` | `#FFFAEB` | `#FEDF89` |
| Danger | `#B42318` | `#FEF3F2` | `#FECDCA` |
| Info | `#175CD3` | `#EFF8FF` | `#B2DDFF` |
| Violet | `#6941C6` | `#F9F5FF` | `#D9D6FE` |

### 7.2 Tokens semânticos da aplicação

```css
:root {
  --background: #f7f8fa;
  --foreground: #182230;

  --card: #ffffff;
  --card-foreground: #182230;
  --popover: #ffffff;
  --popover-foreground: #182230;

  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --primary-active: #1e40af;
  --primary-foreground: #ffffff;

  --secondary: #f3f5f7;
  --secondary-hover: #eef1f4;
  --secondary-foreground: #344054;

  --muted: #f3f5f7;
  --muted-foreground: #667085;
  --accent: #eff6ff;
  --accent-foreground: #175cd3;

  --destructive: #b42318;
  --destructive-background: #fef3f2;
  --destructive-border: #fecdca;

  --border: #e4e7ec;
  --border-strong: #d0d5dd;
  --input: #d0d5dd;
  --ring: #2563eb;

  --canvas: #f7f8fa;
  --surface: #ffffff;
  --surface-subtle: #f3f5f7;
  --surface-hover: #eef1f4;
  --surface-selected: #eff6ff;

  --text-primary: #182230;
  --text-secondary: #475467;
  --text-muted: #667085;
  --text-placeholder: #98a2b3;
  --text-disabled: #98a2b3;

  --brand-navy: #16263b;
  --brand-navy-hover: #0f1d2d;
}
```

### 7.3 Regras de uso

- Texto principal nunca deve usar `black` puro.
- Placeholder não pode ser usado como texto auxiliar persistente.
- Cinza claro não pode ser a única indicação de estado disabled.
- Botão primário usa `--primary`; navy não substitui a ação principal comum.
- Navy pode aparecer na marca, sidebar, logo, login e contextos institucionais controlados.
- Teal atual deixa de ser primary e não deve permanecer como alias visual silencioso.
- Cores legadas podem ser temporariamente mapeadas para tokens V2 durante a migração, mas devem ser removidas ao final.

### 7.4 Gráficos

Paleta categórica padrão:

| Ordem | Cor |
|---:|---:|
| 1 | `#2563EB` |
| 2 | `#16875D` |
| 3 | `#C17A0A` |
| 4 | `#7F56D9` |
| 5 | `#D92D48` |
| 6 | `#0284C7` |

Regras:

- não usar apenas cor para distinguir dados críticos;
- preservar legenda, tooltip e rótulos;
- ordenar cores pela importância da série;
- não usar gradientes em barras ou linhas;
- grids devem ser discretos, com `neutral-200`;
- números devem usar alinhamento tabular.

---

## 8. Tipografia

### 8.1 Famílias

| Função | Família |
|---|---|
| Interface | Plus Jakarta Sans |
| Conteúdo técnico | Geist Mono |

Inter deve ser removida do escopo do Novo Lead. Todo o produto usa Plus Jakarta Sans.

Fallback:

```css
var(--font-plus-jakarta), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

### 8.2 Escala tipográfica

| Token | Tamanho/linha | Peso | Uso |
|---|---:|---:|---|
| `display-sm` | 30/38px | 700 | KPI principal ou estado de destaque |
| `heading-xl` | 24/32px | 700 | título de página |
| `heading-lg` | 20/28px | 700 | título de painel importante |
| `heading-md` | 16/24px | 600 | título de seção ou card |
| `body-md` | 14/22px | 400 | corpo padrão |
| `body-md-medium` | 14/22px | 500 | conteúdo enfatizado |
| `body-sm` | 13/20px | 400 | metadado e tabela compacta |
| `body-sm-medium` | 13/20px | 500 | label compacto |
| `caption` | 12/18px | 400 | ajuda e informação terciária |
| `caption-medium` | 12/18px | 600 | badge e eyebrow |

### 8.3 Regras tipográficas

- Evitar tracking negativo abaixo de `-0.02em`.
- Texto de interface usa sentence case.
- Caixa alta fica restrita a eyebrows curtos e cabeçalhos técnicos.
- Título de página não deve exceder 24px em telas operacionais.
- KPI pode usar 30px; números excepcionais podem chegar a 36px somente com justificativa.
- Números em tabelas, métricas, moedas e datas usam `font-variant-numeric: tabular-nums`.
- Labels de formulário usam 13px, peso 500 ou 600, sem caixa alta.
- Descrições não repetem o título com outras palavras.

---

## 9. Espaçamento e grid

### 9.1 Escala oficial

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

Valores fora da escala precisam de motivo técnico, como cálculo de viewport ou dimensão exigida por uma biblioteca.

### 9.2 Ritmo de página

- padding mobile: 16px;
- padding tablet: 20px;
- padding desktop: 24px;
- espaço entre header e conteúdo: 24px;
- espaço entre seções principais: 32px;
- espaço entre título e descrição: 4px;
- gap comum em formulários: 20px vertical e 16px horizontal;
- gap comum em toolbars: 8px;
- gap comum entre ícone e label: 8px.

### 9.3 Larguras

| Layout | Regra |
|---|---|
| Página padrão | fluida, com `max-width: 1600px` e centralizada |
| Kanban | largura total disponível, sem max-width restritivo |
| Tabela operacional | largura total da área |
| Formulário comum | conteúdo entre 720px e 960px conforme complexidade |
| Dialog comum | 480px, 640px ou 800px |
| Dialog de fluxo | até 1120px |

---

## 10. Raios, bordas e elevação

### 10.1 Raios

| Token | Valor | Uso |
|---|---:|---|
| `radius-sm` | 6px | elementos pequenos |
| `radius-md` | 8px | inputs, filtros, tabs e itens |
| `radius-lg` | 10px | botões e controles |
| `radius-xl` | 12px | cards, painéis e dropdowns |
| `radius-2xl` | 16px | dialogs, drawers e painéis especiais |
| `radius-full` | 999px | avatar, badge, status e chip |

Não criar raios de 13px, 14px, 18px, 22px ou 28px.

### 10.2 Bordas

- padrão: 1px `--border`;
- forte: 1px `--border-strong`;
- foco: borda `--primary` + ring externo;
- erro: borda `--destructive` + ring semântico;
- superfícies selecionadas: borda `interactive-100` ou `interactive-300`, conforme contraste.

### 10.3 Sombras

```css
--shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.05);
--shadow-sm: 0 2px 8px rgba(16, 24, 40, 0.08);
--shadow-md: 0 8px 24px rgba(16, 24, 40, 0.12);
--shadow-lg: 0 20px 48px rgba(16, 24, 40, 0.18);
```

| Elemento | Elevação |
|---|---|
| Card comum | nenhuma |
| Toolbar | nenhuma |
| Sticky header | `shadow-xs` somente após scroll, se necessário |
| Dropdown/Select | `shadow-sm` |
| Popover/Tooltip | `shadow-md` |
| Dialog/Drawer | `shadow-lg` |

---

## 11. Movimento

### 11.1 Durações

| Token | Valor | Uso |
|---|---:|---|
| `motion-fast` | 120ms | hover, focus, cor |
| `motion-default` | 180ms | dropdown, popover, tabs |
| `motion-slow` | 240ms | dialog e drawer |

Easing padrão: `cubic-bezier(0.2, 0, 0, 1)`.

### 11.2 Regras

- Botões não sobem no hover.
- Cards não sobem no hover.
- Hover pode mudar cor, borda ou sombra quando a elevação for semanticamente correta.
- Evitar animações acima de 300ms em fluxos operacionais.
- Respeitar `prefers-reduced-motion`.
- Skeleton mantém a dimensão final do conteúdo.
- Mudança de tab não usa transição que atrase a leitura.

---

## 12. Iconografia

- Biblioteca oficial: Lucide React.
- Tamanhos oficiais: 12px, 14px, 16px, 20px e 24px.
- Ícone comum de botão: 16px.
- Ícone de toolbar compacta: 14px ou 16px.
- Ícone de página: 20px.
- `strokeWidth` padrão: 1.75 ou 2, sem misturar no mesmo contexto.
- Ícones decorativos usam `aria-hidden="true"`.
- Botão apenas com ícone exige `aria-label` e tooltip quando a ação não for óbvia.
- Não usar ícones diferentes para a mesma ação.

---

## 13. Densidade e dimensões

| Contexto | Altura | Tipografia |
|---|---:|---:|
| Controle compacto | 32px | 13px |
| Toolbar/filtro | 36px | 13px ou 14px |
| Formulário/default | 40px | 14px |
| Ação confortável excepcional | 44px | 14px |

Regras:

- input de formulário usa 40px;
- select de formulário usa 40px;
- filtro de toolbar usa 36px;
- ação pequena de tabela usa 32px;
- controles menores que 32px ficam restritos a ícones auxiliares;
- no mobile, inputs usam fonte mínima de 16px quando necessário para evitar zoom automático do navegador;
- áreas de toque devem alcançar aproximadamente 40px, mesmo quando o visual interno for menor.

---

## 14. Layout global

### 14.1 AppShell

- canvas em `--background`;
- sidebar fixa no desktop;
- conteúdo principal ajustado à largura real da sidebar;
- header mobile sticky;
- conteúdo com padding responsivo;
- scroll principal previsível;
- overlays não podem ficar presos por `overflow` do shell.

### 14.2 Sidebar

| Estado | Largura |
|---|---:|
| Recolhida | 72px |
| Expandida | 248px |

Comportamento:

- permanece recolhida por padrão, preservando a preferência atual;
- expansão por clique é persistida;
- expansão temporária por hover pode continuar se não prejudicar acessibilidade;
- labels não aparecem cortados durante animação;
- grupos têm rótulos discretos;
- favoritos e grupos atuais são preservados;
- a busca usa altura de 36px.

Item ativo:

- fundo `interactive-50`;
- texto `info/text` ou `interactive-700`;
- ícone na mesma cor do texto;
- barra lateral opcional de 2px;
- sem quadrado navy ao redor do ícone;
- sem sombra.

Item inativo:

- texto `--text-secondary`;
- hover em `--surface-hover`;
- ícone `--text-muted`.

### 14.3 Header mobile

- altura entre 56px e 60px;
- logo, título contextual curto e botão de menu;
- fundo branco com borda inferior;
- drawer de até `min(88vw, 320px)`;
- fechamento por overlay, Escape e ação explícita;
- foco retorna ao botão que abriu o drawer.

### 14.4 PageHeader

O header deixa de ser um card gigante.

Estrutura:

1. breadcrumb opcional;
2. título;
3. descrição curta opcional;
4. ações à direita;
5. metadados ou filtros em linha separada quando necessário.

Regras:

- sem fundo próprio no caso padrão;
- sem raio de 28px;
- sem sombra;
- sem ícone encaixotado por padrão;
- título de 24px;
- ações quebram de forma previsível no mobile;
- KPI não deve ficar escondido dentro do header.

---

## 15. Superfícies e composição

### 15.1 Surface

Componente canônico para agrupamentos semânticos.

- fundo branco;
- borda `--border`;
- raio 12px;
- sem sombra;
- padding 16px, 20px ou 24px;
- header opcional com borda inferior;
- footer opcional com borda superior;
- sem deslocamento no hover.

### 15.2 SubtleSurface

Usos:

- toolbar;
- agrupamento de filtros;
- header de tabela;
- área auxiliar;
- resumo secundário.

Visual:

- fundo `--surface-subtle`;
- borda opcional;
- raio 8px ou 10px;
- sem sombra.

### 15.3 Card interativo

Somente quando o card inteiro é clicável:

- cursor pointer;
- hover em `--surface-hover` ou borda forte;
- focus-visible evidente;
- nenhuma elevação física;
- elemento semântico correto: link ou button conforme a ação.

### 15.4 Divisores

Preferir divisores e whitespace quando várias informações pertencem ao mesmo contexto. Não criar um novo card para cada campo, métrica ou bloco curto.

---

## 16. Botões

### 16.1 Variantes oficiais

| Variante | Visual | Uso |
|---|---|---|
| `primary` | azul, texto branco | ação principal da área |
| `secondary` | branco, borda, texto forte | ação secundária |
| `ghost` | transparente | ação terciária e toolbar |
| `destructive` | vermelho sólido ou suave conforme risco | exclusão/ação destrutiva |
| `link` | texto azul | navegação contextual |
| `inverse` | branco sobre navy | contexto institucional escuro excepcional |

As variantes legadas `default`, `cta`, `hero`, `teal` e `outline` devem ser mapeadas e progressivamente removidas. `default` pode ser mantida como alias temporário de `primary` para reduzir quebra durante a migração.

### 16.2 Tamanhos

| Size | Altura | Padding horizontal | Ícone |
|---|---:|---:|---:|
| `sm` | 32px | 10px | 14px |
| `control` | 36px | 12px | 16px |
| `default` | 40px | 16px | 16px |
| `lg` | 44px | 18px | 18px |
| `icon-sm` | 32 × 32px | 0 | 14px |
| `icon` | 36 × 36px | 0 | 16px |
| `icon-lg` | 40 × 40px | 0 | 18px |

### 16.3 Estados

- hover: mudança de cor, sem translate;
- active: cor mais escura;
- focus-visible: ring de 3px com azul a aproximadamente 18% + contorno principal;
- disabled: fundo neutro, texto disabled e cursor bloqueado;
- loading: mantém largura, bloqueia repetição e mostra spinner;
- ícone à esquerda para ação, à direita para continuidade ou navegação.

### 16.4 Hierarquia

- Preferencialmente uma ação primária por região.
- Não colocar dois botões azuis com o mesmo peso lado a lado.
- “Cancelar” geralmente é secondary ou ghost.
- Ação destrutiva não deve parecer primária até a etapa de confirmação.

---

## 17. Campos de formulário

### 17.1 Input

- altura default: 40px;
- altura compacta/control: 36px;
- raio: 8px;
- fundo branco;
- borda `--input`;
- padding horizontal: 12px;
- texto: 14px;
- placeholder: `--text-placeholder`;
- sem sombra interna;
- ícone opcional à esquerda ou direita;
- focus: borda azul + ring;
- erro: borda vermelha + mensagem associada;
- disabled: fundo sutil e texto disabled;
- readonly deve ser distinguível de disabled.

### 17.2 Textarea

- mesmas regras do Input;
- altura mínima: 96px para formulário comum;
- resize vertical quando não houver auto-resize;
- padding vertical: 10px;
- contador de caracteres apenas quando houver limite real.

### 17.3 Label e ajuda

- label: 13px, peso 600, texto principal;
- indicador opcional: “Opcional”, em texto auxiliar;
- não usar asterisco sem explicação global;
- ajuda: 12px, texto muted;
- erro: 12px, danger;
- label, controle, ajuda e erro devem possuir associação acessível.

### 17.4 Agrupamento

- campos relacionados podem ficar em grid de duas colunas no desktop;
- mobile usa uma coluna;
- endereço e dados longos não devem ser espremidos;
- seções são separadas por título, descrição e divider, não por cards aninhados;
- formulário longo usa navegação por etapas ou seções claramente identificadas.

### 17.5 Tipos e formatação

Preservar os tipos já suportados pelo formulário dinâmico:

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

Valores internos nunca aparecem para o usuário quando existe label de negócio.

---

## 18. Selects, dropdowns e pickers

### 18.1 Select

- mesma altura e raio do Input do contexto;
- chevron à direita;
- placeholder muted;
- menu alinhado ao início do trigger;
- largura mínima igual à do trigger;
- largura máxima limitada ao viewport;
- item com altura mínima de 36px;
- item selecionado com check e fundo azul sutil;
- item destacado por teclado claramente visível;
- listas longas possuem scroll e, quando necessário, busca.

### 18.2 CrmSelect

Continuará como wrapper preferencial para filtros e formulários. Preservar:

- `CrmSelectContent`;
- `CrmSelectItem`;
- `CrmSelectValue`;
- mapa de labels;
- placeholder “Selecione…”;
- bloqueio da exibição de `all`, `todos`, `__empty__`, UUIDs ou códigos internos.

### 18.3 Select dentro de Dialog

Este contrato funcional é obrigatório e não pode ser removido em uma refatoração puramente visual:

- `Dialog` usa `modal={false}` quando necessário para convivência com o portal do Select;
- `Select` interno usa `modal={false}`;
- `DialogContent` preserva os handlers de interação externa;
- reutilizar `isInteractionFromBaseUiSelectLayer` ou `dialogSelectOutsideHandlers()`;
- usar `inModal` quando o menu puder ser cortado;
- o dropdown abre abaixo do campo e acima do conteúdo do dialog;
- selecionar um item não fecha o dialog indevidamente.

O Codex deve confirmar o comportamento real da versão instalada de Base UI e Radix antes de alterar esta solução.

### 18.4 Popover

Usar para:

- filtros ricos;
- descrições e opções complexas;
- calendário;
- horário;
- menu da conta;
- notificações;
- inserção de placeholders.

Não usar Popover para uma lista simples que cabe em Select.

### 18.5 SearchablePicker/Combobox

Unificar o picker do Novo Lead ao sistema global de campos. Ele deve suportar:

- busca;
- navegação por teclado;
- estado vazio;
- loading;
- avatar e metadados;
- seleção clara;
- portal e posicionamento consistentes;
- largura responsiva.

---

## 19. Checkbox, radio e switch

### 19.1 Checkbox

- caixa de 16px a 18px;
- raio de 4px;
- estado marcado em azul;
- label clicável;
- foco visível;
- estado indeterminado suportado quando necessário.

### 19.2 Radio

- tamanho de 16px a 18px;
- seleção em azul;
- opções agrupadas com `fieldset` e `legend` quando aplicável;
- não substituir radio por cards selecionáveis sem benefício real.

### 19.3 Switch

- track aproximado de 36 × 20px ou 40 × 22px;
- sem gradiente;
- estado ativo em azul;
- label explica o efeito;
- reservar para configuração binária de efeito imediato;
- não usar Switch para confirmar uma escolha que ainda exige salvar.

A preferência “exibir leads do RD Station” e sua persistência devem continuar funcionando.

---

## 20. Tabs, badges e chips

### 20.1 Tabs

Variantes oficiais:

- `line`: padrão para navegação entre seções;
- `segmented`: alternância curta entre visões equivalentes.

Tabs `line`:

- fundo transparente;
- indicador inferior azul;
- texto inativo secundário;
- texto ativo principal ou azul;
- altura de 40px;
- scroll horizontal em telas estreitas;
- sem container branco arredondado de 22px.

Tabs `segmented`:

- fundo sutil;
- item ativo branco;
- borda ou sombra mínima;
- raio externo 10px e interno 8px;
- usar apenas com poucas opções curtas.

### 20.2 Badge de status

- formato pill;
- altura aproximada de 22px ou 24px;
- texto de 12px, peso 600;
- ícone opcional de 12px;
- fundo, texto e borda semânticos;
- label textual obrigatório; cor não pode ser a única informação.

### 20.3 Chip

Usar para:

- filtro aplicado;
- tag;
- pessoa selecionada;
- valor removível;
- contador contextual.

Chip não substitui botão comum.

---

## 21. Tabelas e listas

### 21.1 Tabela

- wrapper com scroll horizontal;
- header com 40px, fundo sutil e borda inferior;
- row padrão entre 44px e 52px;
- célula com padding horizontal de 12px e vertical de 10px;
- texto de 13px ou 14px;
- hover discreto;
- seleção com fundo azul sutil;
- coluna de ações à direita;
- valores numéricos alinhados à direita;
- números tabulares;
- coluna principal pode quebrar linha; dados curtos não;
- header sticky apenas quando realmente melhora uma tabela longa.

### 21.2 Densidade

Se houver necessidade comprovada, o componente pode ter:

- `density="compact"`;
- `density="default"`.

Não ajustar densidade com classes locais diferentes em cada tela.

### 21.3 Lista

Preferir lista quando:

- os itens possuem conteúdo heterogêneo;
- há atividade, timeline ou histórico;
- a ordem cronológica é mais importante que comparação por colunas.

### 21.4 Ações de linha

- ação principal pode estar visível;
- ações secundárias ficam em menu;
- menu de reticências deve ter label acessível;
- não esconder ações essenciais apenas no hover em dispositivos touch.

---

## 22. Avatares e usuários

### 22.1 Regra canônica

Sempre que a interface mostrar um usuário do CRM, usar `CrmUserLabel` ou uma primitive derivada dele. Não renderizar somente `fullName` quando o contexto visual pede identidade.

### 22.2 Tamanhos

| Size | Avatar | Nome |
|---|---:|---:|
| `xs` | 20px | 12px |
| `sm` | 28px | 13px |
| `md` | 32px | 14px |
| `lg` | 40px | 14px/16px |

### 22.3 Dados

- buscar `avatar_url` junto com `full_name`;
- resolver solicitante interno por e-mail quando necessário;
- não atribuir avatar de pessoa a empresa, sistema ou automação;
- fallback usa iniciais consistentes;
- imagem possui alt adequado, evitando repetição quando o nome já está ao lado.

---

## 23. Feedback e estados

### 23.1 Loading

- skeleton estrutural no primeiro carregamento;
- refresh silencioso mantém dados existentes;
- spinner fica associado à ação que iniciou a operação;
- botão permanece com largura estável;
- ações duplicadas ficam bloqueadas;
- usar `aria-busy` em regiões carregando.

No Kanban, preservar:

- `PipelineBoardSkeleton` no fetch inicial;
- board visível no refresh silencioso;
- indicador de atualização;
- retry em erro fatal.

### 23.2 Empty state

Estrutura:

1. ícone opcional;
2. título direto;
3. explicação curta;
4. ação quando houver resolução imediata.

Não usar tom de erro para ausência normal de dados.

### 23.3 Erro

- erro de campo: mensagem abaixo do controle;
- erro de seção: Alert inline;
- erro de página: estado dedicado com retry;
- erro parcial: preservar dados válidos e exibir banner;
- ação destrutiva: confirmação explícita.

### 23.4 Sucesso

- feedback próximo da ação;
- estado salvo/pendente pode ficar inline;
- confirmação transitória global só deve ser introduzida com um componente único, nunca com soluções locais diferentes;
- não depender apenas de verde.

### 23.5 Estado vazio, loading e erro como contrato

Todo componente assíncrono relevante deve prever os quatro estados:

- idle/conteúdo;
- loading;
- empty;
- error.

---

## 24. Overlays e camadas técnicas

### 24.1 Escala de z-index

| Token | Valor | Uso |
|---|---:|---|
| `z-base` | 0 | conteúdo comum |
| `z-sticky` | 20 | header ou coluna sticky |
| `z-navigation` | 40 | sidebar e header mobile |
| `z-navigation-overlay` | 50 | overlay do drawer |
| `z-drawer` | 60 | drawer mobile |
| `z-floating` | 70 | dropdown e popover fora de modal |
| `z-dialog-overlay` | 80 | overlay de dialog |
| `z-dialog` | 90 | dialog |
| `z-dialog-floating` | 100 | select/popover dentro de dialog |
| `z-nested-dialog` | 110 | dialog aninhado |
| `z-tooltip` | 120 | tooltip |
| `z-drag-overlay` | 130 | overlay de drag and drop |

Evitar números mágicos locais. Se uma biblioteca exigir wrapper próprio, o valor deve ser derivado da escala oficial.

### 24.2 Dialog

- overlay escuro entre 40% e 50%, sem blur excessivo;
- conteúdo branco;
- raio 16px no desktop;
- sombra `shadow-lg`;
- header, body e footer claramente separados;
- largura definida por variante;
- altura máxima respeita viewport;
- body rola sem esconder footer;
- Escape, botão fechar e foco devem funcionar;
- no mobile, fluxos grandes podem ocupar a tela inteira.

### 24.3 AlertDialog

Uso exclusivo para:

- exclusão;
- descarte;
- confirmação destrutiva;
- ação irreversível ou de alto impacto.

### 24.4 Drawer

Usar quando o usuário precisa consultar ou editar algo preservando o contexto da tela principal. Não transformar todo formulário em drawer.

### 24.5 Tooltip

- texto curto;
- não contém ação essencial;
- largura máxima de 300px;
- delay consistente;
- acessível por teclado;
- não substituir label visível.

---

## 25. Datas, horas e localização

Preservar:

- `lang="pt-BR"`;
- dados de data em `yyyy-mm-dd`;
- exibição em `dd/mm/aaaa`;
- horário de dados em `HH:mm`;
- exibição de horário em padrão brasileiro, como `09h30`;
- `CalendarBr`;
- `DateInputBr`;
- `TimeInputBr`;
- locale `pt-BR` em calendário;
- inputs hidden necessários a forms.

Moeda deve ser exibida como Real brasileiro quando o campo representar valor financeiro.

---

## 26. Responsividade

### 26.1 Breakpoints

Usar os breakpoints padrão do Tailwind. `lg` permanece como breakpoint estrutural da navegação.

### 26.2 Regras gerais

- mobile first;
- grids reduzem colunas progressivamente;
- formulários passam para uma coluna;
- tabs, tabelas e Kanban podem usar scroll horizontal controlado;
- ações críticas continuam visíveis;
- não permitir conteúdo atrás de sidebar ou header sticky;
- modais comuns ganham margens de 16px;
- fluxos complexos podem virar full-screen no mobile;
- toolbar pode quebrar em linhas ou recolher filtros secundários;
- não reduzir texto abaixo da escala oficial para “fazer caber”.

### 26.3 Pontos mínimos de teste

- 360px;
- 390px;
- 768px;
- 1024px;
- 1280px;
- 1440px;
- 1920px quando a tela for fluida.

---

## 27. Acessibilidade

### 27.1 Requisitos mínimos

- contraste WCAG AA para texto e controles;
- foco sempre visível;
- navegação completa por teclado;
- semântica HTML correta;
- `aria-invalid` em campos inválidos;
- `aria-describedby` para ajuda e erro;
- `aria-label` em botões somente com ícone;
- `aria-hidden` em ícones decorativos;
- título e descrição adequados em dialogs;
- foco preso corretamente em contextos blocking;
- foco devolvido ao trigger ao fechar overlay;
- estados não dependem somente de cor;
- áreas assíncronas usam `aria-busy` quando pertinente;
- suporte a `prefers-reduced-motion`.

### 27.2 Critério visual

O ring de foco deve ser identificável sem parecer uma borda permanente:

```css
outline: 3px solid rgba(37, 99, 235, 0.18);
outline-offset: 2px;
```

O componente pode combinar outline/ring com alteração da borda interna.

---

## 28. Conteúdo de interface

- usar português brasileiro;
- preferir títulos diretos;
- botões começam com verbo quando isso melhora a compreensão;
- evitar labels vagos como “OK”, “Continuar” ou “Enviar” quando uma ação específica cabe;
- mensagens de erro explicam o problema e a correção possível;
- empty states não culpam o usuário;
- confirmação destrutiva nomeia o objeto afetado;
- placeholders exemplificam formato, não substituem labels;
- valores técnicos não aparecem quando existe um nome de negócio.

Exemplos:

| Evitar | Preferir |
|---|---|
| Enviar | Criar proposta |
| OK | Entendi |
| Erro ao processar | Não foi possível salvar a proposta. Tente novamente. |
| Tem certeza? | Excluir o contrato “X”? Esta ação não poderá ser desfeita. |

---

## 29. Padrões por área

### 29.1 Login

O login pode ter presença institucional sem criar outro design system.

- usa os mesmos tokens e a mesma fonte;
- layout simples, com área institucional navy opcional no desktop;
- formulário em superfície branca;
- inputs de 40px ou 44px;
- botão primário azul;
- logo sem gradiente decorativo ao redor;
- erros inline;
- sem blobs coloridos, glass ou blur como linguagem principal;
- mobile prioriza o formulário.

### 29.2 Dashboard

Estrutura recomendada:

1. PageHeader simples;
2. filtro temporal ou contextual em toolbar;
3. grupo de KPIs;
4. visualizações principais;
5. filas ou pendências operacionais.

KPIs:

- podem compartilhar uma única Surface dividida em colunas;
- label em 13px;
- valor em 30px;
- variação com ícone e texto;
- cor apenas quando a variação tiver significado;
- não criar uma cor diferente para cada KPI sem necessidade.

### 29.3 Kanban de leads

Preservar:

- busca com sugestões;
- filtros via `CrmSelect`;
- controle Vendas/Pós-venda;
- switch do RD Station desligado por padrão;
- drag and drop;
- scroll horizontal;
- skeleton estrutural;
- erro com retry;
- refresh silencioso;
- painéis DUE canônicos.

Novo visual:

- toolbar em SubtleSurface;
- colunas com fundo neutro e borda;
- header de coluna sem glass;
- card de lead com raio 10px ou 12px;
- sem sombra e sem levantar no hover;
- hover pela borda ou fundo;
- status e prioridade por badge semântico;
- metadados organizados em duas ou três linhas, evitando excesso de chips;
- contadores alinhados e tabulares;
- DnD overlay claramente elevado.

### 29.4 Detalhe do lead

O hero escuro deve ser removido.

Estrutura:

1. breadcrumb “Leads”; 
2. entity header com nome, subtítulo e ações;
3. linha de contexto com etapa, valor, responsável e última atualização;
4. tabs `line`;
5. conteúdo por seção;
6. painel lateral apenas se houver informação realmente complementar.

Exemplo conceitual:

```text
Leads / ACME Tecnologia

ACME Tecnologia                                   Editar   Mais ações
Oportunidade comercial

Qualificação   R$ 185.000   Leonardo Marques   atualizado há 2 dias

Visão geral   Atividades   Proposta   Contrato   Histórico
```

Regras:

- sem grande bloco navy;
- sem chips para toda informação;
- hierarquia por alinhamento e tipografia;
- tabs permanecem no workspace;
- painéis de proposta, contrato, faturamento, notas e histórico usam Surface e divisores;
- ação primária depende do estado do lead.

### 29.5 Novo Lead

O Novo Lead deixa de ser um universo paralelo.

- usar Dialog de fluxo do sistema;
- largura máxima de 1120px no desktop;
- full-screen em mobile quando necessário;
- Plus Jakarta Sans;
- Input, Select, Combobox e Textarea globais;
- campos de 40px;
- raio máximo de 16px no shell;
- sem header escuro;
- stepper compacto e consistente;
- body com scroll;
- footer sticky com borda superior;
- cancelar como secondary/ghost;
- criar lead como primary;
- validação por etapa e foco no primeiro erro;
- dados preenchidos não são perdidos ao navegar entre etapas.

Etapas podem continuar equivalentes ao fluxo atual, mas devem ser nomeadas pelo negócio e não pela implementação.

### 29.6 Clientes

- PageHeader simples;
- busca, filtros e ação principal em toolbar;
- tabela como visual principal quando houver comparação entre registros;
- nome do cliente como coluna principal;
- ações secundárias em menu;
- empty state com chamada para criar/importar quando aplicável;
- detalhe segue o padrão de entity header.

### 29.7 Administração

- PageHeader simples;
- tabs `line` para áreas administrativas;
- tabelas para usuários e configurações comparáveis;
- cards apenas quando o objeto for naturalmente independente;
- dialogs CRUD usam o mesmo sistema;
- erros server-side via Alert;
- `CrmUserLabel` preservado;
- integrações e campos dinâmicos devem seguir a mesma densidade.

### 29.8 Propostas

O builder de proposta deve parecer uma ferramenta de trabalho, não uma sequência de cards decorativos.

Estrutura recomendada no desktop:

- header com nome/cliente, status de salvamento e ações;
- navegação de etapas compacta;
- coluna de edição;
- preview ao lado quando houver espaço;
- divisores entre grupos de campos;
- footer ou barra de ação sticky somente quando melhora a continuidade.

No mobile:

- edição e preview não aparecem espremidos lado a lado;
- alternância entre “Editar” e “Visualizar”;
- ações prioritárias permanecem acessíveis.

Regras:

- feedback “Salvo”, “Salvando…” e “Alterações não salvas” deve ser consistente;
- escopos, honorários, condições e partes devem possuir hierarquia clara;
- reordenação deve ter handle identificável;
- ações destrutivas em itens exigem confirmação proporcional ao impacto;
- não alterar geração, dados ou regras do documento durante a migração visual.

### 29.9 Contratos

Contratos usam a mesma base do builder de propostas.

- objeto do contrato deve aparecer como conteúdo jurídico identificado, não como detalhe visual escondido;
- cláusulas usam uma lista estruturada e ordenável quando aplicável;
- origem de conteúdo vindo da proposta pode ser identificada de forma discreta;
- inconsistências entre proposta, escopo e cláusula devem gerar aviso claro;
- preview preserva aparência documental, separado da interface de edição;
- tabs `line` para edição, preview, histórico e metadados;
- dialogs aninhados seguem a escala de overlays;
- não alterar cláusulas ou geração jurídica por inferência do redesign.

### 29.10 Due diligence

- filtros descritivos podem usar Popover;
- responsáveis usam `CrmUserLabel`;
- estados de prazo usam cor + label;
- painéis reutilizam componentes unificados;
- listas extensas priorizam tabela ou lista estruturada.

---

## 30. Componentes canônicos esperados

O nome final pode ser ajustado à arquitetura real do projeto, mas deve existir uma fonte única para cada contrato.

### 30.1 Primitives

- `Button`;
- `Input`;
- `Textarea`;
- `Label`;
- `Select`;
- `Checkbox`;
- `RadioGroup`;
- `Switch`;
- `Tabs`;
- `Badge`;
- `Avatar`;
- `Table`;
- `Dialog`;
- `AlertDialog`;
- `Popover`;
- `Tooltip`;
- `Skeleton`;
- `Progress`;
- `Alert`.

### 30.2 CRM patterns

- `CrmPageHeader` V2;
- `CrmToolbar`;
- `CrmSurface`;
- `CrmSectionHeader`;
- `CrmEntityHeader`;
- `CrmSelect`;
- `CrmUserLabel`;
- `CrmEmptyState`;
- `CrmErrorState`;
- `CrmStatusBadge`;
- `CrmMetric` ou `CrmMetricGroup`;
- `CrmFormSection`;
- `CrmSaveStatus`;
- `CrmDetailTabs` apenas se não puder ser resolvido pelo `Tabs` global.

Evitar abstrações que apenas renomeiam uma `div`. Um componente compartilhado precisa encapsular contrato visual, acessível ou comportamental real.

---

## 31. Mapeamento do legado para V2

| Legado | Destino V2 |
|---|---|
| `.glass-card` | `CrmSurface`/Card sem glass e sem hover elevado |
| `.glass-card-no-float` | remover; Surface já não flutua |
| gradiente teal primary | azul sólido `--primary` |
| botão `cta` | `primary` ou `inverse`, conforme contexto |
| botão `teal` | `primary` |
| botão pill comum | raio 10px |
| hero escuro do lead | `CrmEntityHeader` claro |
| `CrmPageHeader` de 28px | PageHeader sem container decorativo |
| Input de 32px em form | Input default de 40px |
| Input de 44px do Novo Lead | Input global de 40px |
| Inter no Novo Lead | Plus Jakarta Sans |
| tabs dentro de pill grande | tabs `line` |
| cores hardcoded locais | tokens semânticos |
| sombra de card | borda sem sombra |
| card que sobe no hover | hover por fundo/borda |
| Switch com gradiente | Switch azul sólido |
| scrollbar teal em gradiente | scrollbar neutra e discreta |

---

## 32. Arquivos inicialmente relevantes

O Codex deve confirmar os caminhos no repositório antes de editar.

### 32.1 Fundação

- `src/app/globals.css`;
- `src/app/layout.tsx`;
- `components.json`;
- `package.json`.

### 32.2 Layout

- `src/components/crm/app-shell.tsx`;
- `src/components/crm/crm-page-header.tsx`;
- `src/components/crm/crm-surface-header.tsx`.

### 32.3 Primitives atuais

- `src/components/ui/button.tsx`;
- `src/components/ui/input.tsx`;
- `src/components/ui/textarea.tsx`;
- `src/components/ui/label.tsx`;
- `src/components/ui/select.tsx`;
- `src/components/ui/card.tsx`;
- `src/components/ui/dialog.tsx`;
- `src/components/ui/alert-dialog.tsx`;
- `src/components/ui/popover.tsx`;
- `src/components/ui/tabs.tsx`;
- `src/components/ui/badge.tsx`;
- `src/components/ui/switch.tsx`;
- `src/components/ui/progress.tsx`;
- `src/components/ui/table.tsx`;
- `src/components/ui/tooltip.tsx`;
- `src/components/ui/avatar.tsx`;
- `src/components/ui/skeleton.tsx`;
- `src/components/ui/calendar-br.tsx`;
- `src/components/ui/date-input-br.tsx`;
- `src/components/ui/time-input-br.tsx`.

### 32.4 CRM e fluxos

- `src/components/crm/crm-select.tsx`;
- `src/lib/ui/base-ui-select-dialog.ts`;
- `src/components/crm/crm-user-label.tsx`;
- `src/components/crm/crm-app-user-row.tsx`;
- `src/components/crm/dynamic-form.tsx`;
- `src/components/crm/new-lead-modal/`;
- `src/components/crm/pipeline-board.tsx`;
- `src/components/crm/pipeline-board-skeleton.tsx`;
- `src/components/crm/pipeline-kanban-status.tsx`;
- `src/components/crm/pipeline-stage-panels.tsx`;
- `src/components/crm/leads-pipeline-toolbar.tsx`;
- `src/components/crm/pipeline-lead-card-content.tsx`;
- `src/app/(crm)/crm/leads/page.tsx`;
- `src/app/(crm)/crm/leads/[id]/page.tsx`;
- `src/app/(crm)/crm/leads/[id]/lead-detail-view.tsx`.

---

## 33. Estratégia de implementação

### Fase 0 — Auditoria e segurança

1. Ler regras do repositório e documentação existente.
2. Verificar estado do Git e preservar alterações do usuário.
3. Mapear todos os tokens, hardcodes, primitives e overrides locais.
4. Identificar testes, scripts de lint, typecheck e build.
5. Registrar telas e fluxos críticos.
6. Verificar visualmente o estado atual se houver ambiente executável.
7. Não alterar código antes de entender contratos funcionais.

### Fase 1 — Fundação

1. Implementar tokens V2 em `globals.css`.
2. Mapear aliases legados temporários.
3. Consolidar Plus Jakarta Sans.
4. Implementar raios, sombras, motion e z-index.
5. Remover utilities globais de movimento decorativo.
6. Definir scrollbar neutra.

Critério de saída: o projeto compila e telas ainda funcionam, mesmo antes da migração completa.

### Fase 2 — Primitives

Migrar e testar:

1. Button;
2. Input, Textarea e Label;
3. Select e CrmSelect;
4. Checkbox, Radio e Switch;
5. Tabs e Badge;
6. Card/Surface;
7. Dialog, AlertDialog, Popover e Tooltip;
8. Table, Skeleton, Progress e Alert;
9. DateInputBr, TimeInputBr e CalendarBr.

Critério de saída: nenhuma primitive cria uma família visual paralela.

### Fase 3 — Shell e padrões globais

1. AppShell;
2. sidebar 72/248px;
3. navegação mobile;
4. PageHeader V2;
5. Toolbar;
6. Surface;
7. EntityHeader;
8. estados compartilhados;
9. métricas e status.

### Fase 4 — Leads

1. pipeline e toolbar;
2. colunas e cards;
3. DnD overlay;
4. detalhe do lead sem hero;
5. tabs e painéis;
6. Novo Lead integrado ao Dialog e aos campos globais.

Preservar toda regra funcional citada neste documento.

### Fase 5 — Propostas e contratos

1. hubs/listagens;
2. builders;
3. etapas;
4. formulários;
5. preview;
6. status de salvamento;
7. dialogs aninhados;
8. estados vazios e erros.

Não modificar conteúdo jurídico nem regras de geração durante esta fase.

### Fase 6 — Demais módulos

1. dashboard;
2. clientes;
3. due diligence;
4. administração;
5. login;
6. outras rotas encontradas na auditoria.

### Fase 7 — Limpeza

1. remover aliases legados não usados;
2. remover Inter;
3. remover `.glass-card` e gradientes obsoletos;
4. remover cores hardcoded cobertas por tokens;
5. remover overrides duplicados;
6. confirmar que dark mode continua inativo;
7. atualizar documentação;
8. executar busca final por padrões proibidos.

---

## 34. Regras para uma migração segura

- Não fazer uma substituição cega de classes em todo o repositório.
- Não alterar regras de negócio para facilitar estilização.
- Não excluir helpers de portal sem teste funcional.
- Não quebrar preferências persistidas da sidebar e do Kanban.
- Não trocar bibliotecas sem necessidade.
- Não introduzir uma segunda biblioteca de ícones.
- Não criar uma nova versão local de componente se o global pode receber uma variante legítima.
- Não centralizar tudo em um arquivo gigante.
- Não abstrair cedo demais.
- Não usar `!important` como estratégia de design system.
- Não preservar inconsistência apenas por medo de ajustar consumidores.
- Migrar consumidores em lotes verificáveis.
- Manter aliases apenas durante a transição e registrar sua remoção.

---

## 35. Padrões proibidos

Após a migração completa, não devem existir:

- novos usos de teal como primary;
- gradientes em botões comuns;
- `rounded-full` em botões comuns;
- cards com hover de translate;
- `.glass-card`;
- backdrop blur em cards comuns;
- hero escuro no detalhe do lead;
- fonte Inter restrita a uma feature;
- raios fora da escala oficial sem justificativa;
- cores hex locais que já possuem token;
- z-index arbitrário fora da escala;
- labels de formulário em caixa alta como padrão;
- valores internos exibidos em selects;
- dialogs fechando ao interagir com selects portalled;
- componentes compartilhados sobrescritos em cada feature.

---

## 36. Validação e critérios de aceite

### 36.1 Validação técnica

- lint passa;
- typecheck passa;
- testes existentes passam;
- build de produção passa;
- nenhum erro novo no console;
- nenhuma hydration warning nova;
- nenhuma dependência adicionada sem necessidade;
- imports não usados removidos;
- rotas continuam carregando.

### 36.2 Validação funcional

- login funciona;
- navegação desktop e mobile funciona;
- sidebar abre, fecha e persiste preferência;
- filtros funcionam;
- selects funcionam dentro e fora de dialog;
- dialogs não fecham indevidamente;
- foco e teclado funcionam;
- Kanban carrega e permite DnD;
- preferência RD Station é preservada;
- Novo Lead percorre todas as etapas e salva;
- detalhe do lead mantém ações e dados;
- propostas e contratos mantêm geração, edição e preview;
- datas e horários continuam em pt-BR;
- usuários continuam com nome e avatar;
- estados loading, empty e error aparecem corretamente.

### 36.3 Validação visual

- uma única família tipográfica;
- azul usado como interação, não decoração;
- navy restrito a identidade/estrutura;
- cards comuns sem sombra;
- nenhum botão comum em pill;
- formulário com altura consistente;
- raios dentro da escala;
- PageHeader sem card gigante;
- detalhe do lead sem hero escuro;
- Novo Lead visualmente integrado;
- tabelas e Kanban continuam densos;
- responsividade validada nos pontos mínimos;
- contrastes e foco visível conferidos.

### 36.4 Comparação visual

Quando houver ambiente de desenvolvimento:

1. capturar screenshots antes das mudanças nas rotas principais;
2. capturar as mesmas rotas após a migração;
3. comparar desktop e mobile;
4. corrigir overflow, quebra, desalinhamento e regressões;
5. não considerar concluído apenas porque o build passou.

### 36.5 Rotas mínimas para inspeção

- login;
- dashboard;
- leads/Kanban;
- detalhe de lead;
- Novo Lead;
- clientes;
- propostas;
- contrato;
- due diligence;
- administração.

---

## 37. Checklist final

### Fundação

- [ ] Tokens V2 são a fonte de verdade.
- [ ] Plus Jakarta Sans é a única fonte de interface.
- [ ] Dark mode permanece desativado.
- [ ] Teal não é mais primary.
- [ ] Gradientes decorativos foram removidos.
- [ ] Escalas de raio, sombra, motion e z-index estão centralizadas.

### Componentes

- [ ] Button possui variantes e alturas oficiais.
- [ ] Inputs e selects de formulário usam 40px.
- [ ] Toolbars usam controles de 36px.
- [ ] Pills ficam restritas a estado e seleção.
- [ ] Surface substitui glass.
- [ ] Tabs line são o padrão de navegação interna.
- [ ] Dialog e Select continuam interoperáveis.
- [ ] Estados compartilhados são reutilizados.

### Layout

- [ ] Sidebar usa 72/248px.
- [ ] PageHeader não é um card decorativo.
- [ ] Workspace usa padding responsivo.
- [ ] Kanban aproveita a largura disponível.
- [ ] Telas de registro usam EntityHeader.

### Fluxos

- [ ] Detalhe do lead não usa hero escuro.
- [ ] Novo Lead usa o sistema global.
- [ ] Propostas e contratos preservam regras de negócio.
- [ ] Dashboard evita excesso de cards coloridos.
- [ ] Login usa os mesmos tokens.

### Qualidade

- [ ] Typecheck, lint, testes e build passam.
- [ ] Fluxos críticos foram testados.
- [ ] Desktop e mobile foram inspecionados visualmente.
- [ ] Não há overflow inesperado.
- [ ] Não há valores técnicos expostos.
- [ ] Não há componentes legados sem justificativa documentada.

---

## 38. Regra de precedência

Durante a migração:

1. regras funcionais e de negócio existentes devem ser preservadas;
2. este documento é a fonte de verdade visual da V2;
3. componentes compartilhados são a fonte operacional dos contratos já migrados;
4. exceções precisam ser justificadas e documentadas;
5. uma exceção visual local não pode virar um design system paralelo.

Após a migração:

1. tokens e componentes V2 são a fonte de verdade;
2. telas consumidoras não devem redefinir localmente o que já é global;
3. este documento deve ser atualizado sempre que uma decisão consolidada mudar.

---

# Prompt mestre para usar no Codex

Copie o conteúdo abaixo e envie ao Codex junto deste arquivo.

```text
Quero que você implemente a migração completa do design do CRM BP para o Design System V2 descrito no arquivo `DESIGN_SYSTEM_V2_CRM_BP.md`.

Atue como um engenheiro frontend sênior com forte domínio de Product Design, UI/UX, React, Next.js, Tailwind CSS v4, shadcn/ui, Radix UI e Base UI. A prioridade é transformar o sistema em uma interface Corporate Clean SaaS consistente, moderna, limpa e adequada ao uso operacional recorrente.

IMPORTANTE: não quero apenas uma análise, uma sugestão visual ou uma troca superficial de cores. Quero que você audite o projeto, implemente a fundação do Design System V2, migre os componentes compartilhados e ajuste todas as telas relevantes, preservando integralmente as regras de negócio e os comportamentos existentes.

Antes de editar:

1. Leia integralmente `DESIGN_SYSTEM_V2_CRM_BP.md`.
2. Leia todas as instruções do repositório, incluindo `AGENTS.md`, quando existir.
3. Inspecione a estrutura real do projeto, o `package.json`, `components.json`, `src/app/globals.css`, layout, primitives de UI e componentes de CRM.
4. Verifique `git status` e preserve toda alteração existente que não pertença a esta tarefa.
5. Mapeie todas as rotas, componentes compartilhados, cores hardcoded, gradientes, raios, sombras, usos de `.glass-card`, `rounded-full`, fonte Inter, headers escuros e overrides locais.
6. Identifique os comandos reais de lint, typecheck, testes e build.
7. Se o projeto puder ser executado, registre visualmente o estado inicial das telas críticas antes de alterar.

Não pare após apresentar um plano. Faça a auditoria e, em seguida, execute a migração em fases verificáveis. Caso o volume seja grande, trabalhe em lotes completos, mantendo a aplicação funcional ao final de cada lote.

ORDEM OBRIGATÓRIA DE TRABALHO

Fase 1 — Fundação
- implemente os tokens exatos de cor, tipografia, espaçamento, raio, sombra, movimento e z-index definidos no documento;
- mantenha Tailwind CSS v4 e a configuração CSS-first existente;
- preserve temporariamente aliases necessários para não quebrar consumidores;
- torne Plus Jakarta Sans a única fonte da interface;
- não ative dark mode;
- remova a linguagem global de glass, gradiente teal e movimento decorativo.

Fase 2 — Primitives
- migre Button, Input, Textarea, Label, Select, Checkbox, Radio, Switch, Tabs, Badge, Card/Surface, Dialog, AlertDialog, Popover, Tooltip, Table, Skeleton, Progress, Alert, CalendarBr, DateInputBr e TimeInputBr;
- mantenha as APIs existentes sempre que isso reduzir risco;
- quando uma API precisar mudar, migre todos os consumidores no mesmo lote;
- não crie variantes locais para substituir uma decisão que pertence ao componente global.

Fase 3 — Shell e padrões de CRM
- ajuste AppShell, sidebar, navegação mobile e layout do workspace;
- implemente sidebar com 72px recolhida e 248px expandida;
- transforme `CrmPageHeader` no header simples definido na V2;
- crie ou consolide `CrmToolbar`, `CrmSurface`, `CrmEntityHeader`, `CrmSectionHeader`, estados compartilhados, métricas e status somente quando houver contrato real reutilizável;
- evite componentes que sejam apenas wrappers sem valor.

Fase 4 — Leads
- migre toolbar, Kanban, colunas, cards e overlay de drag and drop;
- remova o hero escuro do detalhe do lead e aplique o padrão EntityHeader;
- use tabs line;
- integre o Novo Lead ao sistema global de Dialog e formulários;
- remova Inter, campos de 44px, header escuro, raios locais e estética paralela do Novo Lead;
- preserve etapas, dados, validações, persistência e ações.

Fase 5 — Propostas e contratos
- migre hubs, builders, etapas, formulários, preview, feedback de salvamento, dialogs e estados;
- use uma estrutura de workspace de edição, evitando cards dentro de cards;
- no mobile, permita alternar entre edição e preview quando ambos não couberem;
- preserve integralmente conteúdo jurídico, cláusulas, regras de geração, dados vindos da proposta e demais regras de negócio;
- não reescreva cláusulas ou o objeto do contrato por inferência desta tarefa.

Fase 6 — Demais módulos
- migre dashboard, clientes, due diligence, administração, login e todas as demais rotas identificadas;
- aplique os padrões específicos definidos no documento.

Fase 7 — Limpeza
- remova aliases legados que não possuam mais consumidores;
- remova `.glass-card`, gradientes e estilos obsoletos;
- remova Inter;
- substitua hardcodes cobertos por tokens;
- elimine overrides duplicados e componentes visuais paralelos;
- faça uma busca final no repositório pelos padrões proibidos.

CONTRATOS FUNCIONAIS QUE NÃO PODEM SER QUEBRADOS

- Dialog + Select portalled deve continuar funcionando com Base UI e Radix UI.
- Preserve `isInteractionFromBaseUiSelectLayer`, `dialogSelectOutsideHandlers()` ou uma solução comprovadamente equivalente após testes reais.
- Selecionar uma opção nunca pode fechar o dialog indevidamente.
- `CrmSelectValue` não pode exibir valores internos, UUIDs ou códigos quando houver label de negócio.
- Usuários devem continuar usando `CrmUserLabel`, com nome e avatar quando disponíveis.
- Datas e horários devem permanecer em pt-BR.
- Sidebar deve continuar recolhida por padrão e preservar preferências.
- Kanban deve preservar DnD, skeleton inicial, refresh silencioso, retry, painéis DUE e preferência de exibição do RD Station.
- Novo Lead deve preservar etapas, validação, dados entre etapas e criação.
- Propostas e contratos devem preservar regras de negócio, edição, geração e preview.
- Não altere banco, APIs, permissões, integrações ou domínio para resolver questões puramente visuais.

REGRAS VISUAIS INEGOCIÁVEIS

- estética Corporate Clean SaaS;
- cobalt blue `#2563EB` como cor funcional principal;
- navy `#16263B` como identidade/estrutura, não como primary de toda ação;
- fundo `#F7F8FA` e superfícies brancas;
- azul significa interação;
- cards comuns sem sombra;
- nenhuma elevação física no hover de cards ou botões;
- sem glass como linguagem principal;
- sem gradiente em botões comuns;
- botões comuns com raio de 10px, nunca pill;
- pills apenas para status, badges, chips, filtros selecionados, contadores e avatares;
- inputs de formulário com 40px;
- filtros e toolbars com 36px;
- controles compactos com 32px;
- Plus Jakarta Sans em toda a interface;
- PageHeader sem grande container decorativo;
- detalhe do lead sem hero escuro;
- Novo Lead usando o mesmo design system global;
- dark mode continua fora do escopo.

QUALIDADE DA IMPLEMENTAÇÃO

- prefira tokens semânticos e componentes compartilhados;
- não faça substituição cega de classes;
- não use `!important` como solução arquitetural;
- não adicione dependências sem necessidade;
- não troque Radix UI, Base UI, dnd-kit, shadcn/ui ou Lucide por preferência pessoal;
- não duplique lógica;
- não concentre toda a migração em um arquivo gigante;
- mantenha compatibilidade enquanto migra consumidores;
- remova código legado somente depois de confirmar que não há consumidores;
- respeite acessibilidade, teclado, focus-visible e reduced motion.

VALIDAÇÃO OBRIGATÓRIA

Ao final de cada fase:

1. execute os comandos relevantes de lint, typecheck, testes e build;
2. corrija os erros causados pela migração;
3. teste os fluxos afetados;
4. inspecione visualmente desktop e mobile quando houver ambiente de execução;
5. confirme que não há erros no console, hydration warnings, overflow ou elementos encobertos.

Antes de concluir, valide no mínimo:

- login;
- dashboard;
- sidebar desktop e drawer mobile;
- pipeline/Kanban e drag and drop;
- filtros e selects;
- Dialog com Select;
- detalhe do lead;
- Novo Lead completo;
- clientes;
- propostas;
- contratos;
- due diligence;
- administração;
- estados de loading, empty, error e success;
- larguras de 360px, 390px, 768px, 1024px, 1280px e 1440px.

ENTREGA FINAL

Ao terminar, apresente:

1. resumo objetivo do que foi alterado;
2. arquivos principais modificados;
3. componentes criados, consolidados ou removidos;
4. aliases ou dívida temporária que ainda restaram, com motivo;
5. validações executadas e seus resultados;
6. telas verificadas visualmente;
7. qualquer risco ou pendência real.

Não afirme que está concluído se não tiver executado as validações disponíveis. Se um teste ou inspeção não puder ser realizado, explique exatamente o motivo.
```

---

## 39. Prompt curto para retomadas futuras

Use este prompt quando a fundação já tiver sido implementada e você quiser migrar uma tela específica:

```text
Migre esta tela para o Design System V2 definido em `DESIGN_SYSTEM_V2_CRM_BP.md`.

Antes de editar, leia o documento integralmente, inspecione a tela, seus componentes compartilhados e seus contratos funcionais. Preserve regras de negócio, dados, integrações e comportamento. Reutilize tokens e componentes V2; não crie estilos locais paralelos.

Ao concluir, execute as validações disponíveis, teste o fluxo funcional e inspecione a tela em desktop e mobile. Informe os arquivos alterados, as validações executadas e qualquer pendência real.
```

---

## 40. Decisão final

O CRM BP passa a adotar **Corporate Clean SaaS** como direção oficial.

A migração não consiste em “embelezar” cada tela isoladamente. Ela deve fazer com que todas as áreas pareçam partes do mesmo produto, com decisões previsíveis, manutenção simples e uma hierarquia visual adequada ao trabalho diário.
