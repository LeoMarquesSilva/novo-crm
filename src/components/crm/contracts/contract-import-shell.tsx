"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseClient } from "@/lib/supabase/client";
import { CONTRACT_IMPORT_MAX_FILES } from "@/lib/contract-import/constants";
import { ContractImportReviewCard, type ImportReviewDocument } from "./contract-import-review-card";
import {
  ContractImportGroupPickerDialog,
  type ImportClienteOption,
  type ImportGrupoOption,
} from "./contract-import-group-picker-dialog";

type ImportDocument = ImportReviewDocument;

type BatchState = {
  batch: { id: string; status: string; document_count: number; processed_count: number; error_count: number };
  documents: ImportDocument[];
  grupos: ImportGrupoOption[];
  clientes: ImportClienteOption[];
};

function needsManualGroup(doc: ImportDocument): boolean {
  return doc.status === "extraido" && (!doc.matched_grupo_id || !doc.matched_cliente_id);
}

export function ContractImportShell() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [state, setState] = useState<BatchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [skippedPicker, setSkippedPicker] = useState<string[]>([]);
  const [filesProgress, setFilesProgress] = useState<Array<{ name: string; status: string }>>([]);

  const reviewDocs = useMemo(
    () => (state?.documents ?? []).filter((doc) => ["extraido", "aprovado", "rejeitado", "erro"].includes(doc.status)),
    [state],
  );
  const pickingDoc = reviewDocs.find((doc) => doc.id === pickingId) ?? null;

  useEffect(() => {
    if (pickingId || busy) return;
    const unmatched = reviewDocs.find((doc) => needsManualGroup(doc) && !skippedPicker.includes(doc.id));
    if (unmatched) setPickingId(unmatched.id);
  }, [reviewDocs, pickingId, skippedPicker, busy]);

  async function refresh(id: string) {
    const res = await fetch(`/api/crm/contracts/import/${id}`);
    const json = (await res.json()) as { ok?: boolean; data?: BatchState; error?: string };
    if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? "Falha ao carregar lote.");
    setState({
      ...json.data,
      grupos: json.data.grupos ?? [],
      clientes: json.data.clientes ?? [],
    });
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
      setFilesProgress(files.map((file) => ({ name: file.name, status: "enviando" })));
      for (const [index, file] of files.entries()) {
        const entry = createdJson.data.uploads[index];
        const { error } = await supabase.storage
          .from(entry.bucket)
          .uploadToSignedUrl(entry.path, entry.token, file, { upsert: false });
        if (error) throw new Error(error.message);
        setFilesProgress((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? { ...item, status: "extraindo" } : item)),
        );
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
      let processed = 0;
      while (!done) {
        const process = await fetch(`/api/crm/contracts/import/${createdJson.data.batchId}/process`, { method: "POST" });
        const processJson = (await process.json()) as { ok?: boolean; data?: { done?: boolean }; error?: string };
        if (!process.ok || !processJson.ok) throw new Error(processJson.error ?? "Falha ao processar PDF.");
        done = Boolean(processJson.data?.done);
        if (!done) {
          processed += 1;
          setFilesProgress((current) =>
            current.map((item, itemIndex) =>
              itemIndex < processed ? { ...item, status: "pronto" } : item,
            ),
          );
        }
        await refresh(createdJson.data.batchId);
      }
      setFilesProgress((current) => current.map((item) => ({ ...item, status: "pronto" })));
    } catch (error) {
      setFilesProgress((current) =>
        current.map((item) => (item.status === "pronto" ? item : { ...item, status: "erro" })),
      );
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

  async function assignGroup(documentId: string, grupoId: string) {
    if (!batchId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/crm/contracts/import/${batchId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, action: "assign_group", grupoId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao vincular o grupo.");
      setPickingId(null);
      await refresh(batchId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao vincular o grupo.");
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

  const phase = busy
    ? filesProgress.some((item) => item.status === "enviando")
      ? "Enviar"
      : "Extrair"
    : reviewDocs.length
      ? "Conferir lote"
      : "Enviar";

  return (
    <div className="space-y-6">
      <ol className="grid gap-2 sm:grid-cols-4">
        {["Enviar", "Extrair", "Conferir lote", "Gravar rascunho"].map((label) => (
          <li
            key={label}
            className={`rounded-(--radius-v2-md) border px-3 py-2 text-sm ${
              phase === label || (label === "Gravar rascunho" && reviewDocs.some((doc) => doc.status === "aprovado"))
                ? "border-interactive-300 bg-interactive-50 text-interactive-800"
                : "border-neutral-200 bg-white text-neutral-500"
            }`}
          >
            {label}
          </li>
        ))}
      </ol>

      <div
        className="rounded-(--radius-v2-lg) border border-dashed border-neutral-300 bg-white p-6"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!busy) void handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          Enviar PDFs assinados
        </Button>
        <p className="mt-3 text-sm text-neutral-500">
          Arraste até {CONTRACT_IMPORT_MAX_FILES} PDFs ou clique para escolher. A IA lê só trechos de honorários e
          vigência; você confere as citações e grava um rascunho — nada é ativado sozinho.
        </p>
        {filesProgress.length ? (
          <ul className="mt-4 space-y-2">
            {filesProgress.map((item) => (
              <li key={item.name} className="flex items-center justify-between text-sm text-neutral-700">
                <span className="truncate">{item.name}</span>
                <span className="text-neutral-500">
                  {item.status === "enviando"
                    ? "Enviando"
                    : item.status === "extraindo"
                      ? "Extraindo"
                      : item.status === "erro"
                        ? "Erro"
                        : "Pronto"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}
      </div>

      {reviewDocs.length > 0 ? (
        <div className="space-y-3">
          {reviewDocs.map((doc) => (
            <ContractImportReviewCard
              key={doc.id}
              doc={doc}
              grupoNome={(state?.grupos ?? []).find((grupo) => grupo.id === doc.matched_grupo_id)?.nome ?? null}
              clienteNome={(state?.clientes ?? []).find((cliente) => cliente.id === doc.matched_cliente_id)?.razaoSocial ?? null}
              unmatched={needsManualGroup(doc)}
              busy={busy}
              onPickGroup={() => setPickingId(doc.id)}
              onApprove={() => void review(doc.id, "approve")}
              onReject={() => void review(doc.id, "reject")}
              onRetry={() => void reprocess()}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <FileUp className="size-4" />
          Nenhum contrato em conferência neste lote.
        </div>
      )}

      <ContractImportGroupPickerDialog
        open={Boolean(pickingDoc)}
        filename={pickingDoc?.original_filename ?? ""}
        hint={
          pickingDoc?.extraction_json?.extraction?.groupName
            || pickingDoc?.extraction_json?.extraction?.parties?.[0]?.razaoSocial
            || null
        }
        grupos={state?.grupos ?? []}
        clientes={state?.clientes ?? []}
        busy={busy}
        onOpenChange={(open) => {
          if (open || !pickingId) return;
          setSkippedPicker((current) => (current.includes(pickingId) ? current : [...current, pickingId]));
          setPickingId(null);
        }}
        onConfirm={(grupoId) => {
          if (pickingId) void assignGroup(pickingId, grupoId);
        }}
      />
    </div>
  );
}
