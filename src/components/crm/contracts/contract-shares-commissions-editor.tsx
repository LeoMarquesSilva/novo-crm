"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

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
import type { ContractConfigurationDraft } from "@/modules/contracts/infrastructure/contract-queries";

import { ContractMoneyInput, ContractPercentInput } from "./contract-money-percent-inputs";
import { newContractDraftId } from "./contract-setup-form-helpers";

type PartnerShare = ContractConfigurationDraft["version"]["partnerShares"][number];
type Commission = ContractConfigurationDraft["version"]["commissions"][number];
type UserOption = { id: string; name: string; role: string; avatarUrl?: string | null };
type AddTarget = "partner" | "commission" | null;

type Props = {
  partnerShares: PartnerShare[];
  commissions: Commission[];
  users: UserOption[];
  disabled?: boolean;
  onPartnerSharesChange: (next: PartnerShare[]) => void;
  onCommissionsChange: (next: Commission[]) => void;
};

const MODE_LABELS = { percentual: "Percentual", valor: "Valor fixo" } as const;

export function ContractSharesCommissionsEditor({
  partnerShares,
  commissions,
  users,
  disabled,
  onPartnerSharesChange,
  onCommissionsChange,
}: Props) {
  const userLabels = Object.fromEntries(users.map((user) => [user.id, user.name]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [draftUserId, setDraftUserId] = useState("");

  function openAdd(target: Exclude<AddTarget, null>) {
    setDraftUserId("");
    setAddTarget(target);
  }

  function confirmAdd() {
    if (!draftUserId || !addTarget) return;
    if (addTarget === "partner") {
      onPartnerSharesChange([
        ...partnerShares,
        { id: newContractDraftId(), beneficiaryId: draftUserId, percentageBasisPoints: 0 },
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
                            <span className="text-slate-400">Selecione</span>
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
                            <span className="text-slate-400">Selecione</span>
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
                  <span className="text-slate-400">Selecione a pessoa</span>
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
