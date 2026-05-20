"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfigStatus = {
  configured: boolean;
  missing: string[];
  fields: {
    tenantId: string | null;
    clientId: string | null;
    clientSecret: string | null;
    siteId: string | null;
    listId: string | null;
    webhookSecret: string | null;
  };
};

type TestResult = { ok: boolean; listName?: string; error?: string };

// ─── Field info ──────────────────────────────────────────────────────────────

const ENV_FIELD_LABELS: Record<string, { label: string; hint: string }> = {
  MICROSOFT_TENANT_ID: {
    label: "Tenant ID (Microsoft)",
    hint: "ID do diretório Azure AD do escritório",
  },
  SHAREPOINT_CLIENT_ID: {
    label: "Client ID (App Registration)",
    hint: "ID do aplicativo registrado no Azure",
  },
  SHAREPOINT_CLIENT_SECRET: {
    label: "Client Secret",
    hint: "Segredo do aplicativo Azure — nunca exposto no frontend",
  },
  SHAREPOINT_SITE_ID: {
    label: "Site ID (Graph)",
    hint: "Formato: host.sharepoint.com,{siteCollectionId},{siteId}",
  },
  SHAREPOINT_AGENDAMENTOS_LIST_ID: {
    label: "List ID — Agendamentos",
    hint: "GUID da lista AGENDAMENTOS / REAGENDAMENTOS",
  },
};

const SHAREPOINT_AGENDAMENTO_FIELDS = [
  { id: "PROCESSO", label: "PROCESSO", example: "DUE DILIGENCE - [Razão social]" },
  {
    id: "DESCRI_x00c7__x00c3_ODOPRAZO",
    label: "DESCRIÇÃO DO PRAZO",
    example: "DUE DILIGENCE - [Nome] - CPF/CNPJ - [Doc]",
  },
  { id: "Tipo_x0020_de_x0020_Agendamento_", label: "Tipo de Agendamento", example: "Serviço" },
  { id: "PRIORIDADE_x0020_DE_x0020_AGENDA", label: "PRIORIDADE DE AGENDAMENTO", example: "ESTRATÉGIA PROCESSUAL" },
  { id: "TIPO_x0020_DE_x0020_A_x00c7__x00", label: "TIPO DE AÇÃO", example: "Due Diligence Prospect" },
  { id: "CLIENTE", label: "CLIENTE", example: "BISMARCHI, PIRES E PECCININ SOCIEDADE DE ADVOGADOS" },
  { id: "DATA_x002d_ENVIAR", label: "DATA - ENVIAR", example: "Prazo de entrega do DUE (yyyy-MM-dd)" },
  { id: "Status", label: "Status", example: "Pendente" },
  { id: "DEPARTAMENTO", label: "DEPARTAMENTO", example: "COMERCIAL" },
  { id: "_x00c1_REA_x0020__x002f__x0020_E", label: "ÁREA / EQUIPE", example: "COMERCIAL" },
  { id: "ENVIAR", label: "ENVIAR", example: "Cadastrado por (usuário do CRM)" },
  { id: "MOTIVO_x0020__x002f__x0020_OBSER", label: "MOTIVO / OBSERVAÇÃO", example: "Áreas necessárias, indicação, empresas, agendamentos" },
  { id: "DEMANDADERISCO", label: "DEMANDA DE RISCO", example: "false" },
  { id: "Title", label: "Title", example: "DUE DILIGENCE - [Razão social]" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SharePointConfigPanel() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showFields, setShowFields] = useState(false);

  function loadStatus() {
    setLoadError(null);
    setTestResult(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/sharepoint-config");
      if (!res.ok) {
        setLoadError("Falha ao carregar status da integração.");
        return;
      }
      const data = (await res.json()) as ConfigStatus;
      setStatus(data);
    });
  }

  function testConnection() {
    setTestResult(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/sharepoint-config", { method: "POST" });
      const data = (await res.json()) as TestResult;
      setTestResult(data);
    });
  }

  // Carrega ao montar
  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFullyConfigured = status?.configured ?? false;

  return (
    <Card className="glass-card glass-card-no-float">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">SharePoint — Central de Agendamentos</CardTitle>
                {status && (
                  <Badge
                    className={
                      isFullyConfigured
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                    }
                  >
                    {isFullyConfigured ? "Configurado" : "Incompleto"}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Integração via Microsoft Graph API. Ao criar um lead com DUE Diligence, cria
                automaticamente um item na lista{" "}
                <span className="font-medium text-[#102033]">AGENDAMENTOS / REAGENDAMENTOS</span>{" "}
                do SharePoint.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={loadStatus}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Atualizar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={testConnection}
              disabled={isPending || !isFullyConfigured}
              title={!isFullyConfigured ? "Complete a configuração antes de testar" : undefined}
            >
              <Unplug className="mr-1.5 h-4 w-4" />
              Testar conexão
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loadError && (
          <Alert variant="destructive">
            <AlertTitle>Erro ao carregar</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {testResult && (
          <Alert variant={testResult.ok ? "default" : "destructive"}>
            {testResult.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertTitle>{testResult.ok ? "Conexão bem-sucedida" : "Falha na conexão"}</AlertTitle>
            <AlertDescription>
              {testResult.ok
                ? `Token Microsoft obtido e lista acessível: "${testResult.listName}"`
                : testResult.error}
            </AlertDescription>
          </Alert>
        )}

        {/* Variáveis de ambiente */}
        {status && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#102033]">
              Variáveis de ambiente (.env)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["MICROSOFT_TENANT_ID", status.fields.tenantId],
                  ["SHAREPOINT_CLIENT_ID", status.fields.clientId],
                  ["SHAREPOINT_CLIENT_SECRET", status.fields.clientSecret],
                  ["SHAREPOINT_SITE_ID", status.fields.siteId],
                  ["SHAREPOINT_AGENDAMENTOS_LIST_ID", status.fields.listId],
                ] as [string, string | null][]
              ).map(([key, value]) => {
                const info = ENV_FIELD_LABELS[key];
                const isSet = !!value;
                return (
                  <div
                    key={key}
                    className={`rounded-xl border p-3 ${
                      isSet ? "border-[#e5e7eb] bg-white/60" : "border-amber-200 bg-amber-50/60"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${isSet ? "bg-emerald-500" : "bg-amber-400"}`}
                      />
                      <p className="truncate font-mono text-[11px] font-semibold text-[#102033]">
                        {key}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{info?.label}</p>
                    {isSet ? (
                      <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{value}</p>
                    ) : (
                      <p className="mt-1 text-[11px] font-medium text-amber-600">Não definida</p>
                    )}
                    {info?.hint && (
                      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/70">
                        {info.hint}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* Webhook secret */}
              <div className="rounded-xl border border-[#e5e7eb] bg-white/60 p-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.fields.webhookSecret ? "bg-emerald-500" : "bg-slate-300"}`}
                  />
                  <p className="truncate font-mono text-[11px] font-semibold text-[#102033]">
                    SHAREPOINT_INTEGRATION_SECRET
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Segredo do webhook</p>
                {status.fields.webhookSecret ? (
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
                    {status.fields.webhookSecret}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground/60">
                    Opcional — protege o endpoint de integração externo
                  </p>
                )}
              </div>
            </div>

            {status.missing.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs font-semibold text-amber-700">
                  {status.missing.length} variável(is) faltando — defina no arquivo{" "}
                  <code className="font-mono">.env</code> e reinicie o servidor:
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {status.missing.map((key) => (
                    <li key={key} className="font-mono text-[11px] text-amber-700">
                      • {key}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Site e lista (compacto) */}
        {status?.fields.siteId && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-[#e5e7eb] bg-white/60 p-3">
              <p className="text-[11px] font-semibold text-muted-foreground">Site SharePoint</p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-[#102033]">
                {status.fields.siteId}
              </p>
              <a
                href={`https://portal.azure.com`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
              >
                Azure Portal
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
            {status.fields.listId && (
              <div className="rounded-xl border border-[#e5e7eb] bg-white/60 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Lista — AGENDAMENTOS / REAGENDAMENTOS
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-[#102033]">
                  {status.fields.listId}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Campos mapeados (expansível) */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white/50">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            onClick={() => setShowFields((v) => !v)}
          >
            <span className="text-xs font-semibold text-[#102033]">
              Campos enviados ao SharePoint ({SHAREPOINT_AGENDAMENTO_FIELDS.length})
            </span>
            {showFields ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showFields && (
            <div className="border-t border-[#e5e7eb] px-3 pb-3 pt-2">
              <p className="mb-2 text-[11px] text-muted-foreground">
                Campos populados automaticamente na criação de um lead com DUE Diligence:
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {SHAREPOINT_AGENDAMENTO_FIELDS.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start gap-2 rounded-lg border border-[#f0f2f5] bg-white px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-[#102033]">{f.label}</p>
                      <p className="font-mono text-[10px] text-muted-foreground/60">{f.id}</p>
                    </div>
                    <p className="shrink-0 max-w-[45%] text-right text-[11px] text-slate-500 truncate">
                      {f.example}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
