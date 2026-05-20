"use client";

import * as React from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { ptBR } from "react-day-picker/locale/pt-BR";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

/** Calendário com locale **pt-BR** (meses e dias da semana em português). */
export function CalendarBr({ className, locale = ptBR, ...props }: DayPickerProps) {
  return (
    <DayPicker
      locale={locale}
      className={cn("rounded-lg bg-popover p-2 text-popover-foreground", className)}
      {...props}
    />
  );
}
