"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger } from "@/components/ui/select";
import { BR_TIMEZONE, formatDateYmdBr } from "@/lib/format-datetime";
import type { ContractDetailViewModel } from "@/modules/contracts/infrastructure/contract-queries";

const formatDate = (value: string | null) => formatDateYmdBr(value) || "sem término";

/** Data civil de hoje no horário de Brasília (evita virar o dia por causa do UTC). */
function todayYmdBr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BR_TIMEZONE }).format(new Date());
}

export function ContractVersionsPanel({
  contract,
  canManage,
}: {
  contract: ContractDetailViewModel;
  canManage: boolean;
}) {
  const router = useRouter();
  const source = useMemo(
    () => contract.versions.find((version) => version.id === contract.activeVersionId) ?? contract.versions[0],
    [contract],
  );
  const [effectiveFrom, setEffectiveFrom] = useState(contract.renewalDate ?? "");
  const [addendumId, setAddendumId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const addendumLabels = useMemo(
    () => Object.fromEntries(contract.addenda.map((item) => [item.id, item.title])),
    [contract.addenda],
  );

  async function execute(payload: object) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/crm/contracts/${contract.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível aplicar a alteração.");
      setMessage("Alteração registrada com sucesso.");
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha inesperada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Histórico de versões</h2>
            <p className="text-sm text-zinc-500">
              Snapshots ativos são somente leitura; alterações começam em novo rascunho.
            </p>
          </div>
          <Badge variant="outline">Origem: {contract.originLabel}</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {contract.versions.map((version) => (
            <article key={version.id} className="rounded-xl border border-zinc-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>Versão {version.number}</strong>
                <Badge variant={version.status === "ativa" ? "default" : "outline"}>
                  {version.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {formatDate(version.startsAt)} — {formatDate(version.endsAt)}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {version.status === "ativa"
                  ? "Snapshot vigente e imutável"
                  : version.status === "rascunho"
                    ? "Editável até a ativação"
                    : "Preservada para auditoria e fechamentos"}
              </p>
            </article>
          ))}
        </div>
        <h3 className="mt-6 font-semibold">Aditivos vinculáveis</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {contract.addenda.length ? (
            contract.addenda.map((item) => (
              <Badge key={item.id} variant="outline">
                {item.title} · {item.status}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-zinc-500">Nenhum aditivo cadastrado.</span>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-bold">Nova condição</h2>
          <p className="text-sm text-zinc-500">
            Clona áreas, regras, parcelas, rateios, participações e comissões.
          </p>
        </div>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Início da nova vigência</span>
          <DateInputBr
            value={effectiveFrom}
            onChange={setEffectiveFrom}
            disabled={!canManage || busy}
            className="!h-10 border-[#dfe5ee] bg-white shadow-sm"
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Aditivo (opcional)</span>
          <Select
            items={addendumLabels}
            value={addendumId || "__none__"}
            disabled={!canManage || busy}
            onValueChange={(next) => setAddendumId(!next || next === "__none__" ? "" : next)}
          >
            <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
              <CrmSelectValue
                value={addendumId || "__none__"}
                labels={{ __none__: "Sem aditivo", ...addendumLabels }}
                placeholder="Sem aditivo"
              />
            </SelectTrigger>
            <CrmSelectContent>
              <CrmSelectItem value="__none__">Sem aditivo</CrmSelectItem>
              {contract.addenda.map((item) => (
                <CrmSelectItem key={item.id} value={item.id}>
                  {item.title}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </label>
        <Button
          className="w-full"
          disabled={!canManage || busy || !source || !effectiveFrom}
          onClick={() =>
            source &&
            execute({
              action: "clone_draft",
              sourceVersionId: source.id,
              effectiveFrom,
              ...(addendumId ? { addendumId } : {}),
            })
          }
        >
          Criar rascunho versionado
        </Button>

        <div className="border-t border-zinc-100 pt-4">
          <label className="block text-sm font-medium">
            Motivo obrigatório
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={!canManage || busy}
              className="mt-1"
              placeholder="Decisão auditável"
            />
          </label>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage || busy || !reason.trim()}
              onClick={() => execute({ action: "suspend_contract", reason })}
            >
              Suspender
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage || busy || !reason.trim()}
              onClick={() => execute({ action: "resume_contract", reason })}
            >
              Retomar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canManage || busy || !reason.trim()}
              onClick={() =>
                execute({
                  action: "end_contract",
                  endedAt: todayYmdBr(),
                  reason,
                })
              }
            >
              Encerrar
            </Button>
          </div>
        </div>
        {message ? (
          <p role="status" className="text-sm text-zinc-600">
            {message}
          </p>
        ) : null}
        {!canManage ? (
          <p className="text-xs text-amber-700">
            Somente administração e controladoria podem alterar versões.
          </p>
        ) : null}
      </section>
    </div>
  );
}
