"use client";

import { Plus, Trash2 } from "lucide-react";

import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger } from "@/components/ui/select";

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

  function updateAt(index: number, patch: Partial<ContractResponsibleDraft>) {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  }

  function removeAt(index: number) {
    onChange(value.filter((_, entryIndex) => entryIndex !== index));
  }

  function addResponsible() {
    const nextUser = availableUsers[0];
    if (!nextUser) return;
    onChange([...value, { id: nextUser.id, role: "operacional" }]);
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-700">Responsáveis</p>
          <p className="text-xs text-zinc-500">Pessoas operacionais do contrato (não use JSON).</p>
        </div>
        {disabled ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addResponsible}
            disabled={availableUsers.length === 0}
          >
            <Plus className="size-4" />
            Adicionar
          </Button>
        )}
      </div>

      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
          Nenhum responsável cadastrado. Adicione ao menos um para salvar a configuração.
        </div>
      ) : (
        <ul className="space-y-2">
          {value.map((entry, index) => {
            const user = usersById.get(entry.id);
            const personLabels = Object.fromEntries(users.map((option) => [option.id, option.name]));
            const selectableUsers = users.filter(
              (option) => option.id === entry.id || !value.some((other) => other.id === option.id),
            );
            return (
              <li
                key={`${entry.id}-${index}`}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  {user ? (
                    <CrmUserLabel
                      name={user.name}
                      avatarUrl={user.avatarUrl}
                      size="sm"
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
                    <SelectTrigger className="h-10 w-full">
                      <CrmSelectValue value={entry.id} labels={personLabels} placeholder="Pessoa" />
                    </SelectTrigger>
                    <CrmSelectContent>
                      {selectableUsers.map((option) => (
                        <CrmSelectItem key={option.id} value={option.id}>
                          {option.name}
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
                    <SelectTrigger className="h-10 w-full">
                      <CrmSelectValue
                        value={entry.role}
                        labels={RESPONSIBLE_ROLE_LABELS}
                        placeholder="Papel"
                      />
                    </SelectTrigger>
                    <CrmSelectContent>
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
                    className="text-zinc-500 hover:text-rose-700"
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
    </div>
  );
}
