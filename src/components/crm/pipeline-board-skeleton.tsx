"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PipelineBoardColumn } from "@/lib/crm/pipeline-board-config";
import { cn } from "@/lib/utils";

type PipelineBoardSkeletonProps = {
  columns: PipelineBoardColumn[];
};

function SkeletonLeadCard({ tall }: { tall?: boolean }) {
  return (
    <div className="rounded-[14px] border border-primary-dark/10 bg-white/80 p-3 shadow-sm">
      <Skeleton className="h-2 w-14" />
      <Skeleton className="mt-2 h-3.5 w-[85%]" />
      <Skeleton className="mt-3 h-7 w-full rounded-lg" />
      {tall ? (
        <>
          <Skeleton className="mt-2 h-16 w-full rounded-xl" />
          <Skeleton className="mt-2 h-2.5 w-2/3" />
        </>
      ) : (
        <Skeleton className="mt-2 h-2.5 w-1/2" />
      )}
    </div>
  );
}

function SkeletonColumn({ titleWidth, cardCount }: { titleWidth: string; cardCount: number }) {
  return (
    <div className="h-full min-h-0 w-[min(19vw,300px)] min-w-[250px] max-w-[320px] shrink-0 sm:min-w-[268px]">
      <Card className="glass-card-no-float flex h-full min-h-0 w-full flex-col gap-0 rounded-[16px] border-primary-dark/10 py-0">
        <CardHeader className="relative z-0 flex shrink-0 flex-row items-center justify-between gap-3 border-b border-primary-dark/[0.08] bg-[#fbfbfc] px-3.5 py-3">
          <Skeleton className={cn("h-3.5", titleWidth)} />
          <Skeleton className="h-5 w-7 rounded-full" />
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-0 pb-0 pt-0">
          <div className="crm-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 pb-3 pt-2.5">
            {Array.from({ length: cardCount }, (_, i) => (
              <SkeletonLeadCard key={i} tall={i === 0 && cardCount > 1} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Placeholder do kanban enquanto `/api/crm/leads` carrega. */
export function PipelineBoardSkeleton({ columns }: PipelineBoardSkeletonProps) {
  const cardPattern = [2, 1, 3, 1, 2, 1, 2, 1, 1, 2, 1];
  const titleWidths = ["w-24", "w-20", "w-28", "w-32", "w-36", "w-24", "w-28", "w-32", "w-24", "w-28", "w-32"];

  return (
    <div
      className="crm-scrollbar h-full min-h-0 overflow-x-auto overflow-y-hidden pb-1 [-webkit-overflow-scrolling:touch]"
      aria-busy="true"
      aria-label="Carregando pipeline"
    >
      <div className="flex h-full min-h-[min(70dvh,680px)] min-w-max items-stretch gap-2.5 sm:gap-3 md:h-[min(76dvh,800px)] lg:h-[min(80dvh,860px)]">
        {columns.map((column, index) => (
          <SkeletonColumn
            key={column.stage}
            titleWidth={titleWidths[index % titleWidths.length] ?? "w-24"}
            cardCount={cardPattern[index % cardPattern.length] ?? 1}
          />
        ))}
      </div>
    </div>
  );
}
