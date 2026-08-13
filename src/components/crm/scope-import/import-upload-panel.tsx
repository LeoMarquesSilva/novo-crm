"use client";

import { useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
  SCOPE_IMPORT_ALLOWED_EXTENSIONS,
  SCOPE_IMPORT_MAX_BYTES,
  SCOPE_IMPORT_MAX_FILES,
} from "@/lib/scope-import/constants";
import type { ScopeImportBatchState } from "./scope-import-shell";

type UploadEntry = {
  documentId: string;
  path: string;
  token: string;
  bucket: string;
};

type Props = {
  batchId: string | null;
  state: ScopeImportBatchState | null;
  loading: boolean;
  onBatchCreated: (batchId: string) => void;
  onConfirmed: (batchId: string) => void;
};

const CONCURRENCY = 3;

export function ImportUploadPanel({
  batchId,
  state,
  loading,
  onBatchCreated,
  onConfirmed,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function uploadWithRetry(
    supabase: ReturnType<typeof createSupabaseClient>,
    file: File,
    entry: UploadEntry,
    attempts = 3,
  ) {
    let lastError: Error | null = null;
    for (let i = 0; i < attempts; i += 1) {
      const { error } = await supabase.storage
        .from(entry.bucket)
        .uploadToSignedUrl(entry.path, entry.token, file, { upsert: false });
      if (!error) return;
      lastError = new Error(error.message);
    }
    throw lastError ?? new Error(`Falha no upload: ${file.name}`);
  }

  async function runUploads(files: File[], entries: UploadEntry[]) {
    const supabase = createSupabaseClient();
    let index = 0;
    async function worker() {
      while (index < files.length) {
        const current = index;
        index += 1;
        setProgress(`Enviando ${current + 1}/${files.length}: ${files[current].name}`);
        await uploadWithRetry(supabase, files[current], entries[current]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker()));
  }

  async function handleFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const files = [...selected];
    if (files.length > SCOPE_IMPORT_MAX_FILES) {
      setMessage(`Máximo de ${SCOPE_IMPORT_MAX_FILES} arquivos.`);
      return;
    }
    for (const file of files) {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!SCOPE_IMPORT_ALLOWED_EXTENSIONS.includes(ext as ".pdf" | ".docx")) {
        setMessage(`Formato não suportado: ${file.name}`);
        return;
      }
      if (file.size > SCOPE_IMPORT_MAX_BYTES) {
        setMessage(`Arquivo muito grande: ${file.name}`);
        return;
      }
    }

    setBusy(true);
    setMessage(null);
    setProgress(null);
    try {
      const res = await fetch("/api/admin/scope-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({
            name: f.name,
            size: f.size,
            contentType: f.type || "application/octet-stream",
          })),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { batchId: string; uploads: UploadEntry[] };
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "Falha ao iniciar lote.");
      }

      onBatchCreated(json.data.batchId);
      await runUploads(files, json.data.uploads);

      const confirmRes = await fetch(
        `/api/admin/scope-import/${encodeURIComponent(json.data.batchId)}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentIds: json.data.uploads.map((u) => u.documentId),
          }),
        },
      );
      const confirmJson = (await confirmRes.json()) as { ok?: boolean; error?: string };
      if (!confirmRes.ok || !confirmJson.ok) {
        throw new Error(confirmJson.error ?? "Falha ao confirmar upload.");
      }

      setMessage(`${files.length} arquivo(s) enviado(s) com sucesso.`);
      onConfirmed(json.data.batchId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro no upload.");
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const waitingConfirm =
    state?.documents.some((d) => d.status === "aguardando_upload") ?? false;

  return (
    <section className="rounded-[24px] border border-white/55 bg-white/72 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-primary-dark">1. Enviar documentos</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Selecione propostas e contratos em PDF ou DOCX (até {SCOPE_IMPORT_MAX_FILES} arquivos, 25
            MB cada). O upload vai direto ao storage.
          </p>
        </div>
        <Button
          type="button"
          variant="teal"
          className="gap-2"
          disabled={busy || loading}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UploadCloud className="size-4" aria-hidden />}
          Selecionar arquivos
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {batchId ? (
        <p className="mt-4 text-xs text-muted-foreground">Lote atual: {batchId}</p>
      ) : null}
      {progress ? <p className="mt-2 text-sm font-medium text-primary-dark">{progress}</p> : null}
      {message ? <p className="mt-2 text-sm font-semibold text-primary-dark">{message}</p> : null}
      {waitingConfirm ? (
        <p className="mt-2 text-sm text-amber-700">Aguardando confirmação de upload…</p>
      ) : null}
    </section>
  );
}
