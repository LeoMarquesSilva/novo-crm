"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LeadD4SignPanel({
  opportunityId,
  d4signDocumentUuid,
  d4signStatus,
}: {
  opportunityId: string;
  d4signDocumentUuid: string | null;
  d4signStatus: string | null;
}) {
  const router = useRouter();
  const [signerEmail, setSignerEmail] = useState("");
  const [signerForeign, setSignerForeign] = useState("1");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!file) {
      setError("Selecione um arquivo (PDF, DOC, DOCX ou imagem).");
      return;
    }
    if (!signerEmail.trim().includes("@")) {
      setError("Indique um e-mail válido do signatário.");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("opportunityId", opportunityId);
      fd.append("signerEmail", signerEmail.trim());
      fd.append("signerForeign", signerForeign);
      if (message.trim()) {
        fd.append("message", message.trim());
      }
      fd.append("file", file);
      const res = await fetch("/api/integrations/d4sign/send", { method: "POST", body: fd });
      const data = (await res.json()) as { ok?: boolean; error?: string; linkContrato?: string | null; documentUuid?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Falha no envio.");
        return;
      }
      if (data.linkContrato) {
        setSuccess('Documento enviado. O link de assinatura foi salvo em "Link do contrato".');
      } else {
        setSuccess(
          `Documento criado na D4Sign (uuid: ${data.documentUuid ?? "?"}). O link de assinatura pode demorar alguns segundos; atualize a página ou copie o link na consola D4Sign.`,
        );
      }
      setFile(null);
      router.refresh();
    } catch {
      setError("Erro de rede ao contactar o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {d4signDocumentUuid ? (
        <p className="text-sm text-muted-foreground">
          Último documento D4Sign: <span className="font-mono text-xs">{d4signDocumentUuid}</span>
          {d4signStatus ? (
            <>
              {" "}
              — estado webhook: <span className="font-medium">{d4signStatus}</span>
            </>
          ) : null}
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="d4sign-file">Ficheiro do contrato</Label>
          <Input
            id="d4sign-file"
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.bmp"
            className="mt-1 cursor-pointer"
            onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
            disabled={loading}
          />
        </div>
        <div>
          <Label htmlFor="d4sign-email">E-mail do signatário</Label>
          <Input
            id="d4sign-email"
            type="email"
            autoComplete="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            disabled={loading}
            className="mt-1"
            placeholder="nome@empresa.com"
          />
        </div>
        <div>
          <Label htmlFor="d4sign-foreign">Signatário sem CPF (estrangeiro)</Label>
          <select
            id="d4sign-foreign"
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={signerForeign}
            onChange={(e) => setSignerForeign(e.target.value)}
            disabled={loading}
          >
            <option value="1">Sim (foreign = 1)</option>
            <option value="0">Não — com CPF nacional (foreign = 0)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="d4sign-msg">Mensagem (opcional)</Label>
          <Input
            id="d4sign-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={loading}
            className="mt-1"
            placeholder="Mensagem nos e-mails da D4Sign (se notificações estiverem ativas)"
          />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "A enviar…" : "Enviar para D4Sign"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-accent-teal">{success}</p> : null}
        </div>
      </form>
    </div>
  );
}
