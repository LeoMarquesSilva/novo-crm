"use client";

import { BookOpenText, Plus, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CatalogEmptyDetailProps = {
  tab: "scope" | "investment";
  onCreateType: () => void;
};

export function CatalogEmptyDetail({ tab, onCreateType }: CatalogEmptyDetailProps) {
  const isScope = tab === "scope";

  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 rounded-(--radius-v2-xl) border border-dashed border-neutral-200 bg-white p-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-(--radius-v2-xl) bg-neutral-100 text-foreground">
        {isScope ? (
          <BookOpenText className="size-6" aria-hidden />
        ) : (
          <WalletCards className="size-6" aria-hidden />
        )}
      </div>
      <div className="max-w-xs">
        <h3 className="text-base font-bold text-foreground">
          Selecione um {isScope ? "escopo" : "investimento"}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Clique em um <strong className="font-semibold text-foreground">tipo</strong> para editar
          nome, área e ordem; em um <strong className="font-semibold text-foreground">subtipo</strong>{" "}
          para editar textos, placeholders e preview ao vivo.
        </p>
      </div>
      <Button type="button" variant="teal" className="h-9 gap-1.5" onClick={onCreateType}>
        <Plus className="size-3.5" aria-hidden />
        {isScope ? "Novo tipo de escopo" : "Novo tipo de investimento"}
      </Button>
    </div>
  );
}
