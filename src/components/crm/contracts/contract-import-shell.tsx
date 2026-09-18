"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createSupabaseClient } from "@/lib/supabase/client";
import { CONTRACT_IMPORT_MAX_FILES } from "@/lib/contract-import/constants";

type ImportDocument = {
  id: string;
  original_filename: string;
  status: string;
  error_message: string | null;
  matched_grupo_id: string | null;
  matched_cliente_id: string | null;
  contrato_id: string | null;
  extraction_json: {
    extraction?: { groupName?: string | null; parties?: Array<{ razaoSocial: string; documento: string }> };
    match?: { grupoId: string | null; clienteId: string | null };
    issues?: Array<{ code: string; message: string; severity: string }>;
  } | null;
};

type BatchState = {
  batch: { id: string; status: string; document_count: number; processed_count: number; error_count: number };
  documents: ImportDocument[];
};

export function ContractImportShell() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [state, setState] = useState<BatchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reviewDocs = useMemo(
    () => (state?.documents ?? []).filter((doc) => ["extraido", "aprovado", "rejeitado", "erro"].includes(doc.status)),
    [state],
  );

  async function refresh(id: string) {
    const res = await fetch(`/api/crm/contracts/import/${id}`);
    const json = (await res.json()) as { ok?: boolean; data?: BatchState; error?: string };
    if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? "Falha ao carregar lote.");
    setState(json.data);
  }

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = [...list];
    setBusy(true);
    setMessage(null);
    try {
      const created = await fetch("/api/crm/contracts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((file) => ({ name: file.name, size: file.size, contentType: file.type || "application/pdf" })),
        }),
      });
      const createdJson = (await created.json()) as {
        ok?: boolean;
        data?: { batchId: string; uploads: Array<{ documentId: string; path: string; token: string; bucket: string }> };
        error?: string;
      };
      if (!created.ok || !createdJson.ok || !createdJson.data) {
        throw new Error(createdJson.error ?? "Falha ao criar lote.");
      }
      const supabase = createSupabaseClient();
      for (const [index, file] of files.entries()) {
        const entry = createdJson.data.uploads[index];
        const { error } = await supabase.storage
          .from(entry.bucket)
          .uploadToSignedUrl(entry.path, entry.token, file, { upsert: false });
        if (error) throw new Error(error.message);
      }
      const confirm = await fetch(`/api/crm/contracts/import/${createdJson.data.batchId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: createdJson.data.uploads.map((entry) => entry.documentId) }),
      });
      const confirmJson = (await confirm.json()) as { ok?: boolean; error?: string };
      if (!confirm.ok || !confirmJson.ok) throw new Error(confirmJson.error ?? "Falha ao confirmar upload.");
      setBatchId(createdJson.data.batchId);
      let done = false;
      while (!done) {
        const process = await fetch(`/api/crm/contracts/import/${createdJson.data.batchId}/process`, { method: "POST" });
        const processJson = (await process.json()) as { ok?: boolean; data?: { done?: boolean }; error?: string };
        if (!process.ok || !processJson.ok) throw new Error(processJson.error ?? "Falha ao processar PDF.");
        done = Boolean(processJson.data?.done);
      }
      await refresh(createdJson.data.batchId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na importação.");
    } finally {
      setBusy(false);
    }
  }

  async function reprocess() {
    if (!batchId) return;
    setBusy(true);
    setMessage(null);
    try {
      const process = await fetch(`/api/crm/contracts/import/${batchId}/process?retry=1`, { method: "POST" });
      const processJson = (await process.json()) as { ok?: boolean; error?: string };
      if (!process.ok || !processJson.ok) throw new Error(processJson.error ?? "Falha ao processar PDF.");
      await refresh(batchId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na importação.");
    } finally {
      setBusy(false);
    }
  }

  async function review(documentId: string, action: "approve" | "reject") {
    if (!batchId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/crm/contracts/import/${batchId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, action }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: { contractId: string } };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha na revisão.");
      await refresh(batchId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na revisão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-(--radius-v2-lg) border border-neutral-200 bg-white p-6">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="gap-2"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          Enviar PDFs assinados
        </Button>
        <p className="mt-3 text-sm text-neutral-500">
          Até {CONTRACT_IMPORT_MAX_FILES} PDFs. A IA preenche o rascunho financeiro; você confirma antes de gravar.
          O contrato não é ativado automaticamente.
        </p>
        {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}
      </div>

      {reviewDocs.length > 0 ? (
        <div className="space-y-3">
          {reviewDocs.map((doc) => {
            const extraction = doc.extraction_json?.extraction;
            const errors = (doc.extraction_json?.issues ?? []).filter((issue) => issue.severity === "error");
            return (
              <div key={doc.id} className="rounded-(--radius-v2-lg) border border-neutral-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-v2-heading-sm text-neutral-900">{doc.original_filename}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {extraction?.groupName || extraction?.parties?.[0]?.razaoSocial || "Grupo não identificado"}
                    </p>
                  </div>
                  <Badge variant={doc.status === "aprovado" ? "secondary" : "outline"}>{doc.status}</Badge>
                </div>
                {extraction?.parties?.length ? (
                  <ul className="mt-3 space-y-1 text-sm text-neutral-700">
                    {extraction.parties.map((party) => (
                      <li key={`${party.documento}-${party.razaoSocial}`}>
                        {party.razaoSocial} · {party.documento}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {doc.error_message ? <p className="mt-3 text-sm text-destructive">{doc.error_message}</p> : null}
                {errors.length ? (
                  <p className="mt-3 text-sm text-amber-800">
                    Pendências: {errors.map((issue) => issue.message).join(" ")}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {doc.status === "erro" ? (
                    <Button type="button" size="sm" disabled={busy} onClick={() => void reprocess()}>
                      Tentar de novo
                    </Button>
                  ) : null}
                  {doc.status === "extraido" ? (
                    <>
                      <Button type="button" size="sm" disabled={busy} onClick={() => void review(doc.id, "approve")}>
                        Gravar rascunho
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void review(doc.id, "reject")}
                      >
                        Rejeitar
                      </Button>
                    </>
                  ) : null}
                  {doc.contrato_id ? (
                    <Link href={`/crm/contratos/${doc.contrato_id}`}>
                      <Button type="button" size="sm" variant="outline">
                        Abrir contrato
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <FileUp className="size-4" />
          Nenhum contrato em revisão neste lote.
        </div>
      )}
    </div>
  );
}
