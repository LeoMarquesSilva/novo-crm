"use client";

import {
  type ComponentType,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Building2,
  CalendarClock,
  CheckCircle2,
  BriefcaseBusiness,
  Gavel,
  Handshake,
  Info,
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
  leadDigitalPlatforms,
  leadTypes,
  type NewLeadPayload,
} from "@/modules/crm/application/services/new-lead-payload";
import { leadTypeLabel } from "@/lib/crm/lead-type-label";
import { isValidCnpj, isValidCpf } from "@/lib/crm/rd-migration/documents";
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
import { formatDateYmdBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import {
  ChoiceCard,
  ClientPickerField,
  describedBy,
  FieldError,
  FormField,
  IndicatorPickerField,
  newLeadFieldIds,
  newLeadModalFieldClass,
  normalizeSearch,
  SectionCard,
  TagSelectable,
  UserPickerField,
  WizardHeader,
} from "@/components/crm/new-lead-modal";
import {
  ClienteDocumentoMatchPanel,
  type RelacaoContratoChoice,
} from "@/components/crm/cliente-documento-match-panel";
import type { ClienteCadastroRow } from "@/lib/crm/cliente-cadastro-cp-fields";
import type { ClienteContratoResumo } from "@/lib/crm/lookup-cliente-by-document";

interface NewDemandFormProps {
  /** `warning`: lead criado, mas algo não foi gravado/enviado (a tela precisa mostrar). */
  onSuccess?: (result: { oportunidadeId: string | null; warning: string | null }) => void;
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

const PLATFORM_SELECT_ITEMS: Record<string, string> = Object.fromEntries(
  leadDigitalPlatforms.map((item) => [item, item]),
);

const AREA_SELECT_ITEMS: Record<string, string> = Object.fromEntries(
  leadAreas.map((item) => [item, item]),
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
    "Lead de expansão sobre cliente já ativo, aproveitando o relacionamento existente para uma nova oportunidade.",
};

/** Resumo curto de cada origem, mostrado no cartão de escolha. */
const LEAD_TYPE_HINT: Record<(typeof leadTypes)[number], string> = {
  Indicacao: "Recomendação de cliente ou parceiro",
  "Lead Ativa": "Prospectado pelo time comercial",
  "Lead Digital": "Site, redes sociais ou campanhas",
  "Lead Passiva": "Chegou de forma espontânea",
  "Cross Selling": "Nova área para cliente ativo",
};

/** Título do bloco de dados que cada origem abre logo abaixo da escolha. */
const LEAD_TYPE_DETAIL_TITLE: Record<(typeof leadTypes)[number], string> = {
  Indicacao: "Dados da indicação",
  "Lead Ativa": "Lead ativa",
  "Lead Digital": "Canal digital",
  "Lead Passiva": "Lead passiva",
  "Cross Selling": "Cliente e nova área",
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
  { id: "origem", label: "Origem" },
  { id: "solicitante", label: "Captador" },
  { id: "empresas", label: "Empresas" },
  { id: "areas", label: "Áreas" },
  { id: "agenda", label: "Agenda" },
  { id: "revisao", label: "Revisão" },
] as const;

type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

/** Pendência de uma etapa: a mensagem de validação e o campo a que ela se refere. */
interface WizardStepIssue {
  field: string;
  message: string;
}

const STEP_HEADING_ID = "new-lead-step-heading";

/** Foca o controle do campo (ou o primeiro focável dentro do bloco) e o traz à vista. */
function focusNewLeadField(field: string) {
  const target = document.getElementById(field === "step-heading" ? STEP_HEADING_ID : newLeadFieldIds(field).id);
  if (!target) return;
  const focusable = target.matches("input, button, select, textarea, [tabindex]")
    ? target
    : target.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
  (focusable ?? target).focus({ preventScroll: true });
  // Campo com erro vai ao centro para a mensagem logo abaixo dele também ficar visível.
  (focusable ?? target).scrollIntoView({ block: field === "step-heading" ? "nearest" : "center" });
}

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
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <p className="text-v2-body-sm font-semibold text-foreground">Cadastro realizado por</p>
        <span className="rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-v2-caption text-muted-foreground">
          Automático
        </span>
      </div>

      {loading ? (
        <div className="h-[58px] animate-pulse rounded-(--radius-v2-md) bg-neutral-100" />
      ) : user ? (
        <div className="flex items-center gap-3 rounded-(--radius-v2-md) border border-border bg-surface-subtle px-3 py-2.5">
          <Avatar className="h-9 w-9 border border-border">
            <AvatarImage src={user.avatarUrl} alt="" />
            <AvatarFallback>{initialsFromName(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-v2-body-sm font-semibold text-foreground">{user.name}</p>
            <p className="truncate text-v2-caption text-muted-foreground">{user.email}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-2.5 text-v2-body-sm text-warning-text">
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
  onEdit,
}: {
  label: string;
  value: string;
  className?: string;
  /** Volta para a etapa onde o dado é preenchido. */
  onEdit?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-border py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <dt className="text-v2-caption text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-v2-body-sm-medium break-words text-foreground">
          {value || "Não informado"}
        </dd>
      </div>
      {onEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`Alterar ${label.toLowerCase()}`}
          className="h-7 shrink-0 px-2 text-xs font-semibold text-primary hover:text-interactive-700"
        >
          Alterar
        </Button>
      ) : null}
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
  // Data/horário digitado inválido na Agenda (o campo some com o valor; isto barra o avanço mesmo em campo opcional).
  const [agendaInvalida, setAgendaInvalida] = useState<Record<string, boolean>>({});
  const marcarAgendaInvalida = (field: string) => (invalid: boolean) =>
    setAgendaInvalida((prev) => (prev[field] === invalid ? prev : { ...prev, [field]: invalid }));
  const [tipoLead, setTipoLead] = useState<(typeof leadTypes)[number]>("Indicacao");
  const [tipoIndicacao, setTipoIndicacao] = useState("");
  const [plataforma, setPlataforma] = useState("");
  const [areaCrossSelling, setAreaCrossSelling] = useState("");
  const [decisor, setDecisor] = useState("");
  const [nomeIndicacaoMode, setNomeIndicacaoMode] = useState<"existing" | "new" | "colaborador">(
    "existing",
  );
  const [nomeIndicacaoExisting, setNomeIndicacaoExisting] = useState("");
  const [nomeIndicacaoNew, setNomeIndicacaoNew] = useState("");
  const [nomeIndicacaoColaboradorId, setNomeIndicacaoColaboradorId] = useState("");
  const [tipoIndicacaoOpen, setTipoIndicacaoOpen] = useState(false);
  const [companyTypeOpenIndex, setCompanyTypeOpenIndex] = useState<number | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [clienteLookupLoading, setClienteLookupLoading] = useState(false);
  const [matchedCliente, setMatchedCliente] = useState<ClienteCadastroRow | null>(null);
  const [matchedBy, setMatchedBy] = useState<"documento" | "cnpj_raiz" | null>(null);
  const [matchedContratos, setMatchedContratos] = useState<ClienteContratoResumo[]>([]);
  const [relacaoContrato, setRelacaoContrato] = useState<RelacaoContratoChoice | null>(null);
  const [contratoBaseId, setContratoBaseId] = useState("");
  /** Etapa em que o usuário tentou avançar com pendência: a partir daí os erros aparecem nos campos. */
  const [validatedStep, setValidatedStep] = useState<WizardStepId | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ field: string; nonce: number } | null>(null);

  const isCrossSelling = tipoLead === "Cross Selling";
  const isLeadDigital = tipoLead === "Lead Digital";
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
    if (isLeadDigital) return Boolean(plataforma);
    if (isCrossSelling) {
      return Boolean(aditivoClientId && areaCrossSelling);
    }
    return true;
  }, [
    aditivoClientId,
    areaCrossSelling,
    isCrossSelling,
    isLeadDigital,
    nomeIndicacaoColaboradorId,
    nomeIndicacaoExisting,
    nomeIndicacaoMode,
    nomeIndicacaoNew,
    plataforma,
    tipoIndicacao,
    tipoLead,
  ]);
  const hasDueDiligencePlan = dueDiligence === "Nao" || Boolean(prazoDue && horarioDue);
  const hasMeetingPlan =
    Boolean(localReuniao.trim()) && (dueDiligence === "Nao" || Boolean(dataReuniao));
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
  // Orientação (não bloqueia) para o nome novo: pedir sobrenome e evitar duplicar a base.
  const nomeIndicacaoNovo = nomeIndicacaoNew.trim();
  const nomeIndicacaoNovoSemSobrenome =
    nomeIndicacaoNovo.length > 0 && nomeIndicacaoNovo.split(/\s+/).length < 2;
  const nomeIndicacaoNovoNaBase = nomeIndicacaoNovo
    ? approvedIndicators.find((name) => normalizeSearch(name) === normalizeSearch(nomeIndicacaoNovo))
    : undefined;

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
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => focusNewLeadField(focusRequest.field));
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  useEffect(() => {
    if (!isCrossSelling) {
      setAditivoClientId("");
    }
  }, [isCrossSelling]);

  useEffect(() => {
    if (isCrossSelling) return;
    const doc = empresas[0]?.documento ?? "";
    const digits = doc.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) {
      setMatchedCliente(null);
      setMatchedBy(null);
      setMatchedContratos([]);
      setRelacaoContrato(null);
      setContratoBaseId("");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setClienteLookupLoading(true);
      fetch(`/api/crm/clients/lookup?documento=${encodeURIComponent(doc)}`, {
        cache: "no-store",
      })
        .then(async (res) => {
          const json = (await res.json()) as {
            ok?: boolean;
            error?: string;
            data?: {
              found: boolean;
              matchedBy: "documento" | "cnpj_raiz" | null;
              cliente: ClienteCadastroRow | null;
              contratos: ClienteContratoResumo[];
            };
          };
          if (!res.ok || !json.ok || !json.data) {
            throw new Error(json.error ?? "Falha ao consultar cliente.");
          }
          return json.data;
        })
        .then((data) => {
          if (cancelled) return;
          if (!data.found || !data.cliente) {
            setMatchedCliente(null);
            setMatchedBy(null);
            setMatchedContratos([]);
            setRelacaoContrato(null);
            setContratoBaseId("");
            return;
          }
          setMatchedCliente(data.cliente);
          setMatchedBy(data.matchedBy);
          setMatchedContratos(data.contratos);
          setRelacaoContrato((prev) => prev ?? "novo");
          setEmpresas((prev) => {
            const first = prev[0];
            if (!first) return prev;
            const rs = data.cliente!.razao_social.trim().toUpperCase();
            if (first.razao_social.trim() === rs) return prev;
            return [{ ...first, razao_social: rs }, ...prev.slice(1)];
          });
        })
        .catch(() => {
          if (cancelled) return;
          setMatchedCliente(null);
          setMatchedBy(null);
          setMatchedContratos([]);
        })
        .finally(() => {
          if (!cancelled) setClienteLookupLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [empresas[0]?.documento, isCrossSelling]);

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
    setAgendaInvalida({});
    setTipoLead("Indicacao");
    setTipoIndicacao("");
    setPlataforma("");
    setAreaCrossSelling("");
    setDecisor("");
    setNomeIndicacaoMode("existing");
    setNomeIndicacaoExisting("");
    setNomeIndicacaoNew("");
    setTipoIndicacaoOpen(false);
    setCompanyTypeOpenIndex(null);
    setCurrentStepIndex(0);
    setValidatedStep(null);
    setClienteLookupLoading(false);
    setMatchedCliente(null);
    setMatchedBy(null);
    setMatchedContratos([]);
    setRelacaoContrato(null);
    setContratoBaseId("");
  }

  function resolveClienteVinculo(): {
    cliente_id: string | null;
    relacao_contrato: RelacaoContratoChoice | null;
    contrato_base_id: string | null;
  } {
    if (isCrossSelling && aditivoClientId) {
      return {
        cliente_id: aditivoClientId,
        relacao_contrato: "novo",
        contrato_base_id: null,
      };
    }
    if (matchedCliente && relacaoContrato) {
      return {
        cliente_id: matchedCliente.id,
        relacao_contrato: relacaoContrato,
        contrato_base_id: relacaoContrato === "aditivo" ? contratoBaseId || null : null,
      };
    }
    return { cliente_id: null, relacao_contrato: null, contrato_base_id: null };
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

  function getWizardStepIssue(stepId: WizardStepId): WizardStepIssue | null {
    const issue = (field: string, message: string): WizardStepIssue => ({ field, message });

    if (stepId === "origem") {
      if (tipoLead === "Indicacao" && !tipoIndicacao) {
        return issue("tipoIndicacao", "Selecione o tipo de indicação.");
      }
      if (tipoLead === "Indicacao" && nomeIndicacaoMode === "existing" && !nomeIndicacaoExisting) {
        return issue("nomeIndicacao", "Selecione o nome da indicação ou cadastre um novo.");
      }
      if (tipoLead === "Indicacao" && nomeIndicacaoMode === "new" && !nomeIndicacaoNew.trim()) {
        return issue("nomeIndicacaoNew", "Informe o nome da indicação para aprovação.");
      }
      if (
        tipoLead === "Indicacao" &&
        nomeIndicacaoMode === "colaborador" &&
        !nomeIndicacaoColaboradorId
      ) {
        return issue("colaboradorIndicacao", "Selecione o colaborador que fez a indicação.");
      }
      if (isLeadDigital && !plataforma) return issue("plataforma", "Selecione a plataforma.");
      if (isCrossSelling && !aditivoClientId) {
        return issue("crossCliente", "Selecione um cliente existente para o fluxo de cross selling.");
      }
      if (isCrossSelling && !areaCrossSelling) {
        return issue("crossArea", "Selecione a área do cross selling.");
      }
      return null;
    }

    if (stepId === "solicitante") {
      if (!currentUser?.email) {
        return issue("cadastradoPor", "Não foi possível identificar o usuário logado.");
      }
      if (!solicitanteUser) return issue("captador", "Selecione o captador do lead.");
      return null;
    }

    if (stepId === "empresas") {
      const incompleteIndex = empresas.findIndex(
        (item) => !item.razao_social.trim() || !item.documento.trim(),
      );
      if (incompleteIndex >= 0) {
        const part = empresas[incompleteIndex]!.razao_social.trim() ? "documento" : "razao";
        return issue(
          `empresa-${incompleteIndex}-${part}`,
          "Preencha razão social/nome e CPF/CNPJ de todos os itens.",
        );
      }
      // Dígito verificador (teste ponta a ponta 4: CNPJ com o último dígito errado passava para a etapa seguinte).
      const invalidIndex = empresas.findIndex((item) =>
        item.tipo_documento === "CPF" ? !isValidCpf(item.documento) : !isValidCnpj(item.documento),
      );
      if (invalidIndex >= 0) {
        const tipo = empresas[invalidIndex]!.tipo_documento;
        return issue(
          `empresa-${invalidIndex}-documento`,
          `${tipo} inválido: o dígito verificador não confere. Confira os números.`,
        );
      }
      if (!isCrossSelling && matchedCliente && !relacaoContrato) {
        return issue("relacaoContrato", "Informe se a demanda é contrato novo ou aditivo.");
      }
      if (
        !isCrossSelling &&
        matchedCliente &&
        relacaoContrato === "aditivo" &&
        !contratoBaseId
      ) {
        return issue("relacaoContrato", "Selecione o contrato base para o aditivo.");
      }
      return null;
    }

    if (stepId === "areas") {
      if (!hasAreasSelected) return issue("areas", "Selecione ao menos uma área de análise.");
      return null;
    }

    if (stepId === "agenda") {
      const campoInvalido = ["prazoDue", "horarioDue", "dataReuniao", "horarioReuniao"].find(
        (field) => agendaInvalida[field] && (dueDiligence === "Sim" || !field.endsWith("Due")),
      );
      if (campoInvalido) {
        return issue(
          campoInvalido,
          campoInvalido.startsWith("horario")
            ? "Horário inválido: use de 00:00 a 23:59."
            : "Data inválida: confira dia, mês e ano.",
        );
      }
      if (dueDiligence === "Sim" && (!prazoDue || !horarioDue)) {
        return issue(prazoDue ? "horarioDue" : "prazoDue", "Informe prazo e horário da due diligence.");
      }
      if (!localReuniao.trim()) {
        return issue("localReuniao", "Informe o local da reunião ou marque como a definir.");
      }
      if (dueDiligence === "Sim" && !dataReuniao) {
        return issue("dataReuniao", "Informe a data da reunião para due diligence.");
      }
      if (dueDiligence === "Sim" && reuniaoMinDate && dataReuniao < reuniaoMinDate) {
        return issue(
          "dataReuniao",
          "Data da reunião deve respeitar ao menos 1 dia útil após o prazo da base.",
        );
      }
      return null;
    }

    return validateBeforeConfirm()
      ? null
      : issue("revisao", "Revise as pendências antes de salvar.");
  }

  function requestFocus(field: string) {
    setFocusRequest({ field, nonce: Date.now() });
  }

  /** Mostra os erros da etapa nos próprios campos e leva o foco ao primeiro pendente. */
  function showStepIssue(stepId: WizardStepId, issue: WizardStepIssue) {
    setValidatedStep(stepId);
    setError(null);
    requestFocus(issue.field);
  }

  function selectWizardStep(stepId: WizardStepId) {
    const nextIndex = WIZARD_STEPS.findIndex((step) => step.id === stepId);
    if (nextIndex < 0 || nextIndex === currentStepIndex) return;
    if (nextIndex < currentStepIndex) {
      setCurrentStepIndex(nextIndex);
      setError(null);
      requestFocus("step-heading");
      return;
    }

    for (let index = 0; index < nextIndex; index += 1) {
      const pendingStepId = WIZARD_STEPS[index]!.id;
      const issue = getWizardStepIssue(pendingStepId);
      if (issue) {
        setCurrentStepIndex(index);
        showStepIssue(pendingStepId, issue);
        return;
      }
    }
    setCurrentStepIndex(nextIndex);
    setError(null);
    requestFocus("step-heading");
  }

  function goToNextWizardStep() {
    const issue = getWizardStepIssue(activeWizardStepId);
    if (issue) {
      showStepIssue(activeWizardStepId, issue);
      setWarning(null);
      return;
    }
    setError(null);
    setCurrentStepIndex((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
    requestFocus("step-heading");
  }

  function goToPreviousWizardStep() {
    setError(null);
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
    requestFocus("step-heading");
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

    if (isLeadDigital && !plataforma) {
      setError("Selecione a plataforma.");
      return false;
    }

    if (isCrossSelling && !aditivoClientId) {
      setError("Selecione um cliente existente para o fluxo de cross selling.");
      return false;
    }

    if (isCrossSelling && !areaCrossSelling) {
      setError("Selecione a área do cross selling.");
      return false;
    }

    if (empresas.some((item) => !item.razao_social.trim() || !item.documento.trim())) {
      setError("Preencha razão social/nome e CPF/CNPJ de todos os itens.");
      return false;
    }

    if (!isCrossSelling && matchedCliente && !relacaoContrato) {
      setError("Informe se a demanda é contrato novo ou aditivo.");
      return false;
    }
    if (
      !isCrossSelling &&
      matchedCliente &&
      relacaoContrato === "aditivo" &&
      !contratoBaseId
    ) {
      setError("Selecione o contrato base para o aditivo.");
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
      setError("Selecione o captador e recarregue a identificação do usuário logado.");
      setConfirmOpen(false);
      return;
    }

    setIsSaving(true);
    setError(null);
    setWarning(null);
    setSuccess(null);

    const vinculo = resolveClienteVinculo();

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
      plataforma: isLeadDigital ? (plataforma as NewLeadPayload["plataforma"]) : null,
      area_cross_selling: isCrossSelling
        ? (areaCrossSelling as NewLeadPayload["area_cross_selling"])
        : null,
      decisor: decisor.trim() || null,
      contexto_comercial: null,
      cliente_id: vinculo.cliente_id,
      contrato_base_id: vinculo.contrato_base_id,
      relacao_contrato: vinculo.relacao_contrato,
    };

    type ApiResult = {
      ok?: boolean;
      error?: string;
      warning?: string | null;
      data?: { oportunidade_id?: string };
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
      onSuccess?.({
        oportunidadeId: result.data?.oportunidade_id ?? null,
        warning: result.warning ?? null,
      });
    } catch {
      setError("Erro de rede ao salvar lead.");
      finishSaving();
    }
  }

  const SelectedLeadIcon = LEAD_TYPE_ICONS[tipoLead];
  const indicationDisplay =
    tipoLead === "Indicacao"
      ? nomeIndicacaoMode === "existing"
        ? nomeIndicacaoExisting || "Não informado"
        : nomeIndicacaoMode === "colaborador"
          ? nomeIndicacaoColaboradorNome || "Não informado"
          : nomeIndicacaoNew.trim() || "Não informado"
      : "Não aplicável";
  const selectedClient = clients.find((client) => client.id === aditivoClientId);
  const originHasFields = tipoLead === "Indicacao" || isLeadDigital || isCrossSelling;
  const pendingSteps = wizardStepStatus.filter((step) => step.id !== "revisao" && !step.done);

  /** Erros só aparecem depois de uma tentativa de avançar e somem assim que o campo é corrigido. */
  const showStepErrors = validatedStep === activeWizardStepId && !isReviewStep;
  const liveIssue = showStepErrors ? getWizardStepIssue(activeWizardStepId) : null;

  function fieldError(field: string) {
    return liveIssue?.field === field ? liveIssue.message : null;
  }

  /** Props do `FormField`: label associado, ajuda e erro do campo. */
  function formFieldProps(field: string) {
    const ids = newLeadFieldIds(field);
    return { htmlFor: ids.id, hintId: ids.hintId, errorId: ids.errorId, error: fieldError(field) };
  }

  /** Props do controle: id, `aria-invalid` e `aria-describedby` (erro ou ajuda). */
  function controlProps(field: string, options?: { hasHint?: boolean; invalid?: boolean }) {
    const ids = newLeadFieldIds(field);
    const message = fieldError(field);
    return {
      id: ids.id,
      "aria-invalid": Boolean(message) || Boolean(options?.invalid) || undefined,
      "aria-describedby": describedBy(message ? ids.errorId : options?.hasHint && ids.hintId),
    };
  }

  return (
    <div
      ref={modalPortalRef}
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white"
    >
      <WizardHeader
        title="Novo lead"
        steps={wizardStepStatus.map((step) => ({
          id: step.id,
          label: step.label,
          done: step.done,
          active: step.id === activeWizardStepId,
          available: step.available,
        }))}
        onSelectStep={(stepId) => selectWizardStep(stepId as WizardStepId)}
        onRequestClose={onRequestClose}
        closeLabel="Fechar cadastro"
      />

      <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1040px] px-4 py-5 sm:px-6">
          <div ref={feedbackRef} className="mb-5 space-y-3 scroll-mt-4 empty:hidden">
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

          {activeWizardStepId === "origem" ? (
            <SectionCard
              variant="plain"
              headingId={STEP_HEADING_ID}
              icon={Handshake}
              title="Origem do lead"
              subtitle="Como o lead chegou ao escritório. Cada origem pede dados próprios, logo abaixo da escolha."
            >
              <div
                role="radiogroup"
                aria-labelledby={STEP_HEADING_ID}
                className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5"
              >
                {leadTypes.map((item) => (
                  <ChoiceCard
                    key={item}
                    name="new-lead-origem"
                    value={item}
                    checked={tipoLead === item}
                    onChange={() => {
                      setTipoLead(item);
                      // Outra origem abre outros campos: não herdar os erros da tentativa anterior.
                      setValidatedStep(null);
                      if (item !== "Lead Digital") setPlataforma("");
                      if (item !== "Cross Selling") setAreaCrossSelling("");
                    }}
                    icon={LEAD_TYPE_ICONS[item]}
                    title={leadTypeLabel(item)}
                    description={LEAD_TYPE_HINT[item]}
                  />
                ))}
              </div>

              <div
                role="group"
                aria-labelledby="new-lead-origem-detalhes"
                className="rounded-(--radius-v2-xl) border border-border bg-surface-subtle p-4 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border bg-white text-interactive-700"
                  >
                    <SelectedLeadIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p
                      id="new-lead-origem-detalhes"
                      className="text-v2-body-md font-semibold text-foreground"
                    >
                      {LEAD_TYPE_DETAIL_TITLE[tipoLead]}
                    </p>
                    <p className="text-v2-body-sm text-muted-foreground">{LEAD_TYPE_HELP[tipoLead]}</p>
                  </div>
                </div>

                {tipoLead === "Indicacao" ? (
                  <div key="indicacao" className="mt-4 grid gap-4 md:grid-cols-2">
                    <FormField label="Tipo de indicação" {...formFieldProps("tipoIndicacao")}>
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
                          {...controlProps("tipoIndicacao")}
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
                    </FormField>

                    {isIndicacaoColaborador ? (
                      <FormField
                        label="Colaborador que indicou"
                        {...formFieldProps("colaboradorIndicacao")}
                      >
                        <UserPickerField
                          {...controlProps("colaboradorIndicacao")}
                          placeholder={
                            loadingFormOptions
                              ? "Carregando colaboradores..."
                              : "Selecione o colaborador"
                          }
                          options={orqestraiCollaborators}
                          value={nomeIndicacaoColaboradorId}
                          onChange={setNomeIndicacaoColaboradorId}
                          disabled={loadingFormOptions}
                        />
                      </FormField>
                    ) : (
                      <FormField
                        label="Nome da indicação"
                        hint={
                          approvedIndicators.length > 0
                            ? `Pesquise entre os ${approvedIndicators.length} nomes aprovados.`
                            : "Pesquise na base de indicadores aprovados."
                        }
                        {...formFieldProps("nomeIndicacao")}
                      >
                        <IndicatorPickerField
                          {...controlProps("nomeIndicacao", { hasHint: true })}
                          placeholder={
                            loadingFormOptions ? "Carregando a base..." : "Pesquisar na base aprovada"
                          }
                          options={approvedIndicators}
                          value={nomeIndicacaoExisting}
                          isNew={nomeIndicacaoMode === "new"}
                          disabled={loadingFormOptions}
                          onChange={(name) => {
                            setNomeIndicacaoMode("existing");
                            setNomeIndicacaoExisting(name);
                            setNomeIndicacaoNew("");
                          }}
                          onRegisterNew={(typedName) => {
                            setNomeIndicacaoMode("new");
                            setNomeIndicacaoExisting("");
                            if (typedName) setNomeIndicacaoNew(typedName);
                            requestFocus("nomeIndicacaoNew");
                          }}
                        />
                      </FormField>
                    )}

                    {!isIndicacaoColaborador && nomeIndicacaoMode === "new" ? (
                      <FormField
                        label="Nome e sobrenome de quem indicou"
                        hintTone={
                          nomeIndicacaoNovoNaBase ? "info" : nomeIndicacaoNovoSemSobrenome ? "warning" : "muted"
                        }
                        hint={
                          nomeIndicacaoNovoNaBase ? (
                            <>
                              Este nome já está na base aprovada.{" "}
                              <button
                                type="button"
                                onClick={() => {
                                  setNomeIndicacaoMode("existing");
                                  setNomeIndicacaoExisting(nomeIndicacaoNovoNaBase);
                                  setNomeIndicacaoNew("");
                                  requestFocus("nomeIndicacao");
                                }}
                                className="rounded-sm font-semibold underline underline-offset-2 outline-none hover:text-interactive-700 focus-visible:ring-3 focus-visible:ring-ring/20"
                              >
                                Usar “{nomeIndicacaoNovoNaBase}”
                              </button>
                            </>
                          ) : nomeIndicacaoNovoSemSobrenome ? (
                            "Parece só o primeiro nome. Inclua o sobrenome para não confundir com outra pessoa na aprovação."
                          ) : (
                            "Escreva o nome completo, com sobrenome. Ele passa pela aprovação da administração antes de entrar na base."
                          )
                        }
                        className="md:col-span-2"
                        {...formFieldProps("nomeIndicacaoNew")}
                      >
                        <Input
                          {...controlProps("nomeIndicacaoNew", { hasHint: true })}
                          value={nomeIndicacaoNew}
                          onChange={(e) => setNomeIndicacaoNew(e.target.value)}
                          placeholder="Ex.: Maria Souza Lima"
                          autoComplete="off"
                          autoCapitalize="words"
                          className={newLeadModalFieldClass}
                        />
                      </FormField>
                    ) : null}
                  </div>
                ) : isLeadDigital ? (
                  <div key="digital" className="mt-4 grid gap-4 md:grid-cols-2">
                    <FormField label="Plataforma" {...formFieldProps("plataforma")}>
                      <Select
                        modal={false}
                        items={PLATFORM_SELECT_ITEMS}
                        value={plataforma}
                        onValueChange={(value) => setPlataforma(value ?? "")}
                      >
                        <SelectTrigger
                          {...controlProps("plataforma")}
                          className={cn(
                            newLeadModalFieldClass,
                            "h-10 w-full justify-between font-normal",
                          )}
                        >
                          <CrmSelectValue
                            value={plataforma}
                            labels={PLATFORM_SELECT_ITEMS}
                            placeholder="Selecione"
                          />
                        </SelectTrigger>
                        <CrmSelectContent inModal>
                          {leadDigitalPlatforms.map((item) => (
                            <CrmSelectItem key={item} value={item}>
                              {item}
                            </CrmSelectItem>
                          ))}
                        </CrmSelectContent>
                      </Select>
                    </FormField>
                  </div>
                ) : isCrossSelling ? (
                  <div key="cross-selling" className="mt-4 grid gap-4 md:grid-cols-2">
                    <FormField
                      label="Cliente existente"
                      hint="A razão social e o documento da primeira empresa vêm deste cliente."
                      {...formFieldProps("crossCliente")}
                    >
                      <ClientPickerField
                        {...controlProps("crossCliente", { hasHint: true })}
                        placeholder={
                          loadingClients
                            ? "Carregando clientes..."
                            : "Selecione um cliente para cross selling"
                        }
                        options={clients}
                        value={aditivoClientId}
                        onChange={(id) => handleAditivoClientChange(id)}
                        disabled={loadingClients}
                      />
                    </FormField>
                    <FormField label="Área" {...formFieldProps("crossArea")}>
                      <Select
                        modal={false}
                        items={AREA_SELECT_ITEMS}
                        value={areaCrossSelling}
                        onValueChange={(value) => setAreaCrossSelling(value ?? "")}
                      >
                        <SelectTrigger
                          {...controlProps("crossArea")}
                          className={cn(
                            newLeadModalFieldClass,
                            "h-10 w-full justify-between font-normal",
                          )}
                        >
                          <CrmSelectValue
                            value={areaCrossSelling}
                            labels={AREA_SELECT_ITEMS}
                            placeholder="Selecione"
                          />
                        </SelectTrigger>
                        <CrmSelectContent inModal>
                          {leadAreas.map((item) => (
                            <CrmSelectItem key={item} value={item}>
                              {item}
                            </CrmSelectItem>
                          ))}
                        </CrmSelectContent>
                      </Select>
                    </FormField>
                  </div>
                ) : null}

                {!originHasFields ? (
                  <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-v2-body-sm text-muted-foreground">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Esta origem não pede dados adicionais. Continue para o captador.
                  </p>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {activeWizardStepId === "solicitante" ? (
            <SectionCard
              variant="plain"
              headingId={STEP_HEADING_ID}
              icon={UserCircle2}
              title="Captador e cadastro"
              subtitle="Quem captou o lead e quem está registrando este cadastro."
            >
              <div className="grid items-start gap-4 md:grid-cols-2">
                <FormField label="Captador" {...formFieldProps("captador")}>
                  <UserPickerField
                    {...controlProps("captador")}
                    placeholder={
                      loadingFormOptions ? "Carregando usuários..." : "Selecione o captador"
                    }
                    options={systemUsers}
                    value={solicitanteUserId}
                    onChange={setSolicitanteUserId}
                    disabled={loadingFormOptions}
                  />
                </FormField>

                <div id={newLeadFieldIds("cadastradoPor").id} className="space-y-1.5">
                  <CurrentUserSummary user={currentUser} loading={loadingFormOptions} />
                  {fieldError("cadastradoPor") ? (
                    <FieldError id={newLeadFieldIds("cadastradoPor").errorId}>
                      {fieldError("cadastradoPor")}
                    </FieldError>
                  ) : null}
                </div>
              </div>
            </SectionCard>
          ) : null}

          {activeWizardStepId === "empresas" ? (
            <SectionCard
              variant="plain"
              headingId={STEP_HEADING_ID}
              icon={Building2}
              title="Empresas e pessoas"
              subtitle="Quem é o cliente em potencial. O documento da primeira empresa é consultado na base de clientes."
            >
              {isCrossSelling ? (
                <p className="flex items-start gap-2 rounded-(--radius-v2-lg) border border-info-border bg-info-bg px-3 py-2.5 text-v2-body-sm text-info-text">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Cross Selling usa o cliente escolhido na origem e preenche a primeira empresa
                  automaticamente.
                </p>
              ) : null}

              <FormField
                label="Decisor"
                optional
                className="md:max-w-md"
                {...formFieldProps("decisor")}
              >
                <Input
                  {...controlProps("decisor")}
                  value={decisor}
                  onChange={(event) => setDecisor(event.target.value)}
                  placeholder="Nome do decisor na empresa"
                  className={newLeadModalFieldClass}
                />
              </FormField>

              <div className="space-y-3">
                {empresas.map((company, index) => {
                  const razaoIds = newLeadFieldIds(`empresa-${index}-razao`);
                  const tipoIds = newLeadFieldIds(`empresa-${index}-tipo`);
                  const documentoIds = newLeadFieldIds(`empresa-${index}-documento`);
                  const razaoError =
                    showStepErrors && !company.razao_social.trim()
                      ? "Informe a razão social ou o nome."
                      : null;
                  const documentoError =
                    showStepErrors && !company.documento.trim() ? "Informe o CPF ou o CNPJ." : null;

                  return (
                    <div
                      key={`company-${index}`}
                      className="rounded-(--radius-v2-xl) border border-border p-4"
                    >
                      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
                        <p className="text-v2-body-sm font-semibold text-foreground">
                          Empresa/Pessoa {index + 1}
                        </p>
                        {empresas.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeCompany(index)}
                            aria-label={`Remover empresa/pessoa ${index + 1}`}
                            className="text-muted-foreground hover:text-danger-text"
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)]">
                        <FormField
                          label="Razão social / nome completo"
                          htmlFor={razaoIds.id}
                          errorId={razaoIds.errorId}
                          error={razaoError}
                          className="col-span-2 md:col-span-1"
                        >
                          <Input
                            id={razaoIds.id}
                            aria-invalid={Boolean(razaoError) || undefined}
                            aria-describedby={describedBy(razaoError && razaoIds.errorId)}
                            value={company.razao_social}
                            onChange={(e) =>
                              updateCompany(index, {
                                razao_social: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="NOME DA EMPRESA/PESSOA"
                            className={newLeadModalFieldClass}
                          />
                        </FormField>

                        <FormField label="Tipo" htmlFor={tipoIds.id}>
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
                              id={tipoIds.id}
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
                        </FormField>

                        <FormField
                          label={company.tipo_documento === "CPF" ? "CPF" : "CNPJ"}
                          htmlFor={documentoIds.id}
                          errorId={documentoIds.errorId}
                          error={documentoError}
                        >
                          <Input
                            id={documentoIds.id}
                            inputMode="numeric"
                            aria-invalid={Boolean(documentoError) || undefined}
                            aria-describedby={describedBy(documentoError && documentoIds.errorId)}
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
                            className={cn(newLeadModalFieldClass, "tabular-nums")}
                          />
                        </FormField>
                      </div>

                      {index === 0 && !isCrossSelling ? (
                        <div id={newLeadFieldIds("relacaoContrato").id}>
                          <ClienteDocumentoMatchPanel
                            className="mt-3"
                            loading={clienteLookupLoading}
                            cliente={matchedCliente}
                            matchedBy={matchedBy}
                            contratos={matchedContratos}
                            relacaoContrato={relacaoContrato}
                            onRelacaoChange={(value) => {
                              setRelacaoContrato(value);
                              if (value !== "aditivo") setContratoBaseId("");
                            }}
                            contratoBaseId={contratoBaseId}
                            onContratoBaseChange={setContratoBaseId}
                          />
                          {fieldError("relacaoContrato") ? (
                            <div className="mt-1.5">
                              <FieldError id={newLeadFieldIds("relacaoContrato").errorId}>
                                {fieldError("relacaoContrato")}
                              </FieldError>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addCompany}>
                <Plus aria-hidden />
                Adicionar empresa/pessoa
              </Button>
            </SectionCard>
          ) : null}

          {activeWizardStepId === "areas" ? (
            <SectionCard
              variant="plain"
              headingId={STEP_HEADING_ID}
              icon={SearchCheck}
              title="Áreas de análise"
              subtitle="Selecione uma ou mais áreas para o encaminhamento do lead."
            >
              <div
                id={newLeadFieldIds("areas").id}
                role="group"
                aria-labelledby={STEP_HEADING_ID}
                aria-describedby={describedBy(
                  fieldError("areas") && newLeadFieldIds("areas").errorId,
                )}
                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
              >
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
              {fieldError("areas") ? (
                <FieldError id={newLeadFieldIds("areas").errorId}>{fieldError("areas")}</FieldError>
              ) : (
                <p className="text-v2-caption text-muted-foreground tabular-nums">
                  {areasAnalise.length === 0
                    ? "Nenhuma área selecionada."
                    : areasAnalise.length === 1
                      ? "1 área selecionada."
                      : `${areasAnalise.length} áreas selecionadas.`}
                </p>
              )}
            </SectionCard>
          ) : null}

          {activeWizardStepId === "agenda" ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                variant="plain"
                headingId={STEP_HEADING_ID}
                icon={ShieldCheck}
                title="Due diligence"
                subtitle="Se haverá levantamento da base e quando ele deve ser entregue."
              >
                <fieldset>
                  <legend className="mb-1.5 text-v2-body-sm font-semibold text-foreground">
                    Haverá due diligence?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(["Sim", "Nao"] as const).map((option) => (
                      <label
                        key={option}
                        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-(--radius-v2-lg) border border-border bg-white px-4 text-v2-body-md font-medium text-foreground transition-colors duration-150 hover:border-border-strong has-[:checked]:border-primary has-[:checked]:bg-interactive-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/20"
                      >
                        <input
                          type="radio"
                          name="due_diligence"
                          checked={dueDiligence === option}
                          onChange={() => setDueDiligence(option)}
                          className="size-4 accent-interactive-600 outline-none"
                        />
                        {option === "Sim" ? "Sim" : "Não"}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {dueDiligence === "Sim" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Prazo de entrega da base" {...formFieldProps("prazoDue")}>
                      <DateInputBr
                        {...controlProps("prazoDue", { invalid: showStepErrors && !prazoDue })}
                        value={prazoDue}
                        onChange={setPrazoDue}
                        onInvalidChange={marcarAgendaInvalida("prazoDue")}
                        className={newLeadModalFieldClass}
                      />
                    </FormField>
                    <FormField label="Horário de entrega da base" {...formFieldProps("horarioDue")}>
                      <TimeInputBr
                        {...controlProps("horarioDue", { invalid: showStepErrors && !horarioDue })}
                        value={horarioDue}
                        onChange={setHorarioDue}
                        onInvalidChange={marcarAgendaInvalida("horarioDue")}
                        step={300}
                        suggestions={DUE_TIME_SUGGESTIONS}
                        className={cn(newLeadModalFieldClass, "font-mono")}
                      />
                    </FormField>
                  </div>
                ) : (
                  <p className="flex items-start gap-2 text-v2-body-sm text-muted-foreground">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Sem due diligence, o lead segue direto para a reunião.
                  </p>
                )}
              </SectionCard>

              <SectionCard
                variant="plain"
                icon={CalendarClock}
                title="Reunião"
                subtitle="Com due diligence, a reunião precisa ser ao menos 1 dia útil depois do prazo da base."
                className="border-t border-border pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6"
              >
                <FormField
                  label="Local da reunião"
                  {...formFieldProps("localReuniao")}
                  labelAction={
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setLocalReuniao(MEETING_LOCATION_PENDING)}
                      className="text-primary hover:text-interactive-700"
                    >
                      Ainda sem local
                    </Button>
                  }
                >
                  <Input
                    {...controlProps("localReuniao")}
                    value={localReuniao}
                    onChange={(e) => setLocalReuniao(e.target.value)}
                    placeholder={`Ex.: Matriz São Paulo ou ${MEETING_LOCATION_PENDING}`}
                    className={newLeadModalFieldClass}
                  />
                </FormField>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    label="Data da reunião"
                    optional={dueDiligence !== "Sim"}
                    hint={
                      dueDiligence === "Sim" && reuniaoMinDate
                        ? `Mínimo permitido: ${formatDateYmdBr(reuniaoMinDate)}`
                        : undefined
                    }
                    {...formFieldProps("dataReuniao")}
                  >
                    <DateInputBr
                      {...controlProps("dataReuniao", {
                        hasHint: dueDiligence === "Sim" && Boolean(reuniaoMinDate),
                      })}
                      value={dataReuniao}
                      onChange={setDataReuniao}
                      onInvalidChange={marcarAgendaInvalida("dataReuniao")}
                      minYmd={
                        dueDiligence === "Sim" && reuniaoMinDate ? reuniaoMinDate : undefined
                      }
                      className={newLeadModalFieldClass}
                    />
                  </FormField>

                  <FormField label="Horário da reunião" optional {...formFieldProps("horarioReuniao")}>
                    <TimeInputBr
                      {...controlProps("horarioReuniao")}
                      value={horarioReuniao}
                      onChange={setHorarioReuniao}
                      onInvalidChange={marcarAgendaInvalida("horarioReuniao")}
                      step={300}
                      suggestions={MEETING_TIME_SUGGESTIONS}
                      className={cn(newLeadModalFieldClass, "font-mono")}
                    />
                  </FormField>
                </div>
              </SectionCard>
            </div>
          ) : null}

          {activeWizardStepId === "revisao" ? (
            <SectionCard
              variant="plain"
              headingId={STEP_HEADING_ID}
              icon={CheckCircle2}
              title="Revisão"
              subtitle="Confira os dados antes de criar o lead. Use Alterar para voltar à etapa."
            >
              {pendingSteps.length > 0 ? (
                <div className="rounded-(--radius-v2-lg) border border-warning-border bg-warning-bg px-3 py-2.5 text-v2-body-sm text-warning-text">
                  <p className="font-semibold">Ainda há etapas pendentes</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    Complete antes de criar o lead:
                    {pendingSteps.map((step, index) => (
                      <span key={step.id}>
                        <button
                          type="button"
                          onClick={() => selectWizardStep(step.id)}
                          className="rounded-sm font-semibold underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/20"
                        >
                          {step.label}
                        </button>
                        {index < pendingSteps.length - 1 ? "," : ""}
                      </span>
                    ))}
                  </p>
                </div>
              ) : canSubmitLead ? (
                <p className="flex items-center gap-2 rounded-(--radius-v2-lg) border border-success-border bg-success-bg px-3 py-2.5 text-v2-body-sm text-success-text">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                  Tudo pronto para criar o lead com o seu usuário.
                </p>
              ) : null}

              <dl className="grid gap-x-8 md:grid-cols-2">
                <ReviewItem
                  label="Origem do lead"
                  value={leadTypeLabel(tipoLead)}
                  onEdit={() => selectWizardStep("origem")}
                />
                <ReviewItem
                  label="Dados da origem"
                  value={
                    tipoLead === "Indicacao"
                      ? `${tipoIndicacao || "Sem tipo"} · ${indicationDisplay}`
                      : isLeadDigital
                        ? plataforma || "Plataforma não selecionada"
                        : isCrossSelling
                          ? `${selectedClient?.razao_social ?? "Cliente não selecionado"} · ${areaCrossSelling || "Área não selecionada"}`
                          : "Sem dados adicionais"
                  }
                  onEdit={() => selectWizardStep("origem")}
                />
                <ReviewItem
                  label="Captador"
                  value={solicitanteUser?.name ?? "Não selecionado"}
                  onEdit={() => selectWizardStep("solicitante")}
                />
                <ReviewItem
                  label="Cadastrado por"
                  value={currentUser?.name ?? currentUser?.email ?? "Não identificado"}
                />
                <ReviewItem
                  label="Empresas/Pessoas"
                  value={empresas
                    .map(
                      (empresa) =>
                        `${empresa.razao_social || "Sem nome"} (${empresa.documento || "sem documento"})`,
                    )
                    .join(" · ")}
                  onEdit={() => selectWizardStep("empresas")}
                  className="md:col-span-2"
                />
                <ReviewItem
                  label="Decisor"
                  value={decisor.trim() || "Não informado"}
                  onEdit={() => selectWizardStep("empresas")}
                />
                <ReviewItem
                  label="Áreas"
                  value={areasAnalise.length ? areasAnalise.join(", ") : "Nenhuma área selecionada"}
                  onEdit={() => selectWizardStep("areas")}
                />
                <ReviewItem
                  label="Due diligence"
                  value={
                    dueDiligence === "Sim"
                      ? `Sim · ${prazoDue ? formatDateYmdBr(prazoDue) : "sem prazo"} ${horarioDue || ""}`
                      : "Não"
                  }
                  onEdit={() => selectWizardStep("agenda")}
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
                  onEdit={() => selectWizardStep("agenda")}
                />
              </dl>
            </SectionCard>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          {onRequestClose ? (
            <Button
              type="button"
              variant="ghost"
              className="hidden sm:inline-flex"
              disabled={isSaving}
              onClick={onRequestClose}
            >
              Cancelar
            </Button>
          ) : null}
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            {currentStepIndex > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-none"
                disabled={isSaving}
                onClick={goToPreviousWizardStep}
              >
                <ArrowLeft data-icon="inline-start" aria-hidden />
                Voltar
              </Button>
            ) : null}
            {!isReviewStep ? (
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                disabled={isSaving}
                onClick={goToNextWizardStep}
              >
                Continuar
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                disabled={!canSubmitLead}
                onClick={() => {
                  if (validateBeforeConfirm()) {
                    setConfirmOpen(true);
                  }
                }}
              >
                {isSaving ? "Salvando..." : canSubmitLead ? "Criar lead" : "Complete os dados"}
              </Button>
            )}
          </div>
        </div>
      </footer>

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
    </div>
  );
}
