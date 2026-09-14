import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Design System V2 (§16.3): disabled usa fundo neutro e texto disabled, não só opacidade.
  "group/button inline-flex shrink-0 items-center justify-center rounded-(--radius-v2-lg) border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap tracking-[-0.01em] transition-colors duration-200 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:border-transparent disabled:bg-muted disabled:text-text-disabled-v2 disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      // Design System V2 (§16): sem gradiente/sombra decorativa e sem deslocamento no
      // hover/active em botões comuns. `default` fica como alias de `primary`. Mapeamento
      // do legado (§31): `cta` e `teal` passam a renderizar como `primary` (nomes mantidos
      // por compatibilidade de API — nenhum consumidor precisa trocar de variant — mas o
      // resultado visual não compete mais com o azul funcional). `hero`/`inverse` ficam
      // como o branco-sobre-navy oficial (§16.1), para o raro contexto institucional escuro.
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        cta: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        inverse:
          "border border-white/30 bg-white text-brand-navy hover:bg-neutral-50",
        hero:
          "border border-white/30 bg-white text-brand-navy hover:bg-neutral-50",
        teal: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        outline:
          "border-border bg-white text-foreground hover:border-border-strong hover:bg-neutral-50 aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border border-border bg-white text-secondary-foreground hover:bg-secondary-hover aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "text-foreground hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Alturas V2 (§16.2): sm=32px, control=36px (novo, uso em toolbar), default=40px,
      // lg=44px, icon-sm=32px, icon=36px, icon-lg=40px. `xs`/`icon-xs` são extensões
      // fora da escala V2, mantidas por compatibilidade (uso existente em ações compactas
      // de tabela/toolbar) com raio compacto (8px) em vez do raio padrão de botão (10px).
      size: {
        default:
          "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        xs: "h-7 gap-1 rounded-(--radius-v2-md) px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-(--radius-v2-md) px-2.5 text-[13px] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        control:
          "h-9 gap-1.5 px-3 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        lg: "h-11 gap-2 px-[18px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs":
          "size-6 rounded-(--radius-v2-md) in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-(--radius-v2-md) in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
