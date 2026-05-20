"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  leadId: string;
  className?: string;
};

/**
 * Acrescenta uma linha em `lead_intakes.empresas_json` (PATCH `empresa_append`).
 */
export function LeadAddEmpresaButton({ leadId, className }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeField: { key: "empresa_append", value: "" } }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Não foi possível adicionar a empresa.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed border-primary-dark/40 bg-white/50 text-primary-dark hover:bg-white/80 sm:w-auto"
        disabled={loading}
        onClick={() => void add()}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-2 h-4 w-4" />
        )}
        Adicionar empresa
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
