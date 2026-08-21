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

const RESPONSIBLE_ROLE_LABELS: Record<string, string> = {
  operacional: "Operacional",
  faturamento: "Faturamento",
  comercial: "Comercial",
  gestor: "Gestor",
  socio: "Sócio",
  renovacao: "Renovação",
};

const RESPONSIBLE_ROLE_OPTIONS = Object.keys(RESPONSIBLE_ROLE_LABELS);

export type ContractResponsibleDraft = { id: string; role: string };

export type ContractResponsibleUserOption = {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
};

type Props = {
  value: ContractResponsibleDraft[];
  users: ContractResponsibleUserOption[];
  disabled?: boolean;
  onChange: (next: ContractResponsibleDraft[]) => void;
};

export function ContractResponsiblesEditor({ value, users, disabled, onChange }: Props) {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const availableUsers = users.filter((user) => !value.some((entry) => entry.id === user.id));
  const [open, setOpen] = useState(false);
  const [draftUserId, setDraftUserId] = useState("");
  const [draftRole, setDraftRole] = useState("operacional");

  function updateAt(index: number, patch: Partial<ContractResponsibleDraft>) {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  }

  function removeAt(index: number) {
    onChange(value.filter((_, entryIndex) => entryIndex !== index));
  }

  function openAddModal() {
    setDraftUserId("");
    setDraftRole("operacional");
    setOpen(true);
  }

  function confirmAdd() {
    if (!draftUserId) return;
    if (value.some((entry) => entry.id === draftUserId)) return;
    onChange([...value, { id: draftUserId, role: draftRole }]);
    setOpen(false);
    setDraftUserId("");
    setDraftRole("operacional");
  }

  const draftUser = draftUserId ? usersById.get(draftUserId) : null;
  const availableLabels = Object.fromEntries(availableUsers.map((user) => [user.id, user.name]));

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#102033]">Responsáveis</p>
          <p className="text-xs text-slate-500">Escolha a pessoa e o papel no contrato.</p>
        </div>
        {disabled ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openAddModal}
            disabled={availableUsers.length === 0}
          >
            <Plus className="size-4" />
            Adicionar
          </Button>
        )}
      </div>

      {value.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#dfe5ee] bg-[#f8f9fb] px-4 py-8 text-center text-sm text-slate-500">
          Nenhum responsável cadastrado. Adicione ao menos um para salvar a configuração.
        </div>
      ) : (
        <ul className="space-y-3">
          {value.map((entry, index) => {
            const user = usersById.get(entry.id);
            const personLabels = Object.fromEntries(users.map((option) => [option.id, option.name]));
            const selectableUsers = users.filter(
              (option) => option.id === entry.id || !value.some((other) => other.id === option.id),
            );
            return (
              <li
                key={`${entry.id}-${index}`}
                className="flex flex-col gap-3 rounded-2xl border border-[#dfe5ee] bg-white p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  {user ? (
                    <CrmUserLabel
                      name={user.name}
                      avatarUrl={user.avatarUrl}
                      size="md"
                      variant="inline"
                      sublabel={RESPONSIBLE_ROLE_LABELS[entry.role] ?? entry.role}
                    />
                  ) : (
                    <p className="text-sm text-rose-700">Usuário não encontrado</p>
                  )}
                </div>

                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <Select
                    items={personLabels}
                    value={entry.id}
                    disabled={disabled}
                    onValueChange={(nextId) => {
                      if (!nextId) return;
                      updateAt(index, { id: nextId });
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
                        <CrmSelectValue value={entry.id} labels={personLabels} placeholder="Pessoa" />
                      )}
                    </SelectTrigger>
                    <CrmSelectContent side="bottom" align="start">
                      {selectableUsers.map((option) => (
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

                  <Select
                    items={RESPONSIBLE_ROLE_LABELS}
                    value={entry.role}
                    disabled={disabled}
                    onValueChange={(nextRole) => {
                      if (!nextRole) return;
                      updateAt(index, { role: nextRole });
                    }}
                  >
                    <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                      <CrmSelectValue
                        value={entry.role}
                        labels={RESPONSIBLE_ROLE_LABELS}
                        placeholder="Papel"
                      />
                    </SelectTrigger>
                    <CrmSelectContent side="bottom" align="start">
                      {RESPONSIBLE_ROLE_OPTIONS.map((role) => (
                        <CrmSelectItem key={role} value={role}>
                          {RESPONSIBLE_ROLE_LABELS[role]}
                        </CrmSelectItem>
                      ))}
                      {entry.role && !RESPONSIBLE_ROLE_LABELS[entry.role] ? (
                        <CrmSelectItem value={entry.role}>{entry.role}</CrmSelectItem>
                      ) : null}
                    </CrmSelectContent>
                  </Select>
                </div>

                {disabled ? null : (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-slate-500 hover:text-rose-700"
                    onClick={() => removeAt(index)}
                    aria-label={`Remover ${user?.name ?? "responsável"}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog modal={false} open={open} onOpenChange={setOpen}>
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
            <DialogTitle>Adicionar responsável</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <label className="space-y-1.5 text-sm font-medium text-[#102033]">
              <span>Pessoa</span>
              <Select
                items={availableLabels}
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
                  {availableUsers.map((option) => (
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

            <label className="space-y-1.5 text-sm font-medium text-[#102033]">
              <span>Papel</span>
              <Select
                items={RESPONSIBLE_ROLE_LABELS}
                value={draftRole}
                onValueChange={(next) => {
                  if (!next) return;
                  setDraftRole(next);
                }}
              >
                <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                  <CrmSelectValue value={draftRole} labels={RESPONSIBLE_ROLE_LABELS} placeholder="Papel" />
                </SelectTrigger>
                <CrmSelectContent side="bottom" align="start">
                  {RESPONSIBLE_ROLE_OPTIONS.map((role) => (
                    <CrmSelectItem key={role} value={role}>
                      {RESPONSIBLE_ROLE_LABELS[role]}
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
              </Select>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
