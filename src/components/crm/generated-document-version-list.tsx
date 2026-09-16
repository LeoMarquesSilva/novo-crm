"use client";

import { Download, FileWarning, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDateTimeBr } from "@/lib/format-datetime";

export type GeneratedDocumentVersionListItem = {
  id: string;
  version_number: number;
  generated_file_path: string | null;
  generated_at: string;
  file_available: boolean;
};

export function GeneratedDocumentVersionList({
  leadId,
  versions,
  limit = 4,
}: {
  leadId: string;
  versions: GeneratedDocumentVersionListItem[];
  limit?: number;
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma versão gerada ainda.</p>;
  }

  const download = async (version: GeneratedDocumentVersionListItem) => {
    setDownloadingId(version.id);
    setErrorById((current) => ({ ...current, [version.id]: "" }));
    try {
      const response = await fetch(
        `/api/crm/leads/${encodeURIComponent(leadId)}/documents/versions/${encodeURIComponent(version.id)}/download`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        signedUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.signedUrl) {
        throw new Error(payload.error ?? "Não foi possível baixar esta versão.");
      }
      window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorById((current) => ({
        ...current,
        [version.id]:
          error instanceof Error ? error.message : "Não foi possível baixar esta versão.",
      }));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {versions.slice(0, limit).map((version) => (
        <div key={version.id}>
          <div className="flex items-center justify-between gap-3 rounded-(--radius-v2-md) border border-border bg-surface-subtle px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">v{version.version_number}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatDateTimeBr(version.generated_at)}
              </p>
            </div>
            {version.file_available ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                disabled={downloadingId === version.id}
                onClick={() => void download(version)}
              >
                {downloadingId === version.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-3.5" aria-hidden />
                )}
                Baixar
              </Button>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-warning-text">
                <FileWarning className="size-3.5" aria-hidden />
                Arquivo indisponível
              </span>
            )}
          </div>
          {errorById[version.id] ? (
            <p className="mt-1 text-xs text-danger-text">{errorById[version.id]}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
