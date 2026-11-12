"use client";

import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  BriefcaseBusiness,
  Handshake,
  Info,
  Loader2,
  MonitorUp,
  RefreshCcw,
  Scale,
  Pencil,
  Plus,
  SearchCheck,
  ShieldCheck,
  Target,
  Trash2,
  UserCircle2,
  UserRound,
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
import { isEmailValido, isTelefoneBrValido, maskNomePessoa } from "@/lib/crm/nome-pessoa";
import { maskPhoneBr } from "@/lib/crm/br-document-mask";
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
import { getAreaLucideIcon } from "@/lib/crm/area-lucide-icon";
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
import type { CnpjLookupResult } from "@/lib/crm/cnpj-lookup";
import type { ClienteContratoResumo } from "@/lib/crm/lookup-cliente-by-document";

interface NewDemandFormProps {
  /**
   * `warning`: lead criado, mas algo não foi gravado/enviado (a tela precisa mostrar).
   * `nome`: razão social da primeira empresa, o nome com que o lead aparece no CRM.
   */
  onSuccess?: (result: { oportunidadeId: string | null; nome: string | null; warning: string | null }) => void;
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
  avatarUrl: string | null;
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

type ReceitaCnpjEstado = { status: "loading" } | CnpjLookupResult;

const onlyDigitsDoc = (value: string) => value.replace(/\D/g, "");

/**
 * Embaixo do CNPJ (04/11/2026): CNPJ inválido, consulta em andamento, o que a Receita diz e,
 * quando a razão social digitada difere da Receita, "Usar este nome"; falha com "Tentar de novo".
 */
function ReceitaCnpjAviso({
  digits,
  estado,
  razaoAtual,
  onUsarNome,
  onTentarDeNovo,
}: {
  digits: string;
  estado: ReceitaCnpjEstado | undefined;
  razaoAtual: string;
  onUsarNome: () => void;
  onTentarDeNovo: () => void;
}) {
  const linkClass = "font-medium text-interactive-700 underline-offset-2 hover:underline";
  if (digits.length === 14 && !isValidCnpj(digits)) {
    return <p className="text-v2-caption text-danger-text">CNPJ inválido: confira os números.</p>;
  }
  if (digits.length !== 14 || !estado) return null;
  if (estado.status === "loading") {
    return (
      <p className="flex items-center gap-1.5 text-v2-caption text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Consultando a Receita…
      </p>
    );
  }
  if (estado.status === "not_found") {
    return <p className="text-v2-caption text-warning-text">CNPJ não encontrado na Receita: confira os números.</p>;
  }
  if (estado.status === "error") {
    return (
      <p className="text-v2-caption text-muted-foreground">
        Não deu para consultar a Receita.{" "}
        <button type="button" className={linkClass} onClick={onTentarDeNovo}>
          Tentar de novo
        </button>
      </p>
    );
  }
  const razaoReceita = estado.razaoSocial.trim().toUpperCase();
  // Nome digitado diferente da Receita, ou apagado: oferece o da Receita em vez de dizer que já está.
  if (razaoAtual.trim().toUpperCase() !== razaoReceita) {
    return (
      <p className="text-v2-caption text-muted-foreground">
        Na Receita: {razaoReceita}.{" "}
        <button type="button" className={linkClass} onClick={onUsarNome}>
          Usar este nome
        </button>
      </p>
    );
  }
  const ativa = !estado.situacao || estado.situacao.toUpperCase() === "ATIVA";
  const local = [estado.municipio, estado.uf].filter(Boolean).join("/");
  return ativa ? (
    <p className="flex items-center gap-1.5 text-v2-caption text-success-text">
      <CheckCircle2 className="size-3" aria-hidden />
      Razão social da Receita · ativa{local ? ` · ${local}` : ""}
    </p>
  ) : (
    <p className="text-v2-caption text-warning-text">Situação na Receita: {estado.situacao}</p>
  );
}

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

/** Ícones das áreas da apresentação comercial (docs/ICONES-DAS-AREAS.md), os mesmos do resto do CRM. */
const AREA_ICONS: Record<(typeof leadAreas)[number], ComponentType<{ className?: string }>> = {
  "Cível": getAreaLucideIcon("Cível"),
  Trabalhista: getAreaLucideIcon("Trabalhista"),
  "Societário e Contratos": getAreaLucideIcon("Societário e Contratos"),
  "Recuperação de Créditos": getAreaLucideIcon("Recuperação de Créditos"),
  Tributário: getAreaLucideIcon("Tributário"),
  "Reestruturação e Insolvência": getAreaLucideIcon("Reestruturação e Insolvência"),
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
            <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
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

/** Revisão (04/11/2026): um cartão por etapa, com o ícone da etapa e "Alterar" no cabeçalho. */
function ReviewSection({
  icon: Icon,
  title,
  onEdit,
  className,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** Volta para a etapa onde o dado é preenchido. */
  onEdit?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-(--radius-v2-xl) border border-border bg-white p-4", className)}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h4 className="flex min-w-0 items-center gap-2.5 text-v2-body-sm font-semibold text-foreground">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border bg-surface-subtle text-muted-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="truncate">{title}</span>
        </h4>
        {onEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label={`Alterar ${title.toLowerCase()}`}
            className="h-7 shrink-0 gap-1 px-2 text-xs font-semibold text-primary hover:text-interactive-700"
          >
            <Pencil className="size-3" aria-hidden />
            Alterar
          </Button>
        ) : null}
      </header>
      <dl className="space-y-2.5">{children}</dl>
    </section>
  );
}

function ReviewField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-v2-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-v2-body-sm-medium break-words text-foreground">{children}</dd>
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
  const [areasCrossSelling, setAreasCrossSelling] = useState<string[]>([]);
  // Áreas de análise (passo 4) seguem as do cross selling até a pessoa mexer nelas (04/11/2026).
  const [areasAnaliseEditadas, setAreasAnaliseEditadas] = useState(false);
  // Documento que o cliente do cross selling pôs na empresa 1: sai junto se a origem mudar (04/11/2026).
  const [docDoCrossSelling, setDocDoCrossSelling] = useState<string | null>(null);
  // Razão social da Receita ao digitar um CNPJ (04/11/2026). A troca do CNPJ dispara a consulta:
  // o nome que o formulário tinha posto (Receita ou cliente do CRM) sai e entra o do CNPJ novo;
  // nome digitado à mão fica, com "Usar este nome" embaixo do CNPJ.
  const [receitaCnpj, setReceitaCnpj] = useState<Record<string, ReceitaCnpjEstado>>({});
  const receitaRef = useRef<Record<string, ReceitaCnpjEstado>>({});
  const razoesAutomaticas = useRef(new Set<string>());
  // CNPJ que já é cliente no CRM (empresa 1): vale o nome cadastrado no CRM.
  const nomeCrmPorCnpj = useRef(new Map<string, string>());
  const [decisor, setDecisor] = useState("");
  // Contato do decisor (09/11/2026): obrigatório ao menos telefone ou e-mail.
  const [decisorTelefone, setDecisorTelefone] = useState("");
  const [decisorEmail, setDecisorEmail] = useState("");
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

  /** Tipo e nome da indicação voltam ao zero (origem trocada para outra que não Indicação). */
  function limparIndicacao() {
    setTipoIndicacao("");
    setNomeIndicacaoMode("existing");
    setNomeIndicacaoExisting("");
    setNomeIndicacaoNew("");
    setNomeIndicacaoColaboradorId("");
  }

  /**
   * Troca do tipo de indicação. "Colaborador" escolhe uma pessoa do quadro; os outros tipos, um nome da base de
   * indicadores. Entre os dois grupos o nome não serve mais e é limpo. Antes, sair de Colaborador trazia de volta
   * o nome escolhido lá atrás (outro tipo) e o lead podia ser criado com uma indicação que ninguém escolheu agora
   * (bug do teste de 11/11/2026). Entre tipos da base (Fundo → Cliente) o nome fica.
   */
  function changeTipoIndicacao(next: string) {
    if (next === tipoIndicacao) return;
    const eraColaborador = tipoIndicacao === "Colaborador";
    const viraColaborador = next === "Colaborador";
    setTipoIndicacao(next);
    if (eraColaborador || viraColaborador) {
      setNomeIndicacaoMode(viraColaborador ? "colaborador" : "existing");
      setNomeIndicacaoExisting("");
      setNomeIndicacaoNew("");
      setNomeIndicacaoColaboradorId("");
    }
  }

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
      return Boolean(aditivoClientId && areasCrossSelling.length > 0);
    }
    return true;
  }, [
    aditivoClientId,
    areasCrossSelling,
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

  /** Já tem algo digitado: fechar pede confirmação (antes fechava e perdia tudo sem avisar). */
  const temDadosDigitados =
    Boolean(tipoIndicacao || plataforma || aditivoClientId || areasCrossSelling.length) ||
    Boolean(nomeIndicacaoExisting || nomeIndicacaoNew.trim() || nomeIndicacaoColaboradorId) ||
    Boolean(decisor.trim() || decisorTelefone.trim() || decisorEmail.trim()) ||
    empresas.some((item) => item.razao_social.trim() || item.documento.trim()) ||
    areasAnalise.length > 0 ||
    Boolean(prazoDue || dataReuniao || localReuniao.trim());
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  function requestClose() {
    // Com uma confirmação aberta, o Esc é dela (fecha só a confirmação).
    if (!onRequestClose || isSaving || confirmOpen || confirmDiscardOpen) return;
    if (temDadosDigitados) {
      setConfirmDiscardOpen(true);
      return;
    }
    onRequestClose();
  }
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!onRequestClose) return;
    // Captura: decide antes da lista aberta se fechar. Na fase de bolha a lista já tinha sumido do DOM e o Esc
    // que só devia fechar a lista (tipo de indicação, tipo do documento…) fechava o cadastro inteiro (11/11/2026).
    function onKeyDown(event: KeyboardEvent) {
      // Sem olhar `defaultPrevented`: o diálogo da página cancela o próprio Esc e marcaria o evento.
      if (event.key !== "Escape") return;
      if (document.querySelector("[data-new-lead-picker-panel]")) return;
      if (document.querySelector('[data-slot="select-content"][data-open]')) return;
      requestCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
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
          const rsCrm = data.cliente.razao_social.trim().toUpperCase();
          nomeCrmPorCnpj.current.set(digits, rsCrm);
          razoesAutomaticas.current.add(rsCrm);
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

  function setReceita(cnpj: string, estado: ReceitaCnpjEstado) {
    receitaRef.current = { ...receitaRef.current, [cnpj]: estado };
    setReceitaCnpj(receitaRef.current);
  }

  /** Razão social da Receita nas empresas com esse CNPJ cujo nome está vazio ou foi posto pelo formulário. */
  function aplicarRazaoDaReceita(cnpj: string, forcar = false) {
    const estado = receitaRef.current[cnpj];
    if (estado?.status !== "found") return;
    if (!forcar && nomeCrmPorCnpj.current.has(cnpj)) return;
    const razao = estado.razaoSocial.trim().toUpperCase();
    razoesAutomaticas.current.add(razao);
    setEmpresas((prev) =>
      prev.map((item) => {
        if (item.tipo_documento !== "CNPJ" || onlyDigitsDoc(item.documento) !== cnpj) return item;
        const atual = item.razao_social.trim();
        if (atual === razao) return item;
        if (!forcar && atual && !razoesAutomaticas.current.has(atual)) return item;
        return { ...item, razao_social: razao };
      }),
    );
  }

  /** Consulta o CNPJ (ou usa o que já foi consultado) e preenche a razão social. Falha pode ser repetida. */
  function consultarReceita(cnpj: string) {
    const atual = receitaRef.current[cnpj];
    if (atual?.status === "loading") return;
    if (atual && atual.status !== "error") {
      aplicarRazaoDaReceita(cnpj);
      return;
    }
    setReceita(cnpj, { status: "loading" });
    fetch(`/api/crm/cnpj/${cnpj}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; data?: CnpjLookupResult } | null;
        if (!res.ok || !json?.ok || !json.data) throw new Error(json?.error ?? "Falha ao consultar o CNPJ.");
        return json.data;
      })
      .catch((error: unknown): CnpjLookupResult => ({
        status: "error",
        cnpj,
        message: error instanceof Error ? error.message : "Falha ao consultar o CNPJ.",
      }))
      .then((result) => {
        setReceita(cnpj, result);
        aplicarRazaoDaReceita(cnpj);
      });
  }

  function toggleArea(area: string) {
    setAreasAnaliseEditadas(true);
    setAreasAnalise((prev) =>
      prev.includes(area) ? prev.filter((item) => item !== area) : [...prev, area],
    );
  }

  /** Cross selling: as áreas marcadas já vêm no passo 4, enquanto ninguém editou as de análise. */
  function changeAreasCrossSelling(next: string[]) {
    setAreasCrossSelling(next);
    if (!areasAnaliseEditadas) setAreasAnalise(next);
  }

  function updateCompany(
    index: number,
    patch: Partial<CompanyFormItem>,
    remask = false,
  ) {
    const item = empresas[index];
    if (!item) return;
    const next = { ...item, ...patch };
    // CNPJ não cabe em CPF: trocar o tipo apaga o número em vez de cortar dígitos sem avisar.
    if (next.tipo_documento === "CPF" && item.tipo_documento !== "CPF" && onlyDigitsDoc(item.documento).length > 11) {
      next.documento = "";
    }
    if (remask) {
      next.documento = maskDocument(next.documento, next.tipo_documento);
    }
    const digits = onlyDigitsDoc(next.documento);
    const trocouDocumento =
      digits !== onlyDigitsDoc(item.documento) || next.tipo_documento !== item.tipo_documento;
    // Documento trocado: o nome que o formulário tinha posto era do documento anterior.
    if (trocouDocumento && !("razao_social" in patch) && razoesAutomaticas.current.has(item.razao_social.trim())) {
      next.razao_social = "";
    }
    setEmpresas((prev) => prev.map((current, itemIndex) => (itemIndex === index ? next : current)));
    if (trocouDocumento && next.tipo_documento === "CNPJ" && digits.length === 14 && isValidCnpj(digits)) {
      consultarReceita(digits);
    }
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
    setAreasAnaliseEditadas(false);
    setDocDoCrossSelling(null);
    setAditivoClientId("");
    setLocalReuniao("");
    setDataReuniao("");
    setHorarioReuniao("");
    setAgendaInvalida({});
    setTipoLead("Indicacao");
    setTipoIndicacao("");
    setPlataforma("");
    setAreasCrossSelling([]);
    setDecisor("");
    setDecisorTelefone("");
    setDecisorEmail("");
    setNomeIndicacaoMode("existing");
    setNomeIndicacaoExisting("");
    setNomeIndicacaoNew("");
    setNomeIndicacaoColaboradorId("");
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

  /** Empresa 1 que veio do cliente do cross selling (e não foi mudada à mão) volta a ficar vazia. */
  function limparEmpresaDoCrossSelling() {
    if (!docDoCrossSelling) return;
    setEmpresas((prev) =>
      prev[0]?.documento === docDoCrossSelling ? [{ ...EMPTY_COMPANY }, ...prev.slice(1)] : prev,
    );
    setDocDoCrossSelling(null);
  }

  function handleAditivoClientChange(clientId: string | null) {
    const id = clientId ?? "";
    setAditivoClientId(id);
    if (!id) {
      limparEmpresaDoCrossSelling();
      return;
    }
    const client = clients.find((item) => item.id === id);
    if (!client) return;

    const inferredType: "CPF" | "CNPJ" =
      client.documento.replace(/\D/g, "").length <= 11 ? "CPF" : "CNPJ";
    setDocDoCrossSelling(maskDocument(client.documento, inferredType));
    razoesAutomaticas.current.add(client.razao_social.trim().toUpperCase());

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
      if (isCrossSelling && areasCrossSelling.length === 0) {
        return issue("crossArea", "Selecione ao menos uma área do cross selling.");
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
      // Decisor primeiro: é o primeiro bloco do passo.
      if (!decisor.trim()) return issue("decisor", "Informe o nome do decisor.");
      if (!decisorTelefone.trim() && !decisorEmail.trim()) {
        return issue("decisorTelefone", "Informe o telefone ou o e-mail do decisor (pelo menos um).");
      }
      if (decisorTelefone.trim() && !isTelefoneBrValido(decisorTelefone)) {
        return issue("decisorTelefone", "Telefone do decisor incompleto: use DDD e número.");
      }
      if (decisorEmail.trim() && !isEmailValido(decisorEmail)) {
        return issue("decisorEmail", "E-mail do decisor inválido.");
      }
      const incompleteIndex = empresas.findIndex(
        (item) => !item.razao_social.trim() || !item.documento.trim(),
      );
      if (incompleteIndex >= 0) {
        const item = empresas[incompleteIndex]!;
        const part = item.documento.trim() ? "razao" : "documento";
        const pessoa = item.tipo_documento === "CPF";
        const quem = `${pessoa ? "Pessoa" : "Empresa"} ${incompleteIndex + 1}`;
        const falta =
          part === "documento" ? (pessoa ? "informe o CPF" : "informe o CNPJ") : pessoa ? "informe o nome completo" : "informe a razão social";
        return issue(`empresa-${incompleteIndex}-${part}`, `${quem}: ${falta}.`);
      }
      // Dígito verificador (teste ponta a ponta 4: CNPJ com o último dígito errado passava para a etapa seguinte).
      const invalidIndex = empresas.findIndex((item) =>
        item.tipo_documento === "CPF" ? !isValidCpf(item.documento) : !isValidCnpj(item.documento),
      );
      if (invalidIndex >= 0) {
        const tipo = empresas[invalidIndex]!.tipo_documento;
        return issue(
          `empresa-${invalidIndex}-documento`,
          `${tipo === "CPF" ? "Pessoa" : "Empresa"} ${invalidIndex + 1}: ${tipo} inválido, confira os números.`,
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

    if (isCrossSelling && areasCrossSelling.length === 0) {
      setError("Selecione ao menos uma área do cross selling.");
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
        ? ((areasCrossSelling[0] ?? null) as NewLeadPayload["area_cross_selling"])
        : null,
      areas_cross_selling: isCrossSelling
        ? (areasCrossSelling as NonNullable<NewLeadPayload["areas_cross_selling"]>)
        : null,
      decisor: decisor.trim() || null,
      decisor_telefone: decisorTelefone.trim() || null,
      decisor_email: decisorEmail.trim().toLowerCase() || null,
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
        nome: payload.empresas[0]?.razao_social || null,
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
        onRequestClose={onRequestClose ? requestClose : undefined}
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
                      if (item !== "Indicacao") limparIndicacao();
                      if (item !== "Lead Digital") setPlataforma("");
                      if (item !== "Cross Selling") {
                        // Saindo do cross selling: cliente, empresa que veio dele e áreas não ficam para trás.
                        changeAreasCrossSelling([]);
                        setAditivoClientId("");
                        limparEmpresaDoCrossSelling();
                      }
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
                        onValueChange={(v) => changeTipoIndicacao(v ?? "")}
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
                          onChange={(e) => setNomeIndicacaoNew(maskNomePessoa(e.target.value))}
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
                    {/* Mais de uma área no cross selling (03/11/2026). */}
                    <FormField
                      label="Áreas"
                      hint="Marque uma ou mais áreas."
                      className="md:col-span-2"
                      {...formFieldProps("crossArea")}
                    >
                      <div
                        {...controlProps("crossArea", { hasHint: true })}
                        role="group"
                        aria-label="Áreas do cross selling"
                        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                      >
                        {leadAreas.map((area) => (
                          <TagSelectable
                            key={area}
                            checked={areasCrossSelling.includes(area)}
                            onToggle={() =>
                              changeAreasCrossSelling(
                                areasCrossSelling.includes(area)
                                  ? areasCrossSelling.filter((item) => item !== area)
                                  : [...areasCrossSelling, area],
                              )
                            }
                            icon={AREA_ICONS[area] ?? Scale}
                          >
                            {area}
                          </TagSelectable>
                        ))}
                      </div>
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

              {/* Decisor obrigatório com telefone ou e-mail (09/11/2026): o pós-venda chegava sem contato do cliente. */}
              <div className="grid gap-4 md:grid-cols-3">
                <FormField label="Decisor" {...formFieldProps("decisor")}>
                  <Input
                    {...controlProps("decisor")}
                    value={decisor}
                    onChange={(event) => setDecisor(maskNomePessoa(event.target.value))}
                    placeholder="Nome de quem decide na empresa"
                    autoComplete="off"
                    autoCapitalize="words"
                    className={newLeadModalFieldClass}
                  />
                </FormField>
                <FormField
                  label="Telefone do decisor"
                  hint="Telefone ou e-mail: pelo menos um."
                  {...formFieldProps("decisorTelefone")}
                >
                  <Input
                    {...controlProps("decisorTelefone", { hasHint: true })}
                    value={decisorTelefone}
                    onChange={(event) => setDecisorTelefone(maskPhoneBr(event.target.value))}
                    placeholder="(19) 99999-9999"
                    inputMode="tel"
                    autoComplete="off"
                    className={newLeadModalFieldClass}
                  />
                </FormField>
                <FormField label="E-mail do decisor" {...formFieldProps("decisorEmail")}>
                  <Input
                    {...controlProps("decisorEmail")}
                    value={decisorEmail}
                    onChange={(event) => setDecisorEmail(event.target.value)}
                    placeholder="nome@empresa.com.br"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    className={newLeadModalFieldClass}
                  />
                </FormField>
              </div>

              <div className="space-y-3">
                {empresas.map((company, index) => {
                  const razaoIds = newLeadFieldIds(`empresa-${index}-razao`);
                  const tipoIds = newLeadFieldIds(`empresa-${index}-tipo`);
                  const documentoIds = newLeadFieldIds(`empresa-${index}-documento`);
                  // Rótulos e mensagens seguem o tipo: CNPJ é empresa (razão social), CPF é pessoa (nome completo).
                  const isPessoa = company.tipo_documento === "CPF";
                  const razaoLabel = isPessoa ? "Nome completo" : "Razão social";
                  const razaoError =
                    showStepErrors && !company.razao_social.trim()
                      ? isPessoa
                        ? "Informe o nome completo."
                        : "Informe a razão social."
                      : null;
                  const documentoError =
                    showStepErrors && !company.documento.trim()
                      ? isPessoa
                        ? "Informe o CPF."
                        : "Informe o CNPJ."
                      : null;

                  return (
                    <div
                      key={`company-${index}`}
                      className="rounded-(--radius-v2-xl) border border-border p-4"
                    >
                      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
                        <p className="text-v2-body-sm font-semibold text-foreground">
                          {isPessoa ? "Pessoa" : "Empresa"} {index + 1}
                        </p>
                        {empresas.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeCompany(index)}
                            aria-label={`Remover ${isPessoa ? "pessoa" : "empresa"} ${index + 1}`}
                            className="text-muted-foreground hover:text-danger-text"
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]">
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
                          {isPessoa ? (
                            onlyDigitsDoc(company.documento).length === 11 && !isValidCpf(company.documento) ? (
                              <p className="text-v2-caption text-danger-text">CPF inválido: confira os números.</p>
                            ) : null
                          ) : (
                            <ReceitaCnpjAviso
                              digits={onlyDigitsDoc(company.documento)}
                              estado={receitaCnpj[onlyDigitsDoc(company.documento)]}
                              razaoAtual={company.razao_social}
                              onUsarNome={() => aplicarRazaoDaReceita(onlyDigitsDoc(company.documento), true)}
                              onTentarDeNovo={() => consultarReceita(onlyDigitsDoc(company.documento))}
                            />
                          )}
                        </FormField>

                        <FormField
                          label={razaoLabel}
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
                            placeholder={
                              company.tipo_documento === "CNPJ" &&
                              receitaCnpj[onlyDigitsDoc(company.documento)]?.status === "loading"
                                ? "Buscando na Receita…"
                                : isPessoa
                                  ? "NOME COMPLETO DA PESSOA"
                                  : "PREENCHIDA PELO CNPJ OU DIGITE"
                            }
                            className={newLeadModalFieldClass}
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
                  {isCrossSelling && !areasAnaliseEditadas && areasAnalise.length > 0
                    ? " Já marcadas com as áreas do cross selling; ajuste se a análise envolver outras."
                    : ""}
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

              <div className="grid gap-3 md:grid-cols-2">
                <ReviewSection
                  icon={LEAD_TYPE_ICONS[tipoLead] ?? Handshake}
                  title="Origem"
                  onEdit={() => selectWizardStep("origem")}
                >
                  <ReviewField label="Origem do lead">{leadTypeLabel(tipoLead)}</ReviewField>
                  {tipoLead === "Indicacao" ? (
                    <ReviewField label="Indicação">
                      {[tipoIndicacao || "Sem tipo", indicationDisplay].filter(Boolean).join(" · ")}
                    </ReviewField>
                  ) : isLeadDigital ? (
                    <ReviewField label="Plataforma">{plataforma || "Não selecionada"}</ReviewField>
                  ) : isCrossSelling ? (
                    <>
                      <ReviewField label="Cliente">{selectedClient?.razao_social ?? "Não selecionado"}</ReviewField>
                      <ReviewField label="Áreas do cross selling">
                        {areasCrossSelling.length ? areasCrossSelling.join(", ") : "Nenhuma área selecionada"}
                      </ReviewField>
                    </>
                  ) : null}
                </ReviewSection>

                <ReviewSection icon={UserCircle2} title="Captador" onEdit={() => selectWizardStep("solicitante")}>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-9 border border-border">
                      <AvatarImage src={solicitanteUser?.avatarUrl ?? undefined} alt="" className="object-cover" />
                      <AvatarFallback className="text-[11px] font-bold">
                        {initialsFromName(solicitanteUser?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-v2-body-sm-medium text-foreground">
                        {solicitanteUser?.name ?? "Não selecionado"}
                      </p>
                      <p className="truncate text-v2-caption text-muted-foreground">
                        Cadastrado por {currentUser?.name ?? currentUser?.email ?? "não identificado"}
                      </p>
                    </div>
                  </div>
                </ReviewSection>

                <ReviewSection
                  icon={Building2}
                  title="Empresas e pessoas"
                  onEdit={() => selectWizardStep("empresas")}
                  className="md:col-span-2"
                >
                  <ul className="divide-y divide-border rounded-(--radius-v2-lg) border border-border">
                    {empresas.map((empresa, index) => {
                      const pessoa = empresa.tipo_documento === "CPF";
                      const ItemIcon = pessoa ? UserRound : Building2;
                      return (
                        <li key={`review-empresa-${index}`} className="flex items-center gap-3 px-3 py-2.5">
                          <ItemIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-v2-body-sm-medium text-foreground">
                              {empresa.razao_social || "Sem nome"}
                            </p>
                            <p className="text-v2-caption tabular-nums text-muted-foreground">
                              {empresa.tipo_documento} {empresa.documento || "não informado"}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-v2-caption text-muted-foreground">
                            {pessoa ? "Pessoa" : "Empresa"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <ReviewField label="Decisor">
                    {decisor.trim() || "Não informado"}
                    {[decisorTelefone.trim(), decisorEmail.trim()].filter(Boolean).length ? (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {[decisorTelefone.trim(), decisorEmail.trim()].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </ReviewField>
                </ReviewSection>

                <ReviewSection icon={SearchCheck} title="Áreas de análise" onEdit={() => selectWizardStep("areas")}>
                  {areasAnalise.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {areasAnalise.map((area) => {
                        const AreaIcon = AREA_ICONS[area as (typeof leadAreas)[number]] ?? Scale;
                        return (
                          <li
                            key={area}
                            className="inline-flex items-center gap-1.5 rounded-full border border-interactive-100 bg-interactive-50 px-2.5 py-1 text-v2-caption font-medium text-interactive-700"
                          >
                            <AreaIcon className="size-3.5" aria-hidden />
                            {area}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-v2-body-sm text-warning-text">Nenhuma área selecionada</p>
                  )}
                </ReviewSection>

                <ReviewSection icon={CalendarClock} title="Agenda" onEdit={() => selectWizardStep("agenda")}>
                  <ReviewField label="Due diligence">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-v2-caption font-semibold",
                          dueDiligence === "Sim"
                            ? "border-info-border bg-info-bg text-info-text"
                            : "border-border bg-surface-subtle text-muted-foreground",
                        )}
                      >
                        {dueDiligence === "Sim" ? "Sim" : "Não"}
                      </span>
                      {dueDiligence === "Sim" ? (
                        <span className="tabular-nums">
                          {prazoDue ? `Entrega ${formatDateYmdBr(prazoDue)}` : "Sem prazo"}
                          {horarioDue ? ` às ${horarioDue}` : ""}
                        </span>
                      ) : null}
                    </span>
                  </ReviewField>
                  <ReviewField label="Reunião">
                    <span className="tabular-nums">
                      {[
                        localReuniao || "Local a definir",
                        dataReuniao ? formatDateYmdBr(dataReuniao) : "data a definir",
                        horarioReuniao ? `às ${horarioReuniao}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </ReviewField>
                </ReviewSection>
              </div>
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
              onClick={requestClose}
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
              O lead será criado e o CRM avisará o grupo da DUE no WhatsApp. Se houver due
              diligence, também criará as tarefas das áreas e o agendamento no SharePoint.
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

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar o cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              O que você preencheu neste lead será perdido. Para continuar de onde parou, escolha Voltar ao cadastro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel type="button" className="mt-0">
              Voltar ao cadastro
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmDiscardOpen(false);
                onRequestClose?.();
              }}
            >
              Descartar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
