"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

/** Estilo padrão do painel dropdown no CRM (largura, sombra, padding). */
export const CRM_SELECT_CONTENT_CLASS =
  "z-[400] min-w-[var(--anchor-width)] p-1.5 shadow-lg shadow-primary-dark/[0.08] ring-1 ring-border/80";

/** Painel acima de modais do CRM (overlay z-[70]). */
export const CRM_SELECT_MODAL_LAYER_CLASS = "z-[100]";

export const CRM_SELECT_ITEM_CLASS = "rounded-lg py-2 pl-2.5 pr-8 text-sm";

type CrmSelectContentProps = React.ComponentProps<typeof SelectContent> & {
  /** Portal no body com z-index acima de modais (evita corte por overflow-hidden). */
  inModal?: boolean;
};

/** Dropdown alinhado abaixo do trigger, largura confortável, sem “colar” no item. */
export function CrmSelectContent({
  className,
  inModal,
  portalled = true,
  container,
  ...props
}: CrmSelectContentProps) {
  return (
    <SelectContent
      alignItemWithTrigger={false}
      side="bottom"
      align="start"
      sideOffset={6}
      portalled={inModal ? true : portalled}
      container={inModal ? undefined : container}
      className={cn(
        CRM_SELECT_CONTENT_CLASS,
        inModal && CRM_SELECT_MODAL_LAYER_CLASS,
        className,
      )}
      {...props}
    />
  );
}

type CrmSelectValueProps = {
  value?: string | null;
  labels?: Record<string, string>;
  placeholder?: string;
  className?: string;
};

/** Evita exibir valor interno (`all`, `todos`, uuid) no trigger — mostra o rótulo em português. */
export function CrmSelectValue({
  value,
  labels,
  placeholder = "Selecione…",
  className,
}: CrmSelectValueProps) {
  const key = value != null ? String(value).trim() : "";
  let display: string | null = null;
  if (key) {
    if (labels) {
      const label = labels[key];
      display = label != null && String(label).trim() !== "" ? label : null;
    } else {
      display = key;
    }
  }

  return (
    <SelectValue placeholder={placeholder} className={className}>
      {display}
    </SelectValue>
  );
}

type CrmSelectItemProps = React.ComponentProps<typeof SelectItem>;

export function CrmSelectItem({ className, ...props }: CrmSelectItemProps) {
  return <SelectItem className={cn(CRM_SELECT_ITEM_CLASS, className)} {...props} />;
}
