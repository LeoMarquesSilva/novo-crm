"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger } from "@/components/ui/select";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { formatCompetencyLabel } from "@/lib/crm/competency-month";
import { CONTRACT_CLOSING_STATUS_LABELS, statusLabel } from "@/lib/crm/contract-status-labels";
import { ContractMoneyInput } from "./contract-money-percent-inputs";
import { centsToMaskedBrl } from "./contract-setup-form-helpers";

type Revision = {
  id: string;
  numero: number;
  status: string;
  total_honorarios: number;
  total_tributos: number;
  total_reembolsos: number;
  total_geral: number;
};
type Item = {
  id: string;
  revisao_id: string;
  tipo: string;
  descricao: string;
  valor: number;
  area_id: string | null;
  bloqueante: boolean;
  bloqueio_descricao: string | null;
  resolvido_em: string | null;
  metadados?: { beneficiaryId?: string } | null;
};
type Consumption = {
  id?: string;
  componente_id: string | null;
  area_id: string | null;
  tipo: "processo" | "hora" | "quilometro" | "valor_manual";
  quantidade: number | null;
  valor: number | null;
};
type Resolution = {
  componente_id: string;
  liberado: boolean;
  valor: number | null;
  base_calculo: number | null;
  motivo: string | null;
};
type Component = {
  id: string;
  descricao: string;
  tipo: string;
  area_id: string | null;
  liberacao_manual_necessaria: boolean;
};
type ClosingUser = { id: string; name: string; avatarUrl: string | null };
type Detail = {
  closing: { competencia: string; revisao_atual_id: string | null; versao_id: string };
  revisions: Revision[];
  items: Item[];
  consumptions: Consumption[];
  resolutions: Resolution[];
  components: Component[];
  areas: Array<{ id: string; area_key: string }>;
  users: ClosingUser[];
};
export type ClosingPermissions = {
  canPrepare: boolean;
  canApprove: boolean;
  canRegisterVios: boolean;
};

const money = (value: number) =>
  centsToMaskedBrl(Math.round(value * 100)) ||
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const decimal = (value: number | null) => (value === null ? "" : String(value));
// Valores do fechamento são reais com centavos; o campo com máscara R$ trabalha em centavos.
const reaisToCents = (value: number | null) => (value === null ? null : Math.round(value * 100));
const centsToReais = (cents: string | null) => (cents === null ? null : Number(cents) / 100);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeRawId(value: string) {
  return UUID_RE.test(value.trim()) || /^(area_allocation|partner_share|commission)$/.test(value.trim());
}

export function ContractClosingReview({
  contractId,
  closingId,
  permissions,
}: {
  contractId: string;
  closingId: string;
  permissions: ClosingPermissions;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [reason, setReason] = useState("");
  const [blockerReasons, setBlockerReasons] = useState<Record<string, string>>({});
  const [vios, setVios] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/crm/contracts/${contractId}/closings/${closingId}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Falha ao carregar fechamento.");
    setError(null);
    setDetail({ ...payload, users: payload.users ?? [] });
    setConsumptions(payload.consumptions);
    setResolutions(payload.resolutions);
  }, [contractId, closingId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function request(url: string, method: string, body: object) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "A operação não foi concluída.");
      return false;
    }
    setError(null);
    return true;
  }

  async function act(body: object) {
    setBusy(true);
    try {
      if (await request(`/api/crm/contracts/${contractId}/closings/${closingId}`, "PATCH", body)) {
        setReason("");
        setVios("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  const areaById = useMemo(
    () => new Map((detail?.areas ?? []).map((area) => [area.id, area.area_key])),
    [detail?.areas],
  );
  const usersById = useMemo(
    () => new Map((detail?.users ?? []).map((user) => [user.id, user])),
    [detail?.users],
  );

  if (!detail) {
    return <p className="text-sm text-zinc-500">{error ?? "Carregando memória..."}</p>;
  }

  const currentDetail = detail;
  const revision =
    currentDetail.revisions.find((entry) => entry.id === currentDetail.closing.revisao_atual_id) ??
    currentDetail.revisions[0];
  const items = currentDetail.items.filter((entry) => entry.revisao_id === revision?.id);
  const blocked = items.some((entry) => entry.bloqueante && !entry.resolvido_em);
  const editable = permissions.canPrepare && revision?.status === "em_revisao";

  async function saveInputs() {
    setBusy(true);
    try {
      await saveAndRecalculate();
    } finally {
      setBusy(false);
    }
  }

  async function saveAndRecalculate() {
    const ok = await request(`/api/crm/contracts/${contractId}/consumptions`, "PUT", {
      competency: currentDetail.closing.competencia,
      versionId: currentDetail.closing.versao_id,
      items: consumptions.map((entry) => ({
        id: entry.id,
        componentId: entry.componente_id,
        areaId: entry.area_id,
        kind: entry.tipo,
        quantity: entry.tipo === "valor_manual" ? null : entry.quantidade,
        amount: entry.tipo === "valor_manual" ? entry.valor : null,
      })),
      resolutions: resolutions.map((entry) => ({
        componentId: entry.componente_id,
        released: entry.liberado,
        amount: decimal(entry.valor) || null,
        base: decimal(entry.base_calculo) || null,
        reason: entry.motivo,
      })),
    });
    if (!ok) return;
    const recalculated = await request(`/api/crm/contracts/${contractId}/closings`, "POST", {
      competency: currentDetail.closing.competencia,
      expectedRevision: revision.numero,
    });
    if (recalculated) await load();
  }

  const manualComponents = detail.components.filter((component) => component.liberacao_manual_necessaria);

  function renderItemLabel(entry: Item) {
    const areaName = entry.area_id ? areaById.get(entry.area_id) : null;
    const beneficiaryId =
      entry.metadados && typeof entry.metadados === "object"
        ? entry.metadados.beneficiaryId
        : undefined;
    const user = beneficiaryId ? usersById.get(beneficiaryId) : null;

    if (entry.tipo === "area_allocation" && areaName) {
      return <AreaIconLabel area={areaName} size="xs" />;
    }
    if ((entry.tipo === "partner_share" || entry.tipo === "commission") && user) {
      return (
        <CrmUserLabel name={user.name} avatarUrl={user.avatarUrl} size="xs" variant="inline" />
      );
    }
    if (looksLikeRawId(entry.descricao)) {
      if (areaName) return <AreaIconLabel area={areaName} size="xs" />;
      if (user) {
        return (
          <CrmUserLabel name={user.name} avatarUrl={user.avatarUrl} size="xs" variant="inline" />
        );
      }
      return <span className="text-slate-500">Item do fechamento</span>;
    }
    return <span>{entry.descricao}</span>;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-zinc-900">
          {formatCompetencyLabel(detail.closing.competencia)} · revisão {revision?.numero}
        </strong>
        <Badge variant="outline">{statusLabel(CONTRACT_CLOSING_STATUS_LABELS, revision?.status)}</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {(
          [
            ["Honorários", revision?.total_honorarios],
            ["Tributos", revision?.total_tributos],
            ["Reembolsos", revision?.total_reembolsos],
            ["Total", revision?.total_geral],
          ] as const
        ).map(([label, value]) => (
          <div className="rounded-xl border border-[#dfe5ee] bg-zinc-50 p-3" key={label}>
            <small className="text-xs text-zinc-500">{label}</small>
            <p className="font-bold tabular-nums text-zinc-900">{money(Number(value ?? 0))}</p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <div className="flex justify-between">
          <h4 className="font-semibold text-zinc-900">Consumos mensais</h4>
          {editable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setConsumptions([
                  ...consumptions,
                  {
                    componente_id: detail.components[0]?.id ?? null,
                    area_id: detail.areas[0]?.id ?? null,
                    tipo: "hora",
                    quantidade: 0,
                    valor: null,
                  },
                ])
              }
            >
              Adicionar
            </Button>
          ) : null}
        </div>
        {consumptions.map((entry, index) => {
          const areaName = entry.area_id ? areaById.get(entry.area_id) : null;
          const componentLabels = Object.fromEntries(
            detail.components.map((component) => [component.id, component.descricao]),
          );
          const areaLabels = Object.fromEntries(
            detail.areas.map((area) => [area.id, area.area_key]),
          );
          const kindLabels = {
            processo: "Processos",
            hora: "Horas",
            quilometro: "KM",
            valor_manual: "Valor manual",
          } as const;
          return (
            <div
              className="grid gap-2 rounded-xl border border-[#dfe5ee] bg-white p-3 shadow-sm md:grid-cols-4"
              key={entry.id ?? index}
            >
              <Select
                items={kindLabels}
                value={entry.tipo}
                disabled={!editable}
                onValueChange={(next) => {
                  if (!next) return;
                  setConsumptions(
                    consumptions.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            tipo: next as Consumption["tipo"],
                            quantidade: next === "valor_manual" ? null : 0,
                            valor: next === "valor_manual" ? 0 : null,
                          }
                        : item,
                    ),
                  );
                }}
              >
                <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                  <CrmSelectValue value={entry.tipo} labels={kindLabels} placeholder="Tipo" />
                </SelectTrigger>
                <CrmSelectContent>
                  <CrmSelectItem value="processo">Processos</CrmSelectItem>
                  <CrmSelectItem value="hora">Horas</CrmSelectItem>
                  <CrmSelectItem value="quilometro">KM</CrmSelectItem>
                  <CrmSelectItem value="valor_manual">Valor manual</CrmSelectItem>
                </CrmSelectContent>
              </Select>

              <Select
                items={componentLabels}
                value={entry.componente_id ?? ""}
                disabled={!editable}
                onValueChange={(next) =>
                  setConsumptions(
                    consumptions.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, componente_id: next || null }
                        : item,
                    ),
                  )
                }
              >
                <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                  <CrmSelectValue
                    value={entry.componente_id}
                    labels={componentLabels}
                    placeholder="Componente"
                  />
                </SelectTrigger>
                <CrmSelectContent>
                  {detail.components.map((component) => (
                    <CrmSelectItem key={component.id} value={component.id}>
                      {component.descricao}
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
              </Select>

              <Select
                items={areaLabels}
                value={entry.area_id || "__none__"}
                disabled={!editable}
                onValueChange={(next) =>
                  setConsumptions(
                    consumptions.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            area_id: !next || next === "__none__" ? null : next,
                          }
                        : item,
                    ),
                  )
                }
              >
                <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                  {areaName ? (
                    <AreaIconLabel area={areaName} size="xs" />
                  ) : (
                    <span className="text-slate-400">Sem área</span>
                  )}
                </SelectTrigger>
                <CrmSelectContent>
                  <CrmSelectItem value="__none__">Sem área</CrmSelectItem>
                  {detail.areas.map((area) => (
                    <CrmSelectItem key={area.id} value={area.id}>
                      <AreaIconLabel area={area.area_key} size="xs" />
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
              </Select>
              <div className="flex flex-col gap-1">
                {entry.tipo === "valor_manual" ? (
                  <ContractMoneyInput
                    disabled={!editable}
                    cents={reaisToCents(entry.valor)}
                    onCentsChange={(cents) =>
                      setConsumptions(
                        consumptions.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, valor: centsToReais(cents) ?? 0 } : item,
                        ),
                      )
                    }
                  />
                ) : (
                  <Input
                    disabled={!editable}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={decimal(entry.quantidade)}
                    onChange={(event) =>
                      setConsumptions(
                        consumptions.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, quantidade: Number(event.target.value) } : item,
                        ),
                      )
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
      </section>

      {manualComponents.length ? (
        <section className="space-y-2">
          <h4 className="font-semibold text-zinc-900">Liberações desta competência</h4>
          {manualComponents.map((component) => {
            const current = resolutions.find((entry) => entry.componente_id === component.id) ?? {
              componente_id: component.id,
              liberado: false,
              valor: null,
              base_calculo: null,
              motivo: null,
            };
            const update = (patch: Partial<Resolution>) =>
              setResolutions([
                ...resolutions.filter((entry) => entry.componente_id !== component.id),
                { ...current, ...patch },
              ]);
            const areaName = component.area_id ? areaById.get(component.area_id) : null;
            return (
              <div key={component.id} className="grid gap-2 rounded-xl border border-[#dfe5ee] bg-white p-3 shadow-sm md:grid-cols-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    disabled={!editable}
                    type="checkbox"
                    checked={current.liberado}
                    onChange={(event) => update({ liberado: event.target.checked })}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{component.descricao}</span>
                    {areaName ? (
                      <span className="mt-1 block">
                        <AreaIconLabel area={areaName} size="xs" />
                      </span>
                    ) : null}
                  </span>
                </label>
                <ContractMoneyInput
                  disabled={!editable}
                  placeholder="Valor (R$)"
                  cents={reaisToCents(current.valor)}
                  onCentsChange={(cents) => update({ valor: centsToReais(cents) })}
                />
                <ContractMoneyInput
                  disabled={!editable}
                  placeholder="Base (R$)"
                  cents={reaisToCents(current.base_calculo)}
                  onCentsChange={(cents) => update({ base_calculo: centsToReais(cents) })}
                />
                <Input
                  disabled={!editable}
                  placeholder="Motivo"
                  value={current.motivo ?? ""}
                  onChange={(event) => update({ motivo: event.target.value || null })}
                />
              </div>
            );
          })}
        </section>
      ) : null}

      {editable ? (
        <Button type="button" disabled={busy} onClick={saveInputs}>
          Salvar entradas e recalcular
        </Button>
      ) : null}

      {items
        .filter((entry) => entry.bloqueante)
        .map((entry) => (
          <div key={entry.id} className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">{entry.bloqueio_descricao}</p>
            {!entry.resolvido_em && editable ? (
              <div className="mt-2 flex gap-2">
                <Input
                  value={blockerReasons[entry.id] ?? ""}
                  onChange={(event) =>
                    setBlockerReasons({ ...blockerReasons, [entry.id]: event.target.value })
                  }
                  placeholder="Justificativa (mín. 3 caracteres)"
                />
                <Button
                  type="button"
                  disabled={busy || (blockerReasons[entry.id] ?? "").trim().length < 3}
                  onClick={() =>
                    act({
                      action: "resolve_blocker",
                      itemId: entry.id,
                      expectedRevision: revision.numero,
                      resolution: "nao_cobrar",
                      reason: (blockerReasons[entry.id] ?? "").trim(),
                    })
                  }
                >
                  Não cobrar
                </Button>
              </div>
            ) : null}
          </div>
        ))}

      {(
        [
          ["Memória", ["memory", "charge", "tax", "reimbursement"], "Nenhum item calculado nesta revisão"],
          ["Rateios", ["area_allocation"], "Nenhum rateio neste mês"],
          ["Participações", ["partner_share"], "Nenhuma participação neste mês"],
          ["Comissões", ["commission"], "Nenhuma comissão neste mês"],
        ] as const
      ).map(([title, kinds, emptyText]) => {
        const sectionItems = items.filter((entry) =>
          (kinds as ReadonlyArray<string>).includes(entry.tipo),
        );
        return (
          <section key={title}>
            <h4 className="font-semibold text-zinc-900">{title}</h4>
            {sectionItems.length ? (
              sectionItems.map((entry) => (
                <div
                  className="flex justify-between gap-3 border-b border-zinc-100 py-2 text-sm"
                  key={entry.id}
                >
                  <div className="min-w-0">{renderItemLabel(entry)}</div>
                  <strong className="shrink-0 tabular-nums">{money(entry.valor)}</strong>
                </div>
              ))
            ) : (
              <p className="py-2 text-sm text-zinc-500">{emptyText}</p>
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        {revision?.status === "em_revisao" && permissions.canApprove ? (
          <>
            <Button
              type="button"
              disabled={blocked || busy}
              onClick={() => act({ action: "approve", expectedRevision: revision.numero })}
            >
              Aprovar
            </Button>
            {blocked ? (
              <span className="text-sm text-zinc-500">Resolva os bloqueios acima antes de aprovar.</span>
            ) : null}
          </>
        ) : null}
        {revision?.status === "em_revisao" && !permissions.canApprove ? (
          <span className="text-sm text-zinc-500">
            Aguardando aprovação da controladoria.
            {blocked ? " Há bloqueios pendentes acima." : ""}
          </span>
        ) : null}
        {revision && ["aprovado", "lancado_vios"].includes(revision.status) && permissions.canApprove ? (
          <>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo da nova revisão (mín. 3 caracteres)"
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy || reason.trim().length < 3}
              onClick={() =>
                act({
                  action: "new_revision",
                  previousRevisionId: revision.id,
                  expectedRevision: revision.numero,
                  reason: reason.trim(),
                })
              }
            >
              Nova revisão
            </Button>
          </>
        ) : null}
        {revision?.status === "aprovado" && permissions.canRegisterVios ? (
          <>
            <Input
              value={vios}
              onChange={(event) => setVios(event.target.value)}
              placeholder="Referência VIOS"
            />
            <Button
              type="button"
              disabled={busy || !vios.trim()}
              onClick={() =>
                act({
                  action: "register_vios",
                  expectedRevision: revision.numero,
                  reference: vios.trim(),
                })
              }
            >
              Registrar VIOS
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
