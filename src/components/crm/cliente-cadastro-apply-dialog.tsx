"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  formatClienteEnderecoResumo,
  type ClienteCadastroRow,
} from "@/lib/crm/cliente-cadastro-cp-fields";

const SKIP_KEY_PREFIX = "crm-skip-cadastro-prompt:";

export function clienteCadastroPromptWasDeclined(leadId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(`${SKIP_KEY_PREFIX}${leadId}`) === "1";
}

export function markClienteCadastroPromptDeclined(leadId: string) {
  sessionStorage.setItem(`${SKIP_KEY_PREFIX}${leadId}`, "1");
}

type Props = {
  open: boolean;
  leadId: string;
  clienteId: string;
  onOpenChange: (open: boolean) => void;
  onApply: (cpFields: Record<string, string>, cliente: ClienteCadastroRow) => void;
};

type LoadedProps = {
  leadId: string;
  clienteId: string;
  onOpenChange: (open: boolean) => void;
  onApply: (cpFields: Record<string, string>, cliente: ClienteCadastroRow) => void;
};

function ClienteCadastroApplyDialogLoaded({
  leadId,
  clienteId,
  onOpenChange,
  onApply,
}: LoadedProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cliente, setCliente] = useState<ClienteCadastroRow | null>(null);
  const [cpFields, setCpFields] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/clients/${encodeURIComponent(clienteId)}/cadastro`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          data?: { cliente: ClienteCadastroRow; cpFields: Record<string, string> };
        };
        if (!res.ok || !json.ok || !json.data) {
          throw new Error(json.error ?? "Não foi possível carregar o cadastro.");
        }
        return json.data;
      })
      .then((data) => {
        if (cancelled) return;
        setCliente(data.cliente);
        setCpFields(data.cpFields);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro ao carregar cadastro.");
        setCliente(null);
        setCpFields(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clienteId]);

  function decline() {
    markClienteCadastroPromptDeclined(leadId);
    onOpenChange(false);
  }

  function confirm() {
    if (!cliente || !cpFields) return;
    onApply(cpFields, cliente);
    onOpenChange(false);
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Utilizar dados do cadastro do cliente?</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Este lead está vinculado a um cliente já cadastrado na carteira. Você pode
              preencher endereço e demais campos do documento com esses dados.
            </p>
            {loading ? (
              <p className="text-foreground">Carregando cadastro…</p>
            ) : error ? (
              <p className="text-destructive">{error}</p>
            ) : cliente ? (
              <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-foreground">
                <p className="font-semibold">{cliente.razao_social}</p>
                <p className="mt-1 text-xs">{formatClienteEnderecoResumo(cliente)}</p>
              </div>
            ) : null}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel type="button" onClick={decline}>
          Manter como está
        </AlertDialogCancel>
        <Button type="button" variant="primary" disabled={loading || !cpFields} onClick={confirm}>
          Usar cadastro
        </Button>
      </AlertDialogFooter>
    </>
  );
}

export function ClienteCadastroApplyDialog({
  open,
  leadId,
  clienteId,
  onOpenChange,
  onApply,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {open ? (
          <ClienteCadastroApplyDialogLoaded
            key={clienteId}
            leadId={leadId}
            clienteId={clienteId}
            onOpenChange={onOpenChange}
            onApply={onApply}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
