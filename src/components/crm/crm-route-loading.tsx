import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto das páginas do CRM, usado pelos `loading.tsx` de `/crm`. Aparece
 * na hora do clique enquanto o servidor monta a página (Design System V2,
 * §23.1: skeleton estrutural + `aria-busy`). Mesma estrutura do
 * `CrmPageHeader` (ícone, título, descrição e indicadores) e um card de conteúdo.
 */
export function CrmRouteLoading() {
  return (
    <div className="space-y-5" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando página…</span>

      <section aria-hidden>
        <div className="flex min-w-0 gap-3">
          <Skeleton className="mt-1 size-5 shrink-0 rounded-(--radius-v2-sm)" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-6 w-64 max-w-full" />
            <Skeleton className="mt-3 h-3.5 w-[min(36rem,100%)]" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="min-w-0 rounded-(--radius-v2-lg) border border-border bg-surface-subtle px-3.5 py-3"
            >
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-2 h-6 w-16" />
            </div>
          ))}
        </div>
      </section>

      <Card className="gap-0 overflow-hidden py-0" aria-hidden>
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-24 rounded-(--radius-v2-lg)" />
        </CardHeader>
        <CardContent className="space-y-3 px-5 py-5 sm:px-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="hidden h-3.5 w-24 sm:block" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
