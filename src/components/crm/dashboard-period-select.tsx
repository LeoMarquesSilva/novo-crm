"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { DASHBOARD_PERIODS, type DashboardPeriod } from "@/lib/crm/dashboard-period";
import { cn } from "@/lib/utils";

const LABEL: Record<DashboardPeriod, string> = {
  7: "Últimos 7 dias",
  30: "Últimos 30 dias",
  90: "Últimos 90 dias",
};

/** Filtro de período do Dashboard: grava em `?periodo=` e o servidor recalcula as entradas. */
export function DashboardPeriodSelect({ value }: { value: DashboardPeriod }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        if (!v || v === String(value)) return;
        startTransition(() => router.push(`/crm?periodo=${v}`, { scroll: false }));
      }}
    >
      <SelectTrigger
        aria-label="Período"
        className={cn("h-10 min-w-44 gap-2 bg-white px-3 font-medium", pending && "opacity-70")}
      >
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-left">{LABEL[value]}</span>
      </SelectTrigger>
      <SelectContent>
        {DASHBOARD_PERIODS.map((p) => (
          <SelectItem key={p} value={String(p)}>
            {LABEL[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
