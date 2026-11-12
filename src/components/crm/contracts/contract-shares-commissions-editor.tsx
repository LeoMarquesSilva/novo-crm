"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Plus, Trash2, Unlink } from "lucide-react";

import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectTrigger } from "@/components/ui/select";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";
import { cn } from "@/lib/utils";
import { summarizePartnerShareTotals } from "@/modules/contracts/domain/contract-validation";
import type { ContractConfigurationDraft } from "@/modules/contracts/infrastructure/contract-queries";

import { ContractMoneyInput, ContractPercentInput } from "./contract-money-percent-inputs";
import { basisPointsToPercentText, newContractDraftId } from "./contract-setup-form-helpers";

type PartnerShare = ContractConfigurationDraft["version"]["partnerShares"][number];
type Commission = ContractConfigurationDraft["version"]["commissions"][number];
type ComponentOption = Pick<ContractConfigurationDraft["version"]["components"][number], "id" | "description">;
type UserOption = { id: string; name: string; role: string; avatarUrl?: string | null };
type AddTarget = "partner" | "commission" | null;

type Props = {
  partnerShares: PartnerShare[];
  commissions: Commission[];
  /** Componentes da versão: rótulo do grupo e aviso de vínculo com componente que não existe mais. */
  components: ComponentOption[];
  users: UserOption[];
  disabled?: boolean;
  onPartnerSharesChange: (next: PartnerShare[]) => void;
  onCommissionsChange: (next: Commission[]) => void;
};

const MODE_LABELS = { percentual: "Percentual", valor: "Valor fixo" } as const;
const FULL_SHARE = 10_000;

/** Tira o vínculo com o componente: a regra passa a valer para todos os componentes elegíveis. */
function withoutComponent<T extends { componentId?: string }>(entry: T): T {
  const next = { ...entry };
  delete next.componentId;
  return next;
}

export function ContractSharesCommissionsEditor({
  partnerShares,
  commissions,
  components,
  users,
  disabled,
  onPartnerSharesChange,
  onCommissionsChange,
}: Props) {
  const userLabels = Object.fromEntries(users.map((user) => [user.id, user.name]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [draftUserId, setDraftUserId] = useState("");

  function openAdd(target: Exclude<AddTarget, null>) {
    setDraftUserId("");
    setAddTarget(target);
  }

  function confirmAdd() {
    if (!draftUserId || !addTarget) return;
    if (addTarget === "partner") {
      // O novo sócio já vem com o que falta para 100% (grupo sem componente, o que o botão cria).
      const assigned = partnerShares
        .filter((share) => !share.componentId)
        .reduce((sum, share) => sum + share.percentageBasisPoints, 0);
      onPartnerSharesChange([
        ...partnerShares,
        {
          id: newContractDraftId(),
          beneficiaryId: draftUserId,
          percentageBasisPoints: Math.max(0, FULL_SHARE - assigned),
        },
      ]);
    } else {
      onCommissionsChange([
        ...commissions,
        {
          id: newContractDraftId(),
          beneficiaryId: draftUserId,
          mode: "percentual",
          percentageBasisPoints: 500,
        },
      ]);
    }
    setAddTarget(null);
    setDraftUserId("");
  }

  const draftUser = draftUserId ? usersById.get(draftUserId) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-3">
        <Header
          title="Participações de sócios"
          subtitle="Percentual da receita elegível."
          disabled={disabled || users.length === 0}
          onAdd={() => openAdd("partner")}
          addLabel="Adicionar sócio"
        />
        {partnerShares.length === 0 ? (
          <EmptyState text="Nenhuma participação cadastrada." />
        ) : (
          <ul className="space-y-3">
            {partnerShares.map((entry, index) => {
              const user = usersById.get(entry.beneficiaryId);
              return (
                <li key={entry.id} className="space-y-3 rounded-2xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                  {user ? (
                    <CrmUserLabel
                      name={user.name}
                      avatarUrl={user.avatarUrl}
                      size="md"
                      variant="inline"
                    />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Sócio">
                      <Select
                        items={userLabels}
                        value={entry.beneficiaryId}
                        disabled={disabled}
                        onValueChange={(next) => {
                          if (!next) return;
                          onPartnerSharesChange(
                            partnerShares.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, beneficiaryId: next } : item,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                          {user ? (
                            <CrmUserLabel
                              name={user.name}
                              avatarUrl={user.avatarUrl}
                              size="xs"
                              variant="inline"
                            />
                          ) : (
                            <span className="text-muted-foreground">Selecione</span>
                          )}
                        </SelectTrigger>
                        <CrmSelectContent side="bottom" align="start">
                          {users.map((option) => (
                            <CrmSelectItem key={option.id} value={option.id}>
                              <CrmUserLabel
                                name={option.name}
                                avatarUrl={option.avatarUrl}
                                size="xs"
                                variant="inline"
                              />
                            </CrmSelectItem>
                          ))}
                        </CrmSelectContent>
                      </Select>
                    </Field>
                    <Field label="Participação">
                      <ContractPercentInput
                        disabled={disabled}
                        basisPoints={entry.percentageBasisPoints}
                        onBasisPointsChange={(basisPoints) =>
                          onPartnerSharesChange(
                            partnerShares.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, percentageBasisPoints: basisPoints ?? 0 }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <ComponentScope
                    componentId={entry.componentId}
                    componentsById={componentsById}
                    kind="participação"
                    disabled={disabled}
                    onDetach={() =>
                      onPartnerSharesChange(
                        partnerShares.map((item, itemIndex) =>
                          itemIndex === index ? withoutComponent(item) : item,
                        ),
                      )
                    }
                  />
                  {disabled ? null : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-slate-500 hover:text-rose-700"
                      onClick={() =>
                        onPartnerSharesChange(partnerShares.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <Trash2 className="size-4" />
                      Remover
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {partnerShares.length > 0 ? (
          <PartnerShareTotals partnerShares={partnerShares} componentsById={componentsById} />
        ) : null}
      </section>

      <section className="space-y-3">
        <Header
          title="Comissões"
          subtitle="Comissão comercial sobre a base elegível."
          disabled={disabled || users.length === 0}
          onAdd={() => openAdd("commission")}
          addLabel="Adicionar comissão"
        />
        {commissions.length === 0 ? (
          <EmptyState text="Nenhuma comissão cadastrada." />
        ) : (
          <ul className="space-y-3">
            {commissions.map((entry, index) => {
              const user = usersById.get(entry.beneficiaryId);
              return (
                <li key={entry.id} className="space-y-3 rounded-2xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                  {user ? (
                    <CrmUserLabel
                      name={user.name}
                      avatarUrl={user.avatarUrl}
                      size="md"
                      variant="inline"
                    />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Beneficiário">
                      <Select
                        items={userLabels}
                        value={entry.beneficiaryId}
                        disabled={disabled}
                        onValueChange={(next) => {
                          if (!next) return;
                          onCommissionsChange(
                            commissions.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, beneficiaryId: next } : item,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                          {user ? (
                            <CrmUserLabel
                              name={user.name}
                              avatarUrl={user.avatarUrl}
                              size="xs"
                              variant="inline"
                            />
                          ) : (
                            <span className="text-muted-foreground">Selecione</span>
                          )}
                        </SelectTrigger>
                        <CrmSelectContent side="bottom" align="start">
                          {users.map((option) => (
                            <CrmSelectItem key={option.id} value={option.id}>
                              <CrmUserLabel
                                name={option.name}
                                avatarUrl={option.avatarUrl}
                                size="xs"
                                variant="inline"
                              />
                            </CrmSelectItem>
                          ))}
                        </CrmSelectContent>
                      </Select>
                    </Field>
                    <Field label="Modo">
                      <Select
                        items={MODE_LABELS}
                        value={entry.mode}
                        disabled={disabled}
                        onValueChange={(next) => {
                          if (next === "percentual") {
                            onCommissionsChange(
                              commissions.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      id: item.id,
                                      beneficiaryId: item.beneficiaryId,
                                      ...(item.componentId ? { componentId: item.componentId } : {}),
                                      mode: "percentual",
                                      percentageBasisPoints:
                                        item.mode === "percentual" ? item.percentageBasisPoints : 500,
                                    }
                                  : item,
                              ),
                            );
                            return;
                          }
                          if (next === "valor") {
                            onCommissionsChange(
                              commissions.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      id: item.id,
                                      beneficiaryId: item.beneficiaryId,
                                      ...(item.componentId ? { componentId: item.componentId } : {}),
                                      mode: "valor",
                                      amountCents: item.mode === "valor" ? item.amountCents : "0",
                                    }
                                  : item,
                              ),
                            );
                          }
                        }}
                      >
                        <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                          <CrmSelectValue value={entry.mode} labels={MODE_LABELS} placeholder="Modo" />
                        </SelectTrigger>
                        <CrmSelectContent side="bottom" align="start">
                          <CrmSelectItem value="percentual">Percentual</CrmSelectItem>
                          <CrmSelectItem value="valor">Valor fixo</CrmSelectItem>
                        </CrmSelectContent>
                      </Select>
                    </Field>
                    {entry.mode === "percentual" ? (
                      <Field label="Percentual">
                        <ContractPercentInput
                          disabled={disabled}
                          basisPoints={entry.percentageBasisPoints}
                          onBasisPointsChange={(basisPoints) =>
                            onCommissionsChange(
                              commissions.map((item, itemIndex) =>
                                itemIndex === index && item.mode === "percentual"
                                  ? { ...item, percentageBasisPoints: basisPoints ?? 0 }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    ) : (
                      <Field label="Valor">
                        <ContractMoneyInput
                          disabled={disabled}
                          cents={entry.amountCents}
                          onCentsChange={(cents) =>
                            onCommissionsChange(
                              commissions.map((item, itemIndex) =>
                                itemIndex === index && item.mode === "valor"
                                  ? { ...item, amountCents: cents ?? "0" }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    )}
                  </div>
                  <ComponentScope
                    componentId={entry.componentId}
                    componentsById={componentsById}
                    kind="comissão"
                    disabled={disabled}
                    onDetach={() =>
                      onCommissionsChange(
                        commissions.map((item, itemIndex) =>
                          itemIndex === index ? withoutComponent(item) : item,
                        ),
                      )
                    }
                  />
                  {disabled ? null : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-slate-500 hover:text-rose-700"
                      onClick={() =>
                        onCommissionsChange(commissions.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <Trash2 className="size-4" />
                      Remover
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog
        modal={false}
        open={addTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setAddTarget(null);
            setDraftUserId("");
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {addTarget === "commission" ? "Adicionar comissão" : "Adicionar sócio"}
            </DialogTitle>
          </DialogHeader>
          <label className="space-y-1.5 text-sm font-medium text-[#102033]">
            <span>Pessoa</span>
            <Select
              items={userLabels}
              value={draftUserId}
              onValueChange={(next) => setDraftUserId(next ?? "")}
            >
              <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                {draftUser ? (
                  <CrmUserLabel
                    name={draftUser.name}
                    avatarUrl={draftUser.avatarUrl}
                    size="xs"
                    variant="inline"
                  />
                ) : (
                  <span className="text-muted-foreground">Selecione a pessoa</span>
                )}
              </SelectTrigger>
              <CrmSelectContent side="bottom" align="start">
                {users.map((option) => (
                  <CrmSelectItem key={option.id} value={option.id}>
                    <CrmUserLabel
                      name={option.name}
                      avatarUrl={option.avatarUrl}
                      size="xs"
                      variant="inline"
                    />
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddTarget(null);
                setDraftUserId("");
              }}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={confirmAdd} disabled={!draftUserId}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Soma das participações por grupo (como o rateio do cadastro: "Fecha 100%", "Faltam X%",
 * "Passou X%"). O rascunho salva fora de 100%; a ativação exige 100% em cada grupo.
 */
function PartnerShareTotals({
  partnerShares,
  componentsById,
}: {
  partnerShares: PartnerShare[];
  componentsById: Map<string, ComponentOption>;
}) {
  // Grupo de componente que não existe mais já tem o aviso no cartão; fica fora da soma.
  const groups = summarizePartnerShareTotals(
    partnerShares.filter((share) => !share.componentId || componentsById.has(share.componentId)),
  );
  if (groups.length === 0) return null;
  const showGroupLabels = groups.length > 1 || groups[0]!.componentId !== null;
  const anyOpen = groups.some((group) => group.totalBasisPoints !== FULL_SHARE);

  return (
    <div className="space-y-2">
      <div
        className="overflow-hidden rounded-2xl border border-[#dfe5ee] bg-[#f8f9fb]"
        aria-live="polite"
      >
        {groups.map((group) => {
          const diff = FULL_SHARE - group.totalBasisPoints;
          const label = group.componentId
            ? `Componente “${componentsById.get(group.componentId)?.description ?? "—"}”`
            : "Todos os componentes elegíveis";
          return (
            <div
              key={group.componentId ?? "__default"}
              className="flex items-center justify-between gap-3 border-t border-[#dfe5ee] px-4 py-2.5 first:border-t-0"
            >
              <div className="min-w-0">
                {showGroupLabels ? <p className="truncate text-xs text-slate-500">{label}</p> : null}
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-sm font-medium",
                    diff === 0 ? "text-success-text" : diff > 0 ? "text-warning-text" : "text-danger-text",
                  )}
                >
                  {diff === 0 ? (
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                  )}
                  {diff === 0
                    ? "Fecha 100%"
                    : diff > 0
                      ? `Faltam ${basisPointsToPercentText(diff)}%`
                      : `Passou ${basisPointsToPercentText(-diff)}%`}
                </span>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-[#102033]">
                Total {basisPointsToPercentText(group.totalBasisPoints)}%
              </span>
            </div>
          );
        })}
      </div>
      {anyOpen ? (
        <p className="text-xs text-slate-500">
          O rascunho pode ser salvo assim; para ativar o contrato a participação precisa fechar 100%.
        </p>
      ) : null}
    </div>
  );
}

/** Vínculo da regra com um componente: rótulo, ou aviso quando o componente não existe mais. */
function ComponentScope({
  componentId,
  componentsById,
  kind,
  disabled,
  onDetach,
}: {
  componentId?: string;
  componentsById: Map<string, ComponentOption>;
  kind: "participação" | "comissão";
  disabled?: boolean;
  onDetach: () => void;
}) {
  if (!componentId) return null;
  const component = componentsById.get(componentId);
  if (component) {
    return (
      <p className="text-xs text-slate-500">
        Só sobre o componente <span className="font-medium text-[#102033]">{component.description}</span>
      </p>
    );
  }
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-warning-border bg-warning-bg px-3 py-2.5 text-sm text-warning-text sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex gap-1.5">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Esta {kind} está ligada a um componente que não existe mais (removido ou recriado em
          Componentes e condições). O rascunho não salva assim.
        </span>
      </p>
      {disabled ? null : (
        <Button type="button" size="sm" variant="outline" className="shrink-0 bg-white" onClick={onDetach}>
          <Unlink className="size-3.5" aria-hidden />
          Aplicar a todos os componentes
        </Button>
      )}
    </div>
  );
}

function Header({
  title,
  subtitle,
  disabled,
  onAdd,
  addLabel,
}: {
  title: string;
  subtitle: string;
  disabled?: boolean;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-[#102033]">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {disabled ? null : (
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus className="size-4" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-[#102033]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#dfe5ee] bg-[#f8f9fb] px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
