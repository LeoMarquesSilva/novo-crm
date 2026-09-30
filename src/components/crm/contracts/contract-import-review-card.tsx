"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  summarizeImportedAreas,
  summarizeImportedComponents,
  summarizeSioeRateio,
} from "@/lib/contract-import/summarize-extraction";
import type { ContractImportExtraction } from "@/lib/contract-import/schemas";
import type { SioeRateioSnapshot } from "@/lib/contract-import/sioe-rateio";

const STATUS_LABEL: Record<string, string> = {
  extraido: "Pronto para conferir",
  aprovado: "Rascunho gravado",
  rejeitado: "Rejeitado",
  erro: "Falhou",
  processando: "Extraindo",
  enviado: "Na fila",
};

export type ImportReviewDocument = {
  id: string;
  original_filename: string;
  status: string;
  error_message: string | null;
  matched_grupo_id: string | null;
  matched_cliente_id: string | null;
  contrato_id: string | null;
  extraction_json: {
    extraction?: ContractImportExtraction;
    match?: { grupoId: string | null; clienteId: string | null };
    sioeRateio?: SioeRateioSnapshot | null;
    issues?: Array<{ code: string; message: string; severity: string }>;
  } | null;
};

export function ContractImportReviewCard({
  doc,
  grupoNome,
  clienteNome,
  unmatched,
  busy,
  onPickGroup,
  onApprove,
  onReject,
  onRetry,
}: {
  doc: ImportReviewDocument;
  grupoNome: string | null;
  clienteNome: string | null;
  unmatched: boolean;
  busy: boolean;
  onPickGroup: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const extraction = doc.extraction_json?.extraction;
  const issues = (doc.extraction_json?.issues ?? []).filter((issue) => issue.severity === "error");
  const billing = extraction ? summarizeImportedComponents(extraction) : [];
  const rateio = summarizeSioeRateio(doc.extraction_json?.sioeRateio);
  const evidence = extraction?.evidence ?? [];

  return (
    <article className="rounded-(--radius-v2-lg) border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-v2-heading-sm text-neutral-900">{doc.original_filename}</p>
          <p className="mt-1 text-sm text-neutral-600">
            {grupoNome
              ?? extraction?.groupName
              ?? extraction?.parties?.[0]?.razaoSocial
              ?? "Grupo ainda não vinculado à carteira"}
          </p>
          {clienteNome ? <p className="text-sm text-neutral-500">{clienteNome}</p> : null}
        </div>
        <Badge variant={doc.status === "aprovado" ? "secondary" : "outline"}>
          {STATUS_LABEL[doc.status] ?? doc.status}
        </Badge>
      </div>

      {unmatched ? (
        <p className="mt-3 rounded-(--radius-v2-md) border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          A IA leu o PDF, mas não casou um grupo da carteira. Escolha o grupo para gravar o rascunho.
        </p>
      ) : null}

      {extraction ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <section className="rounded-(--radius-v2-md) border border-neutral-150 bg-neutral-50 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Lido do PDF</p>
            <p className="mt-1 text-sm text-neutral-800">{summarizeImportedAreas(extraction)}</p>
            {extraction.adjustmentIndex ? (
              <p className="mt-1 text-sm text-neutral-600">Reajuste: {extraction.adjustmentIndex}</p>
            ) : null}
            {extraction.indefinite ? (
              <p className="mt-1 text-sm text-neutral-600">Prazo indeterminado</p>
            ) : null}
          </section>
          <section className="rounded-(--radius-v2-md) border border-neutral-150 bg-neutral-50 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Cobrança entendida</p>
            {billing.length ? (
              <ul className="mt-1 space-y-1 text-sm text-neutral-800">
                {billing.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-neutral-600">Nenhum componente extraído.</p>
            )}
          </section>
        </div>
      ) : null}

      {rateio ? (
        <p className="mt-3 rounded-(--radius-v2-md) border border-info-border bg-info-bg px-3 py-2 text-sm text-info-text">
          Rateio SIOE (não é IA): {rateio}
        </p>
      ) : extraction ? (
        <p className="mt-3 text-sm text-neutral-500">Sem rateio SIOE para este grupo — o percentual fica para a ficha.</p>
      ) : null}

      {evidence.length ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Trechos usados pela IA</p>
          <ul className="mt-2 space-y-2">
            {evidence.map((item, index) => (
              <li
                key={`${item.field}-${index}`}
                className="rounded-(--radius-v2-md) border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700"
              >
                <span className="font-medium text-neutral-900">{item.field}</span>
                {item.clause ? <span className="text-neutral-500"> · {item.clause}</span> : null}
                <p className="mt-0.5 italic">“{item.quote}”</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {extraction?.parties?.length ? (
        <ul className="mt-3 space-y-1 text-sm text-neutral-600">
          {extraction.parties.map((party) => (
            <li key={`${party.documento}-${party.razaoSocial}`}>
              {party.razaoSocial} · {party.documento}
            </li>
          ))}
        </ul>
      ) : null}

      {doc.error_message ? <p className="mt-3 text-sm text-destructive">{doc.error_message}</p> : null}
      {issues.length ? (
        <p className="mt-3 text-sm text-amber-800">
          Pendências: {issues.map((issue) => issue.message).join(" ")}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {doc.status === "erro" ? (
          <Button type="button" size="sm" disabled={busy} onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : null}
        {doc.status === "extraido" ? (
          <>
            <Button type="button" size="sm" variant={unmatched ? "default" : "outline"} disabled={busy} onClick={onPickGroup}>
              {unmatched ? "Escolher grupo" : "Trocar grupo"}
            </Button>
            <Button type="button" size="sm" disabled={busy || unmatched} onClick={onApprove}>
              Gravar rascunho
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onReject}>
              Rejeitar
            </Button>
          </>
        ) : null}
        {doc.contrato_id ? (
          <Link href={`/crm/contratos/${doc.contrato_id}`}>
            <Button type="button" size="sm" variant="outline">
              Abrir rascunho
            </Button>
          </Link>
        ) : null}
      </div>
    </article>
  );
}
