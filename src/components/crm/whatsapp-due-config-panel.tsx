"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Wifi,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhatsappDueUseCase = "due_diligence" | "lead_notification" | "pipeline_alert" | "general";

type UseCase = WhatsappDueUseCase;

export interface WhatsappDueConfig {
  id: string;
  label: string;
  destination: string;
  destination_type: "number" | "group";
  is_active: boolean;
  notes: string | null;
  use_case: UseCase;
}

type WhatsappDueConfigForm = Omit<WhatsappDueConfig, "id"> & { id?: string };

interface WhatsappDueConfigPanelProps {
  initialConfig: WhatsappDueConfig | null;
  initialConfigs?: WhatsappDueConfig[];
}

type ApiPayload = { data?: WhatsappDueConfig; error?: string };
type DeletePayload = { ok?: boolean; error?: string };
type EvolutionAddressBookPayload = {
  instance?: string;
  contacts?: Array<{ id: string; label: string; destination_type: "number" }>;
  groups?: Array<{ id: string; label: string; destination_type: "group" }>;
  warning?: string | null;
  error?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DESTINATION_TYPE_LABELS: Record<WhatsappDueConfig["destination_type"], string> = {
  number: "Número",
  group: "Grupo",
};

const USE_CASE_LABELS: Record<UseCase, string> = {
  due_diligence: "Due Diligence",
  lead_notification: "Notificação de leads",
  pipeline_alert: "Alerta de pipeline",
  general: "Uso geral",
};

const USE_CASE_ORDER: UseCase[] = [
  "due_diligence",
  "lead_notification",
  "pipeline_alert",
  "general",
];

const EMPTY_FORM: WhatsappDueConfigForm = {
  label: "",
  destination: "",
  destination_type: "group",
  is_active: true,
  notes: "",
  use_case: "due_diligence",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortConfigs(items: WhatsappDueConfig[]) {
  return [...items].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    const useCaseOrder =
      USE_CASE_ORDER.indexOf(a.use_case) - USE_CASE_ORDER.indexOf(b.use_case);
    if (useCaseOrder !== 0) return useCaseOrder;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}

function formatDestination(destination: string, type: "number" | "group"): string {
  if (type === "number") {
    const raw = destination.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
    if (raw.startsWith("55") && raw.length === 13) {
      return `+55 ${raw.slice(2, 4)} ${raw.slice(4, 9)}-${raw.slice(9)}`;
    }
    if (raw.startsWith("55") && raw.length === 12) {
      return `+55 ${raw.slice(2, 4)} ${raw.slice(4, 8)}-${raw.slice(8)}`;
    }
    return raw || destination;
  }
  const clean = destination.replace(/@g\.us$/, "");
  return clean.length > 24 ? `${clean.slice(0, 12)}…${clean.slice(-8)}` : clean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WhatsappDueConfigPanel({
  initialConfig,
  initialConfigs = initialConfig ? [initialConfig] : [],
}: WhatsappDueConfigPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressBookError, setAddressBookError] = useState<string | null>(null);
  const [addressBookWarning, setAddressBookWarning] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Array<{ id: string; label: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; label: string }>>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [modalForm, setModalForm] = useState<WhatsappDueConfigForm | null>(null);
  const [modalMode, setModalMode] = useState<"new" | "addressBook" | "edit">("new");
  const [configs, setConfigs] = useState<WhatsappDueConfig[]>(sortConfigs(initialConfigs));
  const [deleteTarget, setDeleteTarget] = useState<WhatsappDueConfig | null>(null);

  const filteredContacts = contacts.filter((c) =>
    c.label.toLowerCase().includes(contactSearch.toLowerCase()),
  );
  const filteredGroups = groups.filter((g) =>
    g.label.toLowerCase().includes(groupSearch.toLowerCase()),
  );

  function upsertLocalConfig(config: WhatsappDueConfig) {
    setConfigs((prev) => {
      const withUpsert = prev.some((item) => item.id === config.id)
        ? prev.map((item) => (item.id === config.id ? config : item))
        : [config, ...prev];

      if (!config.is_active) return sortConfigs(withUpsert);

      // Desativa outros do mesmo use_case localmente
      return sortConfigs(
        withUpsert.map((item) =>
          item.id === config.id
            ? item
            : item.use_case === config.use_case
              ? { ...item, is_active: false }
              : item,
        ),
      );
    });
  }

  function handleSave(formToSave: WhatsappDueConfigForm, onSaved?: () => void) {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-due-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToSave),
      });

      const payload = (await response.json()) as ApiPayload;
      if (!response.ok) {
        setError(payload.error ?? "Falha ao salvar configuração.");
        return;
      }

      if (payload.data) upsertLocalConfig(payload.data);
      onSaved?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleActivate(config: WhatsappDueConfig) {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-due-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, is_active: true }),
      });

      const payload = (await response.json()) as ApiPayload;
      if (!response.ok) {
        setError(payload.error ?? "Falha ao ativar destino.");
        return;
      }
      if (payload.data) upsertLocalConfig(payload.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    const config = deleteTarget;
    setDeleteTarget(null);
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/whatsapp-due-config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: config.id }),
      });

      const payload = (await response.json()) as DeletePayload;
      if (!response.ok) {
        setError(payload.error ?? "Falha ao remover destino.");
        return;
      }

      setConfigs((prev) => prev.filter((item) => item.id !== config.id));
      if (modalForm?.id === config.id) {
        setIsSaveModalOpen(false);
        setModalForm(null);
      }
    });
  }

  function openNewDestinationModal() {
    setModalMode("new");
    setModalForm({ ...EMPTY_FORM });
    setIsSaveModalOpen(true);
  }

  function openEditConfigModal(config: WhatsappDueConfig) {
    setModalMode("edit");
    setModalForm({
      id: config.id,
      label: config.label,
      destination: config.destination,
      destination_type: config.destination_type,
      is_active: config.is_active,
      notes: config.notes ?? "",
      use_case: config.use_case,
    });
    setIsSaveModalOpen(true);
  }

  function openSaveAddressBookModal(item: {
    id: string;
    label: string;
    destination_type: "number" | "group";
  }) {
    setModalMode("addressBook");
    setModalForm({
      ...EMPTY_FORM,
      id: undefined,
      destination: item.id,
      label: item.label,
      destination_type: item.destination_type,
      is_active: true,
      notes: "",
    });
    setIsSaveModalOpen(true);
  }

  function fetchEvolutionAddressBook() {
    setAddressBookError(null);
    setAddressBookWarning(null);
    setContactSearch("");
    setGroupSearch("");
    startTransition(async () => {
      const response = await fetch("/api/admin/evolution-address-book", { method: "GET" });
      const payload = (await response.json()) as EvolutionAddressBookPayload;
      if (!response.ok) {
        setAddressBookError(payload.error ?? "Falha ao carregar agenda da Evolution.");
        return;
      }
      setInstanceName(payload.instance ?? null);
      setContacts((payload.contacts ?? []).map((item) => ({ id: item.id, label: item.label })));
      setGroups((payload.groups ?? []).map((item) => ({ id: item.id, label: item.label })));
      setAddressBookWarning(payload.warning ?? null);
    });
  }

  const [activatingUseCase, setActivatingUseCase] = useState<UseCase | null>(null);

  function handleUseCaseAssign(useCase: UseCase, configId: string) {
    if (configId === "__none__") return;
    const config = configs.find((c) => c.id === configId);
    if (!config) return;
    setActivatingUseCase(useCase);
    startTransition(async () => {
      // Mesma finalidade: reutiliza o registro (só ativa).
      // Outra finalidade: insere cópia com o mesmo número/JID — o mesmo destino pode atender várias integrações.
      const body =
        config.use_case === useCase
          ? { ...config, use_case: useCase, is_active: true }
          : {
              label: config.label,
              destination: config.destination,
              destination_type: config.destination_type,
              notes: config.notes,
              use_case: useCase,
              is_active: true,
            };

      const response = await fetch("/api/admin/whatsapp-due-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ApiPayload;
      setActivatingUseCase(null);
      if (!response.ok) {
        setError(payload.error ?? "Falha ao alterar destino.");
        return;
      }
      if (payload.data) upsertLocalConfig(payload.data);
    });
  }

  // Configs agrupados por use_case para o bloco "Destino ativo por finalidade"
  const activeByUseCase = USE_CASE_ORDER.reduce<Record<UseCase, WhatsappDueConfig | undefined>>(
    (acc, uc) => {
      acc[uc] = configs.find((c) => c.is_active && c.use_case === uc);
      return acc;
    },
    {} as Record<UseCase, WhatsappDueConfig | undefined>,
  );

  return (
    <>
      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover destino</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{" "}
              <span className="font-semibold text-[#102033]">{deleteTarget?.label}</span> dos
              destinos salvos? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDeleteConfirmed}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="glass-card glass-card-no-float">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Destinos do WhatsApp (Due Diligence)</CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">
                Gerencie números e grupos da Evolution API. O mesmo número ou grupo pode ser o destino
                ativo em várias finalidades; ao atribuir para outra finalidade, é criada uma cópia do
                registro. Em cada finalidade, só um destino fica ativo por vez.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={openNewDestinationModal}>
              <Plus className="mr-1.5 h-4 w-4" />
              Novo destino
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Errors */}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Erro ao salvar</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {addressBookError && (
            <Alert variant="destructive">
              <AlertTitle>Erro na agenda da Evolution</AlertTitle>
              <AlertDescription>{addressBookError}</AlertDescription>
            </Alert>
          )}
          {addressBookWarning && (
            <Alert>
              <AlertTitle>Aviso da Evolution</AlertTitle>
              <AlertDescription>{addressBookWarning}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Salvo com sucesso</AlertTitle>
            </Alert>
          )}

          {/* Atribuição de destino por finalidade */}
          <div className="rounded-2xl border border-[#dfe5ee] bg-white/60 p-4">
            <div className="mb-4">
              <p className="text-sm font-semibold text-[#102033]">Destino por finalidade</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Escolha qual destino salvo usar em cada integração. Pode repetir o mesmo número em
                várias finalidades (será duplicado o registro). Só um ativo por finalidade.
              </p>
            </div>
            {configs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum destino salvo ainda. Adicione um destino para poder atribuí-lo aqui.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {USE_CASE_ORDER.map((uc) => {
                  const active = activeByUseCase[uc];
                  const isActivating = activatingUseCase === uc;
                  return (
                    <div
                      key={uc}
                      className={`rounded-xl border p-3 transition-colors ${
                        active
                          ? "border-emerald-200 bg-emerald-50/50"
                          : "border-[#e5e7eb] bg-white/50"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300"}`}
                        />
                        <p className="text-xs font-semibold text-[#102033]">
                          {USE_CASE_LABELS[uc]}
                        </p>
                        {isActivating && (
                          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      <Select
                        value={active?.id ?? "__none__"}
                        onValueChange={(id) => handleUseCaseAssign(uc, id ?? "__none__")}
                        disabled={isActivating || isPending}
                      >
                        <SelectTrigger className="h-8 w-full bg-white text-xs">
                          <span className={active ? "truncate text-[#102033]" : "text-muted-foreground"}>
                            {active
                              ? `${active.label} · ${DESTINATION_TYPE_LABELS[active.destination_type]}`
                              : "Sem destino ativo"}
                          </span>
                        </SelectTrigger>
                        <SelectContent side="bottom" align="start">
                          <SelectItem value="__none__" disabled>
                            <span className="text-muted-foreground">Sem destino ativo</span>
                          </SelectItem>
                          {configs.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.label}
                              <span className="text-[10px] text-muted-foreground">
                                · {DESTINATION_TYPE_LABELS[c.destination_type]}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {active && (
                        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                          {formatDestination(active.destination, active.destination_type)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Destinos salvos */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-bold text-[#102033]">Destinos salvos</p>
              <p className="text-xs text-muted-foreground">
                Um destino ativo por finalidade. O mesmo WhatsApp pode aparecer em mais de uma
                finalidade com registros separados.
              </p>
            </div>

            {configs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d5dbe6] bg-white/45 p-6 text-center text-sm text-muted-foreground">
                Nenhum destino salvo ainda. Clique em "Novo destino" ou salve um contato da Agenda.
              </div>
            ) : (
              <div className="grid gap-3">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className={`rounded-2xl border p-4 shadow-sm transition-colors ${
                      config.is_active
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-[#dfe5ee] bg-white/70"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-[#102033]">{config.label}</p>
                          {config.is_active && (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Ativo
                            </Badge>
                          )}
                          <Badge variant="secondary">
                            {DESTINATION_TYPE_LABELS[config.destination_type]}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {USE_CASE_LABELS[config.use_case]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDestination(config.destination, config.destination_type)}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
                          {config.destination}
                        </p>
                        {config.notes ? (
                          <p className="mt-2 text-xs leading-relaxed text-slate-500">
                            {config.notes}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {!config.is_active && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => handleActivate(config)}
                            disabled={isPending}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Ativar
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => openEditConfigModal(config)}
                          disabled={isPending}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          onClick={() => setDeleteTarget(config)}
                          disabled={isPending}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agenda da Evolution API */}
          <div className="space-y-3 rounded-2xl border border-[#dfe5ee] bg-white/60 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Wifi className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[#102033]">Agenda da Evolution API</p>
                    {instanceName && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {instanceName}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Carrega contatos e grupos da instância conectada para facilitar o cadastro de
                    destinos.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={fetchEvolutionAddressBook}
                disabled={isPending}
                className="shrink-0"
              >
                {isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                {isPending ? "Carregando…" : "Atualizar"}
              </Button>
            </div>

            {(contacts.length > 0 || groups.length > 0) && (
              <div className="grid gap-3 lg:grid-cols-2">
                {/* Contatos */}
                <div className="space-y-2 rounded-xl border border-[#e6ebf2] bg-white/70 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Contatos ({filteredContacts.length}
                      {contactSearch && `/${contacts.length}`})
                    </p>
                  </div>
                  {contacts.length > 4 && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        placeholder="Buscar contato…"
                        className="h-8 bg-white pl-8 text-xs"
                      />
                    </div>
                  )}
                  {filteredContacts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {contactSearch ? "Nenhum resultado." : "Nenhum contato carregado."}
                    </p>
                  ) : (
                    <div className="max-h-64 space-y-1.5 overflow-auto pr-1">
                      {filteredContacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[#eef1f6] bg-white px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-[#102033]">
                              {contact.label}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {formatDestination(contact.id, "number")}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              openSaveAddressBookModal({
                                ...contact,
                                destination_type: "number",
                              })
                            }
                          >
                            Salvar
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Grupos */}
                <div className="space-y-2 rounded-xl border border-[#e6ebf2] bg-white/70 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Grupos ({filteredGroups.length}
                      {groupSearch && `/${groups.length}`})
                    </p>
                  </div>
                  {groups.length > 4 && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={groupSearch}
                        onChange={(e) => setGroupSearch(e.target.value)}
                        placeholder="Buscar grupo…"
                        className="h-8 bg-white pl-8 text-xs"
                      />
                    </div>
                  )}
                  {filteredGroups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {groupSearch ? "Nenhum resultado." : "Nenhum grupo carregado."}
                    </p>
                  ) : (
                    <div className="max-h-64 space-y-1.5 overflow-auto pr-1">
                      {filteredGroups.map((group) => (
                        <div
                          key={group.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[#eef1f6] bg-white px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-[#102033]">
                              {group.label}
                            </p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {formatDestination(group.id, "group")}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              openSaveAddressBookModal({
                                ...group,
                                destination_type: "group",
                              })
                            }
                          >
                            Salvar grupo
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {contacts.length === 0 && groups.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#dfe5ee] py-6 text-center">
                <Wifi className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  Clique em "Atualizar" para carregar a agenda da instância conectada.
                </p>
              </div>
            )}
          </div>

          {/* Modal novo/editar/salvar da agenda */}
          <Dialog modal={false} open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
            <DialogContent
              className="max-w-xl"
              onPointerDownOutside={(event) => {
                if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
              }}
              onFocusOutside={(event) => {
                if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {modalMode === "new"
                    ? "Novo destino"
                    : modalMode === "edit"
                      ? "Editar destino salvo"
                      : "Salvar da agenda da Evolution"}
                </DialogTitle>
                <DialogDescription>
                  Revise os dados abaixo antes de salvar. Você pode ajustar nome, tipo, finalidade e
                  destino.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nome do destino *</Label>
                  <Input
                    value={modalForm?.label ?? ""}
                    onChange={(e) =>
                      setModalForm((prev) => ({ ...(prev ?? EMPTY_FORM), label: e.target.value }))
                    }
                    placeholder="Ex.: Grupo Comercial BP"
                    className="bg-white/70"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={modalForm?.destination_type ?? "group"}
                      onValueChange={(value) => {
                        if (value === "number" || value === "group") {
                          setModalForm((prev) => ({
                            ...(prev ?? EMPTY_FORM),
                            destination_type: value,
                          }));
                        }
                      }}
                    >
                      <SelectTrigger className="bg-white/70 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent side="bottom" align="start">
                        <SelectItem value="number">Número</SelectItem>
                        <SelectItem value="group">Grupo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Finalidade</Label>
                    <Select
                      value={modalForm?.use_case ?? "due_diligence"}
                      onValueChange={(value) => {
                        setModalForm((prev) => ({
                          ...(prev ?? EMPTY_FORM),
                          use_case: value as UseCase,
                        }));
                      }}
                    >
                      <SelectTrigger className="bg-white/70 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent side="bottom" align="start">
                        {USE_CASE_ORDER.map((uc) => (
                          <SelectItem key={uc} value={uc}>
                            {USE_CASE_LABELS[uc]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Número ou ID do grupo *</Label>
                  <Input
                    value={modalForm?.destination ?? ""}
                    onChange={(e) =>
                      setModalForm((prev) => ({
                        ...(prev ?? EMPTY_FORM),
                        destination: e.target.value,
                      }))
                    }
                    placeholder="5511999999999@s.whatsapp.net"
                    className="bg-white/70 font-mono text-xs"
                  />
                  {modalForm?.destination && (
                    <p className="text-[11px] text-muted-foreground">
                      Exibição:{" "}
                      <span className="font-medium text-[#102033]">
                        {formatDestination(
                          modalForm.destination,
                          modalForm.destination_type ?? "number",
                        )}
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white/60 px-3 py-2">
                  <Switch
                    checked={modalForm?.is_active ?? true}
                    onCheckedChange={(value) =>
                      setModalForm((prev) => ({ ...(prev ?? EMPTY_FORM), is_active: value }))
                    }
                  />
                  <Label className="text-xs">Usar como destino ativo para esta finalidade</Label>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Observações</Label>
                  <Textarea
                    value={modalForm?.notes ?? ""}
                    onChange={(e) =>
                      setModalForm((prev) => ({ ...(prev ?? EMPTY_FORM), notes: e.target.value }))
                    }
                    placeholder="Ex.: contato sincronizado da Evolution API."
                    className="min-h-16 bg-white/70"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSaveModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="bg-crm-gradient-primary text-white shadow"
                  disabled={
                    isPending || !modalForm?.label?.trim() || !modalForm?.destination?.trim()
                  }
                  onClick={() => {
                    if (!modalForm) return;
                    handleSave(modalForm, () => setIsSaveModalOpen(false));
                  }}
                >
                  {isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  {isPending
                    ? "Salvando…"
                    : modalMode === "edit"
                      ? "Salvar alterações"
                      : "Salvar destino"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </>
  );
}
