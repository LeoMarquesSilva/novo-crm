import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap tracking-[-0.01em] transition-all duration-200 ease-out outline-none select-none hover:-translate-y-0.5 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/45 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-crm-gradient-primary text-primary-foreground shadow-[0_14px_30px_rgba(15,118,110,0.22)] hover:shadow-[0_18px_42px_rgba(15,118,110,0.28)]",
        primary:
          "bg-crm-gradient-primary text-primary-foreground shadow-[0_14px_30px_rgba(15,118,110,0.22)] hover:shadow-[0_18px_42px_rgba(15,118,110,0.28)]",
        cta:
          "border-primary-dark/10 bg-[linear-gradient(135deg,var(--primary-dark),var(--primary-medium))] px-8 text-white shadow-[0_14px_32px_rgba(23,32,51,0.22)] hover:shadow-[0_18px_42px_rgba(23,32,51,0.26)]",
        hero:
          "border-white/45 bg-white text-primary-dark shadow-[0_14px_34px_rgba(0,0,0,0.18)] hover:bg-slate-50 hover:shadow-[0_18px_42px_rgba(0,0,0,0.22)]",
        teal: "bg-accent-teal text-white shadow-[0_12px_28px_rgba(15,159,143,0.26)] hover:bg-accent-teal/90",
        outline:
          "border-border bg-white/70 text-foreground shadow-sm shadow-primary-dark/[0.03] hover:border-accent-teal/35 hover:bg-white aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border border-border/60 bg-secondary text-secondary-foreground hover:bg-white aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "border border-border/60 bg-white/45 text-primary-medium hover:border-accent-teal/30 hover:bg-white/85 hover:text-primary-dark aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-1.5 px-6 has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        xs: "h-7 gap-1 rounded-[10px] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[12px] px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-7 has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
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
