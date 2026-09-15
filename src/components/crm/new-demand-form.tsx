"use client";

import {
  type ComponentType,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  BadgePercent,
  Building2,
  CalendarClock,
  CheckCircle2,
  BriefcaseBusiness,
  Gavel,
  Handshake,
  Landmark,
  MonitorUp,
  RefreshCcw,
  Scale,
  Plus,
  SearchCheck,
  ShieldCheck,
  Target,
  Trash2,
  UserCircle2,
  WalletCards,
} from "lucide-react";

import {
  indicationTypes,
  leadAreas,
  leadTypes,
  type NewLeadPayload,
} from "@/modules/crm/application/services/new-lead-payload";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { TimeInputBr } from "@/components/ui/time-input-br";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateYmdBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import {
  ClientPickerField,
  InputField,
  ModalHeader,
  newLeadModalFieldClass,
  SectionCard,
  SelectField,
  StickyFooter,
  TagSelectable,
  UserPickerField,
} from "@/components/crm/new-lead-modal";

interface NewDemandFormProps {
  onSuccess?: () => void;
  onRequestClose?: () => void;
}

interface CompanyFormItem {
  razao_social: string;
  tipo_documento: "CPF" | "CNPJ";
  documento: string;
}

interface SystemUserOption {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

interface ClientOption {
  id: string;
  razao_social: string;
  documento: string;
}

interface LeadFormBootstrapPayload {
  currentUser: SystemUserOption | null;
  systemUsers: SystemUserOption[];
  orqestraiCollaborators: SystemUserOption[];
  approvedIndicators: string[];
}

const EMPTY_COMPANY: CompanyFormItem = {
  razao_social: "",
  tipo_documento: "CNPJ",
  documento: "",
};

const DOCUMENTO_TIPO_ITEMS: Record<"CPF" | "CNPJ", string> = {
  CPF: "CPF",
  CNPJ: "CNPJ",
};

const INDICATION_TYPE_SELECT_ITEMS: Record<string, string> = Object.fromEntries(
  indicationTypes.map((t) => [t, t]),
);

const LEAD_TYPE_HELP: Record<(typeof leadTypes)[number], string> = {
  Indicacao:
    "Lead vindo de recomendação direta de cliente, parceiro, consultor ou relacionamento.",
  "Lead Ativa":
    "Lead prospectado ativamente pelo time comercial através de abordagem direta.",
  "Lead Digital":
    "Lead gerado por canais digitais como site, campanhas e formulários online.",
  "Lead Passiva":
    "Lead que chegou espontaneamente sem prospecção ativa nem campanha dedicada.",
  "Cross Selling":
    "Lead de expansao sobre cliente ja ativo, aproveitando relacionamento existente para nova oportunidade.",
};

const LEAD_TYPE_ICONS: Record<
  (typeof leadTypes)[number],
  ComponentType<{ className?: string }>
> = {
  Indicacao: Handshake,
  "Lead Ativa": Target,
  "Lead Digital": MonitorUp,
  "Lead Passiva": BriefcaseBusiness,
  "Cross Selling": RefreshCcw,
};

const LEAD_TYPE_TONES: Record<
  (typeof leadTypes)[number],
  { card: string; icon: string; badge: string; accent: string }
> = {
  Indicacao: {
    card: "border-warning-border bg-warning-bg",
    icon: "border-warning-border bg-white text-warning-text",
    badge: "border-warning-border bg-warning-bg text-warning-text",
    accent: "bg-warning-text",
  },
  "Lead Ativa": {
    card: "border-info-border bg-info-bg",
    icon: "border-info-border bg-white text-info-text",
    badge: "border-info-border bg-info-bg text-info-text",
    accent: "bg-info-text",
  },
  "Lead Digital": {
    card: "border-violet-border bg-violet-bg",
    icon: "border-violet-border bg-white text-violet-text",
    badge: "border-violet-border bg-violet-bg text-violet-text",
    accent: "bg-violet-text",
  },
  "Lead Passiva": {
    card: "border-neutral-200 bg-neutral-50",
    icon: "border-neutral-200 bg-white text-foreground",
    badge: "border-neutral-200 bg-neutral-100 text-foreground",
    accent: "bg-neutral-400",
  },
  "Cross Selling": {
    card: "border-success-border bg-success-bg",
    icon: "border-success-border bg-white text-success-text",
    badge: "border-success-border bg-success-bg text-success-text",
    accent: "bg-success-text",
  },
};

const AREA_ICONS: Record<
  (typeof leadAreas)[number],
  ComponentType<{ className?: string }>
> = {
  "Cível": Scale,
  Trabalhista: BadgePercent,
  "Societário e Contratos": Landmark,
  "Recuperação de Créditos": WalletCards,
  Tributário: Gavel,
  "Reestruturação e Insolvência": Building2,
};

const DUE_TIME_SUGGESTIONS = ["09:00", "11:00", "14:00", "16:00"];
const MEETING_TIME_SUGGESTIONS = ["09:30", "11:30", "14:30", "16:30"];
const MEETING_LOCATION_PENDING = "A definir";
const WIZARD_STEPS = [
  {
    id: "origem",
    label: "Origem",
    description: "Tipo de lead e contexto comercial.",
  },
  {
    id: "solicitante",
    label: "Solicitante",
    description: "Quem originou e quem cadastra.",
  },
  {
    id: "empresas",
    label: "Empresas",
    description: "Entidades vinculadas ao lead.",
  },
  {
    id: "areas",
    label: "Áreas",
    description: "Encaminhamento operacional.",
  },
  {
    id: "agenda",
    label: "Agenda",
    description: "Due diligence e reunião.",
  },
  {
    id: "revisao",
    label: "Revisão",
    description: "Conferência antes de salvar.",
  },
] as const;

type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

function initialsFromName(name: string | null | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function CurrentUserSummary({
  user,
  loading,
}: {
  user: SystemUserOption | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-(--radius-v2-xl) border border-border bg-surface-subtle p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Cadastro realizado por
          </p>
        </div>
        <div className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Automático
        </div>
      </div>

      {loading ? (
        <div className="h-14 animate-pulse rounded-(--radius-v2-md) bg-neutral-100" />
      ) : user ? (
        <div className="flex items-center gap-3 rounded-(--radius-v2-md) border border-border bg-white px-3 py-3">
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback>{initialsFromName(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-3 text-sm text-warning-text">
          Não foi possível identificar o usuário logado para preencher este campo.
        </div>
      )}
    </div>
  );
}

function maskCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function maskCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function maskDocument(value: string, type: "CPF" | "CNPJ") {
  return type === "CPF" ? maskCpf(value) : maskCnpj(value);
}

function ReviewItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-(--radius-v2-xl) border border-border bg-white px-4 py-3", className)}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">{value || "Não informado"}</p>
    </div>
  );
}

export function NewDemandForm({ onSuccess, onRequestClose }: NewDemandFormProps) {
  const modalPortalRef = useRef<HTMLDivElement | null>(null);
  const [systemUsers, setSystemUsers] = useState<SystemUserOption[]>([]);
  const [orqestraiCollaborators, setOrqestraiCollaborators] = useState<SystemUserOption[]>([]);
  const [currentUser, setCurrentUser] = useState<SystemUserOption | null>(null);
  const [approvedIndicators, setApprovedIndicators] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingFormOptions, setLoadingFormOptions] = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  const [solicitanteUserId, setSolicitanteUserId] = useState("");
  const [dueDiligence, setDueDiligence] = useState<"Sim" | "Nao">("Nao");
  const [prazoDue, setPrazoDue] = useState("");
  const [horarioDue, setHorarioDue] = useState("");
  const [empresas, setEmpresas] = useState<CompanyFormItem[]>([{ ...EMPTY_COMPANY }]);
  const [areasAnalise, setAreasAnalise] = useState<string[]>([]);
  const [aditivoClientId, setAditivoClientId] = useState("");
  const [localReuniao, setLocalReuniao] = useState("");
  const [dataReuniao, setDataReuniao] = useState("");
  const [horarioReuniao, setHorarioReuniao] = useState("");
  const [tipoLead, setTipoLead] = useState<(typeof leadTypes)[number]>("Indicacao");
  const [tipoIndicacao, setTipoIndicacao] = useState("");
  const [nomeIndicacaoMode, setNomeIndicacaoMode] = useState<"existing" | "new" | "colaborador">(
    "existing",
  );
  const [nomeIndicacaoExisting, setNomeIndicacaoExisting] = useState("");
  const [nomeIndicacaoNew, setNomeIndicacaoNew] = useState("");
  const [nomeIndicacaoColaboradorId, setNomeIndicacaoColaboradorId] = useState("");
  const [tipoIndicacaoOpen, setTipoIndicacaoOpen] = useState(false);
  const [nomeIndicacaoOpen, setNomeIndicacaoOpen] = useState(false);
  const [companyTypeOpenIndex, setCompanyTypeOpenIndex] = useState<number | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const isCrossSelling = tipoLead === "Cross Selling";
  const hasAreasSelected = areasAnalise.length > 0;
  const solicitanteUser = useMemo(
    () => systemUsers.find((user) => user.id === solicitanteUserId) ?? null,
    [systemUsers, solicitanteUserId],
  );
  const isIndicacaoColaborador = tipoLead === "Indicacao" && tipoIndicacao === "Colaborador";
  const nomeIndicacaoColaboradorNome =
    orqestraiCollaborators.find((user) => user.id === nomeIndicacaoColaboradorId)?.name ?? "";
  const reuniaoMinDate = useMemo(() => {
    if (dueDiligence !== "Sim" || !prazoDue) return "";
    const minDate = new Date(`${prazoDue}T00:00:00`);

    do {
      minDate.setDate(minDate.getDate() + 1);
    } while ([0, 6].includes(minDate.getDay()));

    return minDate.toISOString().slice(0, 10);
  }, [dueDiligence, prazoDue]);
  const hasValidCompanies = useMemo(
    () => empresas.every((item) => item.razao_social.trim() && item.documento.trim()),
    [empresas],
  );
  const hasLeadOrigin = useMemo(() => {
    if (tipoLead === "Indicacao") {
      return Boolean(
        tipoIndicacao &&
          ((nomeIndicacaoMode === "existing" && nomeIndicacaoExisting) ||
            (nomeIndicacaoMode === "new" && nomeIndicacaoNew.trim()) ||
            (nomeIndicacaoMode === "colaborador" && nomeIndicacaoColaboradorId)),
      );
    }
    if (isCrossSelling) {
      return Boolean(aditivoClientId);
    }
    return true;
  }, [
    aditivoClientId,
    isCrossSelling,
    nomeIndicacaoColaboradorId,
    nomeIndicacaoExisting,
    nomeIndicacaoMode,
    nomeIndicacaoNew,
    tipoIndicacao,
    tipoLead,
  ]);
  const hasDueDiligencePlan = dueDiligence === "Nao" || Boolean(prazoDue && horarioDue);
  const hasMeetingPlan =
    Boolean(localReuniao.trim()) && (dueDiligence === "Nao" || Boolean(dataReuniao));
  const journeySteps = useMemo(
    () => [
      {
        label: "Origem qualificada",
        description: "Tipo de lead e contexto comercial definidos.",
        done: hasLeadOrigin,
      },
      {
        label: "Solicitante identificado",
        description: "Usuário solicitante e responsável pelo cadastro conferidos.",
        done: Boolean(solicitanteUser && currentUser?.email),
      },
      {
        label: "Empresa mapeada",
        description: "Razão social/nome e documento preenchidos.",
        done: hasValidCompanies,
      },
      {
        label: "Áreas selecionadas",
        description: "Encaminhamento operacional definido.",
        done: hasAreasSelected,
      },
      {
        label: "Agenda preparada",
        description: "Due diligence e reunião alinhadas ao fluxo.",
        done: hasDueDiligencePlan && hasMeetingPlan,
      },
    ],
    [
      currentUser?.email,
      hasAreasSelected,
      hasDueDiligencePlan,
      hasLeadOrigin,
      hasMeetingPlan,
      hasValidCompanies,
      solicitanteUser,
    ],
  );
  const completedJourneySteps = journeySteps.filter((step) => step.done).length;
  const journeyCompletion = Math.round((completedJourneySteps / journeySteps.length) * 100);
  const activeWizardStep = WIZARD_STEPS[currentStepIndex] ?? WIZARD_STEPS[0];
  const activeWizardStepId = activeWizardStep.id;
  const isReviewStep = activeWizardStepId === "revisao";
  const canSubmitLead =
    !isSaving &&
    !loadingFormOptions &&
    hasAreasSelected &&
    hasLeadOrigin &&
    Boolean(solicitanteUser && currentUser?.email) &&
    hasValidCompanies &&
    hasDueDiligencePlan &&
    hasMeetingPlan;
  const wizardStepStatus = WIZARD_STEPS.map((step, index) => {
    const done =
      step.id === "origem"
        ? hasLeadOrigin
        : step.id === "solicitante"
          ? Boolean(solicitanteUser && currentUser?.email)
          : step.id === "empresas"
            ? hasValidCompanies
            : step.id === "areas"
              ? hasAreasSelected
              : step.id === "agenda"
                ? hasDueDiligencePlan && hasMeetingPlan
                : canSubmitLead;

    return {
      ...step,
      done,
      available: index <= currentStepIndex || done || index === currentStepIndex + 1,
    };
  });
  const nomeIndicacaoItems = useMemo(() => {
    const items: Record<string, string> = {
      __new__: "Não encontrei na base (cadastrar novo)",
    };
    for (const name of approvedIndicators) {
      items[name] = name;
    }
    return items;
  }, [approvedIndicators]);

  const nomeIndicacaoSelectValue =
    nomeIndicacaoMode === "new" ? "__new__" : nomeIndicacaoExisting || null;

  useEffect(() => {
    if (!currentUser?.id || solicitanteUserId || systemUsers.length === 0) return;
    const match = systemUsers.some((user) => user.id === currentUser.id);
    if (match) setSolicitanteUserId(currentUser.id);
  }, [currentUser, solicitanteUserId, systemUsers]);

  useEffect(() => {
    if (!onRequestClose) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector("[data-new-lead-picker-panel]")) return;
      if (document.querySelector('[data-slot="select-content"][data-open]')) return;
      onRequestClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onRequestClose]);

  useEffect(() => {
    let cancelled = false;

    async function loadFormOptions() {
      try {
        setLoadingFormOptions(true);
        const response = await fetch("/api/crm/lead-form-options", { cache: "no-store" });
        const payload = (await response.json()) as {
          ok?: boolean;
          data?: LeadFormBootstrapPayload;
          error?: string;
        };

        if (!response.ok || payload.error || !payload.data) {
          throw new Error(payload.error ?? "Falha ao carregar opções do formulário.");
        }

        if (!cancelled) {
          setSystemUsers(payload.data.systemUsers ?? []);
          setOrqestraiCollaborators(payload.data.orqestraiCollaborators ?? []);
          setApprovedIndicators(payload.data.approvedIndicators ?? []);
          setCurrentUser(payload.data.currentUser ?? null);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error
              ? loadError.message
              : "Falha ao carregar opções do formulário.";
          setError(message);
          setSystemUsers([]);
          setOrqestraiCollaborators([]);
          setApprovedIndicators([]);
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingFormOptions(false);
        }
      }
    }

    loadFormOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadClients() {
      try {
        setLoadingClients(true);
        const response = await fetch("/api/crm/clients", { cache: "no-store" });
        const payload = (await response.json()) as {
          data?: ClientOption[];
          error?: string;
        };

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Falha ao carregar clientes.");
        }

        if (!cancelled) {
          setClients(payload.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setClients([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingClients(false);
        }
      }
    }

    loadClients();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!error && !warning && !success) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error, warning, success]);

  useEffect(() => {
    if (!isCrossSelling) {
      setAditivoClientId("");
    }
  }, [isCrossSelling]);

  function toggleArea(area: string) {
    setAreasAnalise((prev) =>
      prev.includes(area) ? prev.filter((item) => item !== area) : [...prev, area],
    );
  }

  function updateCompany(
    index: number,
    patch: Partial<CompanyFormItem>,
    remask = false,
  ) {
    setEmpresas((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...patch };
        if (remask) {
          next.documento = maskDocument(next.documento, next.tipo_documento);
        }
        return next;
      }),
    );
  }

  function addCompany() {
    setEmpresas((prev) => [...prev, { ...EMPTY_COMPANY }]);
  }

  function removeCompany(index: number) {
    if (empresas.length === 1) return;
    setEmpresas((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    setSolicitanteUserId("");
    setDueDiligence("Nao");
    setPrazoDue("");
    setHorarioDue("");
    setEmpresas([{ ...EMPTY_COMPANY }]);
    setAreasAnalise([]);
    setAditivoClientId("");
    setLocalReuniao("");
    setDataReuniao("");
    setHorarioReuniao("");
    setTipoLead("Indicacao");
    setTipoIndicacao("");
    setNomeIndicacaoMode("existing");
    setNomeIndicacaoExisting("");
    setNomeIndicacaoNew("");
    setTipoIndicacaoOpen(false);
    setNomeIndicacaoOpen(false);
    setCompanyTypeOpenIndex(null);
    setCurrentStepIndex(0);
  }


  function handleAditivoClientChange(clientId: string | null) {
    const id = clientId ?? "";
    setAditivoClientId(id);
    if (!id) return;
    const client = clients.find((item) => item.id === id);
    if (!client) return;

    const inferredType: "CPF" | "CNPJ" =
      client.documento.replace(/\D/g, "").length <= 11 ? "CPF" : "CNPJ";

    setEmpresas((prev) => {
      const first = prev[0] ?? { ...EMPTY_COMPANY };
      const nextFirst: CompanyFormItem = {
        ...first,
        razao_social: client.razao_social.toUpperCase(),
        tipo_documento: inferredType,
        documento: maskDocument(client.documento, inferredType),
      };

      return [nextFirst, ...prev.slice(1)];
    });
  }

  function getWizardStepError(stepId: WizardStepId) {
    if (stepId === "origem") {
      if (tipoLead === "Indicacao" && !tipoIndicacao) return "Selecione o tipo de indicação.";
      if (tipoLead === "Indicacao" && nomeIndicacaoMode === "existing" && !nomeIndicacaoExisting) {
        return "Selecione o nome da indicação ou cadastre um novo.";
      }
      if (tipoLead === "Indicacao" && nomeIndicacaoMode === "new" && !nomeIndicacaoNew.trim()) {
        return "Informe o nome da indicação para aprovação.";
      }
      if (
        tipoLead === "Indicacao" &&
        nomeIndicacaoMode === "colaborador" &&
        !nomeIndicacaoColaboradorId
      ) {
        return "Selecione o colaborador que fez a indicação.";
      }
      if (isCrossSelling && !aditivoClientId) {
        return "Selecione um cliente existente para o fluxo de cross selling.";
      }
      return null;
    }

    if (stepId === "solicitante") {
      if (!currentUser?.email) return "Não foi possível identificar o usuário logado.";
      if (!solicitanteUser) return "Selecione o solicitante do lead.";
      return null;
    }

    if (stepId === "empresas") {
      if (empresas.some((item) => !item.razao_social.trim() || !item.documento.trim())) {
        return "Preencha razão social/nome e CPF/CNPJ de todos os itens.";
      }
      return null;
    }

    if (stepId === "areas") {
      if (!hasAreasSelected) return "Selecione ao menos uma área de análise.";
      return null;
    }

    if (stepId === "agenda") {
      if (dueDiligence === "Sim" && (!prazoDue || !horarioDue)) {
        return "Informe prazo e horário da due diligence.";
      }
      if (!localReuniao.trim()) return "Informe o local da reunião ou marque como a definir.";
      if (dueDiligence === "Sim" && !dataReuniao) {
        return "Informe a data da reunião para due diligence.";
      }
      if (dueDiligence === "Sim" && reuniaoMinDate && dataReuniao < reuniaoMinDate) {
        return "Data da reunião deve respeitar ao menos 1 dia útil após o prazo da base.";
      }
      return null;
    }

    return validateBeforeConfirm() ? null : "Revise as pendências antes de salvar.";
  }

  function selectWizardStep(stepId: WizardStepId) {
    const nextIndex = WIZARD_STEPS.findIndex((step) => step.id === stepId);
    if (nextIndex < 0) return;
    if (nextIndex <= currentStepIndex) {
      setCurrentStepIndex(nextIndex);
      setError(null);
      return;
    }

    for (let index = 0; index < nextIndex; index += 1) {
      const issue = getWizardStepError(WIZARD_STEPS[index]!.id);
      if (issue) {
        setCurrentStepIndex(index);
        setError(issue);
        return;
      }
    }
    setCurrentStepIndex(nextIndex);
    setError(null);
  }

  function goToNextWizardStep() {
    const issue = getWizardStepError(activeWizardStepId);
    if (issue) {
      setError(issue);
      setWarning(null);
      return;
    }
    setError(null);
    setCurrentStepIndex((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  }

  function goToPreviousWizardStep() {
    setError(null);
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }

  function validateBeforeConfirm() {
    if (!currentUser?.email) {
      setError("Não foi possível identificar o usuário logado para concluir o cadastro.");
      return false;
    }

    if (!hasAreasSelected) {
      setError("Selecione ao menos uma área de análise.");
      return false;
    }

    if (!solicitanteUser || !localReuniao) {
      setError("Preencha os campos obrigatórios do formulário.");
      return false;
    }

    if (dueDiligence === "Sim" && (!prazoDue || !horarioDue)) {
      setError("Informe prazo e horário da due diligence.");
      return false;
    }

    if (dueDiligence === "Sim") {
      if (!dataReuniao) {
        setError("Informe a data da reunião para due diligence.");
        return false;
      }

      if (reuniaoMinDate && dataReuniao < reuniaoMinDate) {
        setError(
          "Data da reunião deve respeitar ao menos 1 dia útil após o prazo da base.",
        );
        return false;
      }
    }

    if (
      tipoLead === "Indicacao" &&
      (!tipoIndicacao ||
        (nomeIndicacaoMode === "existing" && !nomeIndicacaoExisting) ||
        (nomeIndicacaoMode === "new" && !nomeIndicacaoNew.trim()) ||
        (nomeIndicacaoMode === "colaborador" && !nomeIndicacaoColaboradorId))
    ) {
      setError("Preencha os campos de indicação.");
      return false;
    }

    if (isCrossSelling && !aditivoClientId) {
      setError("Selecione um cliente existente para o fluxo de cross selling.");
      return false;
    }

    if (empresas.some((item) => !item.razao_social.trim() || !item.documento.trim())) {
      setError("Preencha razão social/nome e CPF/CNPJ de todos os itens.");
      return false;
    }

    setError(null);
    return true;
  }

  async function submitLead() {
    if (!validateBeforeConfirm()) {
      setConfirmOpen(false);
      return;
    }

    if (!solicitanteUser || !currentUser?.email) {
      setError("Selecione o solicitante e recarregue a identificação do usuário logado.");
      setConfirmOpen(false);
      return;
    }

    setIsSaving(true);
    setError(null);
    setWarning(null);
    setSuccess(null);

    const payload: NewLeadPayload = {
      solicitante: solicitanteUser.name,
      email: solicitanteUser.email,
      cadastrado_por: currentUser.email,
      due_diligence: dueDiligence,
      data_entrega_due: dueDiligence === "Sim" ? prazoDue : null,
      horario_entrega_due: dueDiligence === "Sim" ? horarioDue : null,
      empresas: empresas.map((item) => ({
        tipo_documento: item.tipo_documento,
        razao_social: item.razao_social.trim(),
        documento: item.documento.trim(),
      })),
      areas_analise: areasAnalise as NewLeadPayload["areas_analise"],
      local_reuniao: localReuniao.trim(),
      data_reuniao: dataReuniao || null,
      horario_reuniao: horarioReuniao || null,
      tipo_de_lead: tipoLead,
      tipo_indicacao:
        tipoLead === "Indicacao"
          ? (tipoIndicacao as NewLeadPayload["tipo_indicacao"])
          : null,
      nome_indicacao:
        tipoLead === "Indicacao"
          ? nomeIndicacaoMode === "existing"
            ? nomeIndicacaoExisting
            : nomeIndicacaoMode === "colaborador"
              ? nomeIndicacaoColaboradorNome
              : nomeIndicacaoNew.trim()
          : null,
      contexto_comercial: null,
    };

    type ApiResult = {
      ok?: boolean;
      error?: string;
      warning?: string;
      details?: unknown;
    };

    const finishSaving = () => {
      setIsSaving(false);
      setConfirmOpen(false);
    };

    try {
      const response = await fetch("/api/leads/new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let result: ApiResult = {};
      const raw = await response.text();
      if (raw) {
        try {
          result = JSON.parse(raw) as ApiResult;
        } catch {
          setError("Resposta inválida do servidor (não é JSON).");
          finishSaving();
          return;
        }
      }

      if (!response.ok) {
        let message = result.error ?? "Falha ao salvar novo lead.";
        if (result.details && typeof result.details === "object") {
          message = `${message} Verifique os campos obrigatórios.`;
        }
        setError(message);
        finishSaving();
        return;
      }

      if (result.ok === false) {
        setError(result.error ?? "Falha ao salvar novo lead.");
        finishSaving();
        return;
      }

      if (result.warning) {
        setWarning(result.warning);
      }

      setSuccess("Novo lead cadastrado com sucesso.");
      resetForm();
      finishSaving();
      onSuccess?.();
    } catch {
      setError("Erro de rede ao salvar lead.");
      finishSaving();
    }
  }

  const SelectedLeadIcon = LEAD_TYPE_ICONS[tipoLead];
  const selectedLeadTone = LEAD_TYPE_TONES[tipoLead];
  const indicationDisplay =
    tipoLead === "Indicacao"
      ? nomeIndicacaoMode === "existing"
        ? nomeIndicacaoExisting || "Não informado"
        : nomeIndicacaoMode === "colaborador"
          ? nomeIndicacaoColaboradorNome || "Não informado"
          : nomeIndicacaoNew.trim() || "Não informado"
      : "Não aplicável";
  const selectedClient = clients.find((client) => client.id === aditivoClientId);

  return (
    <motion.div
      ref={modalPortalRef}
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-subtle"
    >
      <ModalHeader
        badge="NOVO LEAD"
        title="Abertura comercial guiada"
        subtitle="Siga a jornada: qualifique a origem, identifique o solicitante, mapeie empresas, selecione áreas e prepare a agenda."
        onRequestClose={onRequestClose}
        pills={[
          {
            label: "Etapa",
            value: `${currentStepIndex + 1}/${WIZARD_STEPS.length}`,
          },
          { label: "Tipo", value: tipoLead },
          { label: "Progresso", value: `${journeyCompletion}%` },
        ]}
        steps={wizardStepStatus.map((step) => ({
          id: step.id,
          label: step.label,
          done: step.done,
          active: step.id === activeWizardStepId,
          available: step.available,
        }))}
        onSelectStep={(stepId) => selectWizardStep(stepId as WizardStepId)}
      />

      <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-[1040px] pr-0.5">
          <div className="space-y-5">
          <div ref={feedbackRef} className="space-y-3 scroll-mt-4">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Erro no cadastro</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {warning ? (
              <Alert>
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ) : null}
            {success ? (
              <Alert>
                <AlertTitle>Cadastro concluído</AlertTitle>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="rounded-(--radius-v2-xl) border border-border bg-white px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-interactive-700">
                  Etapa {currentStepIndex + 1} de {WIZARD_STEPS.length}
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                  {activeWizardStep.label}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{activeWizardStep.description}</p>
              </div>
              <div className="grid grid-cols-6 gap-1 md:min-w-[260px]">
                {WIZARD_STEPS.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => selectWizardStep(step.id)}
                    className={cn(
                      "h-2 rounded-full transition-colors",
                      index <= currentStepIndex ? "bg-interactive-600" : "bg-neutral-200",
                    )}
                    aria-label={`Ir para etapa ${step.label}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {activeWizardStepId === "origem" ? (
          <SectionCard
            icon={Handshake}
            title="Tipo de Lead"
            subtitle="Este é o primeiro passo: a escolha aqui abre os campos certos e reduz retrabalho."
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-foreground">Tipo de Lead *</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {leadTypes.map((item) => {
                      const active = tipoLead === item;
                      const Icon = LEAD_TYPE_ICONS[item];
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setTipoLead(item)}
                          className={cn(
                            "rounded-(--radius-v2-xl) border px-3 py-2.5 text-left transition-colors duration-150",
                            active
                              ? "border-interactive-300 bg-interactive-50"
                              : "border-border bg-white hover:border-border-strong hover:bg-surface-hover",
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={cn(
                                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors duration-180",
                                active
                                  ? "border-interactive-300 bg-white text-interactive-700"
                                  : "border-border bg-surface-subtle text-muted-foreground",
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">{item}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "relative overflow-hidden rounded-(--radius-v2-xl) border p-4 sm:p-5",
                  selectedLeadTone.card,
                )}
              >
                <div
                  className={cn(
                    "absolute inset-x-0 top-0 h-1",
                    selectedLeadTone.accent,
                  )}
                />
                <div className="mb-4 flex items-start gap-3">
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-(--radius-v2-lg) border",
                      selectedLeadTone.icon,
                    )}
                  >
                    <SelectedLeadIcon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]",
                        selectedLeadTone.badge,
                      )}
                    >
                      Fluxo selecionado
                    </p>
                    <p className="mt-2 text-lg font-extrabold tracking-[-0.03em] text-foreground">
                      {tipoLead}
                    </p>
                    <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">
                      {LEAD_TYPE_HELP[tipoLead]}
                    </p>
                  </div>
                </div>

                {tipoLead === "Indicacao" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <SelectField label="Tipo de Indicação *" className="min-w-0">
                      <Select
                        open={tipoIndicacaoOpen}
                        onOpenChange={setTipoIndicacaoOpen}
                        modal={false}
                        items={INDICATION_TYPE_SELECT_ITEMS}
                        value={tipoIndicacao}
                        onValueChange={(v) => {
                          const next = v ?? "";
                          setTipoIndicacao(next);
                          if (next === "Colaborador") {
                            setNomeIndicacaoMode("colaborador");
                          } else if (nomeIndicacaoMode === "colaborador") {
                            setNomeIndicacaoMode("existing");
                            setNomeIndicacaoColaboradorId("");
                          }
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            newLeadModalFieldClass,
                            "h-10 w-full justify-between font-normal whitespace-normal",
                          )}
                        >
                          <CrmSelectValue
                            value={tipoIndicacao}
                            labels={INDICATION_TYPE_SELECT_ITEMS}
                            placeholder="Selecione"
                          />
                        </SelectTrigger>
                        <CrmSelectContent inModal className="max-h-[min(280px,50dvh)]">
                          {indicationTypes.map((item) => (
                            <CrmSelectItem key={item} value={item}>
                              {item}
                            </CrmSelectItem>
                          ))}
                        </CrmSelectContent>
                      </Select>
                    </SelectField>

                    {isIndicacaoColaborador ? (
                      <UserPickerField
                        label="Colaborador que indicou *"
                        placeholder={
                          loadingFormOptions ? "Carregando colaboradores..." : "Selecione o colaborador"
                        }
                        options={orqestraiCollaborators}
                        value={nomeIndicacaoColaboradorId}
                        onChange={setNomeIndicacaoColaboradorId}
                        disabled={loadingFormOptions}
                      />
                    ) : (
                    <SelectField label="Nome da Indicação *" className="min-w-0">
                      <Select
                        open={nomeIndicacaoOpen}
                        onOpenChange={setNomeIndicacaoOpen}
                        modal={false}
                        items={nomeIndicacaoItems}
                        value={nomeIndicacaoSelectValue}
                        onValueChange={(value) => {
                          if (value === "__new__") {
                            setNomeIndicacaoMode("new");
                            setNomeIndicacaoExisting("");
                            return;
                          }
                          setNomeIndicacaoMode("existing");
                          setNomeIndicacaoExisting(value ?? "");
                          setNomeIndicacaoNew("");
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            newLeadModalFieldClass,
                            "h-10 w-full justify-between font-normal whitespace-normal",
                          )}
                        >
                          <CrmSelectValue
                            value={nomeIndicacaoSelectValue}
                            labels={nomeIndicacaoItems}
                            placeholder="Selecione na base aprovada"
                          />
                        </SelectTrigger>
                        <CrmSelectContent inModal className="max-h-[min(280px,50dvh)]">
                          {approvedIndicators.map((name) => (
                            <CrmSelectItem key={name} value={name}>
                              {name}
                            </CrmSelectItem>
                          ))}
                          <CrmSelectItem value="__new__">
                            Não encontrei na base (cadastrar novo)
                          </CrmSelectItem>
                        </CrmSelectContent>
                      </Select>

                      {nomeIndicacaoMode === "new" ? (
                        <Input
                          value={nomeIndicacaoNew}
                          onChange={(e) => setNomeIndicacaoNew(e.target.value)}
                          placeholder="Nome para enviar à aprovação no admin"
                          className={cn(newLeadModalFieldClass, "mt-2")}
                        />
                      ) : null}
                    </SelectField>
                    )}
                  </div>
                ) : isCrossSelling ? (
                  <ClientPickerField
                    label="Cliente existente *"
                    placeholder={
                      loadingClients
                        ? "Carregando clientes..."
                        : "Selecione um cliente para cross selling"
                    }
                    options={clients}
                    value={aditivoClientId}
                    onChange={(id) => handleAditivoClientChange(id)}
                    disabled={loadingClients}
                    helperText="Ao selecionar um cliente, a razao social e o CNPJ da primeira empresa serao preenchidos automaticamente."
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-surface-subtle px-3 py-3 text-sm text-muted-foreground">
                    Sem campos extras para este tipo de lead. Você pode seguir para os
                    dados do solicitante.
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
          ) : null}

          {activeWizardStepId === "solicitante" ? (
          <SectionCard
            icon={UserCircle2}
            title="Solicitante e cadastro"
            subtitle="Defina quem originou o lead e confira quem está registrando esta jornada."
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <UserPickerField
                label="Solicitante *"
                placeholder={
                  loadingFormOptions ? "Carregando usuários..." : "Selecione o solicitante"
                }
                options={systemUsers}
                value={solicitanteUserId}
                onChange={setSolicitanteUserId}
                disabled={loadingFormOptions}
              />

              <CurrentUserSummary user={currentUser} loading={loadingFormOptions} />
            </div>
          </SectionCard>
          ) : null}

          {activeWizardStepId === "empresas" ? (
          <SectionCard
            icon={Building2}
            title="Dados da Empresa/Pessoa"
            subtitle="Informe a entidade principal do lead. Para Cross Selling, esses dados vêm do cliente escolhido no fluxo selecionado."
          >
            {isCrossSelling ? (
              <div className="rounded-(--radius-v2-xl) border border-success-border bg-success-bg px-4 py-3 text-sm text-success-text">
                Cross Selling usa o cliente selecionado no bloco de origem e preenche a
                primeira empresa automaticamente.
              </div>
            ) : null}

            <div className="space-y-3">
              {empresas.map((company, index) => (
                <div
                  key={`company-${index}`}
                  className="rounded-(--radius-v2-xl) border border-border bg-white p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Empresa/Pessoa {index + 1}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Dados usados na abertura e na ficha do lead.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={empresas.length === 1}
                      onClick={() => removeCompany(index)}
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_140px_1fr]">
                    <InputField label="Razão Social / Nome Completo *" className="min-w-0">
                      <Input
                        value={company.razao_social}
                        onChange={(e) =>
                          updateCompany(index, {
                            razao_social: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="NOME DA EMPRESA/PESSOA"
                        className={newLeadModalFieldClass}
                      />
                    </InputField>

                    <SelectField label="Tipo">
                      <Select
                        open={companyTypeOpenIndex === index}
                        onOpenChange={(open) =>
                          setCompanyTypeOpenIndex(open ? index : null)
                        }
                        modal={false}
                        items={DOCUMENTO_TIPO_ITEMS}
                        value={company.tipo_documento}
                        onValueChange={(value) => {
                          if (value === "CPF" || value === "CNPJ") {
                            updateCompany(index, { tipo_documento: value }, true);
                          }
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            newLeadModalFieldClass,
                            "h-10 w-full min-w-0 justify-between font-normal",
                          )}
                        >
                          <CrmSelectValue
                            value={company.tipo_documento}
                            labels={DOCUMENTO_TIPO_ITEMS}
                          />
                        </SelectTrigger>
                        <CrmSelectContent inModal className="max-h-[min(280px,50dvh)]">
                          <CrmSelectItem value="CPF">CPF</CrmSelectItem>
                          <CrmSelectItem value="CNPJ">CNPJ</CrmSelectItem>
                        </CrmSelectContent>
                      </Select>
                    </SelectField>

                    <InputField label="CPF ou CNPJ *">
                      <Input
                        value={company.documento}
                        onChange={(e) =>
                          updateCompany(index, {
                            documento: maskDocument(e.target.value, company.tipo_documento),
                          })
                        }
                        placeholder={
                          company.tipo_documento === "CPF"
                            ? "000.000.000-00"
                            : "00.000.000/0000-00"
                        }
                        className={newLeadModalFieldClass}
                      />
                    </InputField>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCompany}
              className="border-border bg-white text-foreground hover:bg-surface-hover"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Adicionar Empresa/Pessoa
            </Button>
          </SectionCard>
          ) : null}

          {activeWizardStepId === "areas" ? (
          <SectionCard
            icon={SearchCheck}
            title="Áreas de análise"
            subtitle="Selecione ao menos uma área para encaminhamento e visão operacional."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {leadAreas.map((area) => {
                const Icon = AREA_ICONS[area] ?? Scale;
                const checked = areasAnalise.includes(area);
                return (
                  <TagSelectable
                    key={area}
                    checked={checked}
                    onToggle={() => toggleArea(area)}
                    icon={Icon}
                  >
                    {area}
                  </TagSelectable>
                );
              })}
            </div>
            {!hasAreasSelected ? (
              <p className="text-xs text-red-500">Selecione ao menos uma área.</p>
            ) : null}
          </SectionCard>
          ) : null}

          {activeWizardStepId === "agenda" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard
              icon={ShieldCheck}
              title="Due Diligence"
              subtitle="Defina obrigatoriedade, prazo e horário de entrega."
            >
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-foreground">
                    Haverá Due Diligence? *
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-(--radius-v2-lg) border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-border-strong has-[:checked]:border-interactive-300 has-[:checked]:bg-interactive-50">
                      <input
                        type="radio"
                        name="due_diligence"
                        checked={dueDiligence === "Sim"}
                        onChange={() => setDueDiligence("Sim")}
                        className="size-4 accent-interactive-600"
                      />
                      Sim
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-(--radius-v2-lg) border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-border-strong has-[:checked]:border-interactive-300 has-[:checked]:bg-interactive-50">
                      <input
                        type="radio"
                        name="due_diligence"
                        checked={dueDiligence === "Nao"}
                        onChange={() => setDueDiligence("Nao")}
                        className="size-4 accent-interactive-600"
                      />
                      Não
                    </label>
                  </div>
                </div>

                {dueDiligence === "Sim" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-foreground">
                        Prazo de entrega do levantamento da base *
                      </Label>
                      <DateInputBr
                        value={prazoDue}
                        onChange={setPrazoDue}
                        className={newLeadModalFieldClass}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-foreground">
                        Horário de entrega do levantamento da base *
                      </Label>
                      <TimeInputBr
                        value={horarioDue}
                        onChange={setHorarioDue}
                        step={300}
                        suggestions={DUE_TIME_SUGGESTIONS}
                        className={cn(newLeadModalFieldClass, "font-mono")}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-surface-subtle px-3 py-3 text-sm text-muted-foreground">
                    Sem due diligence, o lead pode seguir para reunião diretamente.
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              icon={CalendarClock}
              title="Reunião"
              subtitle="Quando houver due diligence, a data deve respeitar o próximo dia útil."
            >
              <div className="grid gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-medium text-foreground">
                      Local da Reunião *
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setLocalReuniao(MEETING_LOCATION_PENDING)}
                      className="h-7 border-border bg-white px-2.5 text-[11px] font-medium text-muted-foreground shadow-none hover:border-interactive-300 hover:bg-interactive-50 hover:text-interactive-700"
                    >
                      Ainda sem local
                    </Button>
                  </div>
                  <Input
                    value={localReuniao}
                    onChange={(e) => setLocalReuniao(e.target.value)}
                    placeholder={`Ex.: Matriz São Paulo ou ${MEETING_LOCATION_PENDING}`}
                    className={newLeadModalFieldClass}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-foreground">
                      Data da Reunião {dueDiligence === "Sim" ? "*" : ""}
                    </Label>
                    <DateInputBr
                      value={dataReuniao}
                      onChange={setDataReuniao}
                      minYmd={
                        dueDiligence === "Sim" && reuniaoMinDate ? reuniaoMinDate : undefined
                      }
                      className={newLeadModalFieldClass}
                    />
                    {dueDiligence === "Sim" && reuniaoMinDate ? (
                      <p className="text-[11px] text-muted-foreground">
                        Mínimo permitido: {formatDateYmdBr(reuniaoMinDate)}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-foreground">
                      Horário da Reunião
                    </Label>
                    <TimeInputBr
                      value={horarioReuniao}
                      onChange={setHorarioReuniao}
                      step={300}
                      suggestions={MEETING_TIME_SUGGESTIONS}
                      className={cn(newLeadModalFieldClass, "font-mono")}
                    />
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
          ) : null}

          {activeWizardStepId === "revisao" ? (
            <SectionCard
              icon={CheckCircle2}
              title="Revisão final"
              subtitle="Confira o resumo antes de criar o lead e disparar os próximos fluxos."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <ReviewItem label="Tipo de lead" value={tipoLead} />
                <ReviewItem
                  label="Origem"
                  value={
                    tipoLead === "Indicacao"
                      ? `${tipoIndicacao || "Sem tipo"} · ${indicationDisplay}`
                      : isCrossSelling
                        ? selectedClient?.razao_social ?? "Cliente não selecionado"
                        : "Sem campos extras"
                  }
                />
                <ReviewItem label="Solicitante" value={solicitanteUser?.name ?? "Não selecionado"} />
                <ReviewItem label="Cadastrado por" value={currentUser?.name ?? currentUser?.email ?? "Não identificado"} />
                <ReviewItem
                  label="Empresas/Pessoas"
                  value={empresas
                    .map((empresa) => `${empresa.razao_social || "Sem nome"} (${empresa.documento || "sem documento"})`)
                    .join(" · ")}
                  className="md:col-span-2"
                />
                <ReviewItem
                  label="Áreas"
                  value={areasAnalise.length ? areasAnalise.join(", ") : "Nenhuma área selecionada"}
                  className="md:col-span-2"
                />
                <ReviewItem
                  label="Due diligence"
                  value={
                    dueDiligence === "Sim"
                      ? `Sim · ${prazoDue ? formatDateYmdBr(prazoDue) : "sem prazo"} ${horarioDue || ""}`
                      : "Não"
                  }
                />
                <ReviewItem
                  label="Reunião"
                  value={[
                    localReuniao || "Local não informado",
                    dataReuniao ? formatDateYmdBr(dataReuniao) : null,
                    horarioReuniao || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              </div>

              {!canSubmitLead ? (
                <div className="rounded-(--radius-v2-xl) border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
                  Ainda há pendências em etapas anteriores. Use Voltar ou clique na etapa marcada para corrigir antes de salvar.
                </div>
              ) : (
                <div className="rounded-(--radius-v2-xl) border border-success-border bg-success-bg px-4 py-3 text-sm text-success-text">
                  Tudo pronto para abrir o lead com seu usuário autenticado.
                </div>
              )}
            </SectionCard>
          ) : null}
          </div>
        </div>
      </div>

      <StickyFooter
        left={
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">
              {isReviewStep
                ? canSubmitLead
                  ? "Pronto para abrir o lead"
                  : "Revise as pendências antes de enviar"
                : `Etapa atual: ${activeWizardStep.label}`}
            </p>
            <p className="text-xs font-normal text-muted-foreground">
              {completedJourneySteps}/{journeySteps.length} etapas concluídas. Avance uma tela por vez para manter o cadastro organizado.
            </p>
          </div>
        }
        actions={
          <>
            {onRequestClose ? (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={isSaving}
                onClick={onRequestClose}
              >
                Cancelar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isSaving || currentStepIndex === 0}
              onClick={goToPreviousWizardStep}
            >
              Voltar
            </Button>
            {!isReviewStep ? (
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={isSaving}
                onClick={goToNextWizardStep}
              >
                Continuar
              </Button>
            ) : (
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!canSubmitLead}
              onClick={() => {
                if (validateBeforeConfirm()) {
                  setConfirmOpen(true);
                }
              }}
            >
              {isSaving ? "Salvando..." : canSubmitLead ? "Salvar novo lead" : "Complete os dados"}
            </Button>
            )}
          </>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar cadastro do novo lead?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O lead será criado e, se houver due diligence, o CRM enviará a
              notificação no WhatsApp configurado e criará o agendamento no SharePoint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel
              type="button"
              disabled={isSaving}
              className="mt-0"
            >
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={isSaving}
              onClick={() => {
                void submitLead();
              }}
            >
              {isSaving ? "Enviando..." : "Confirmar envio"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
