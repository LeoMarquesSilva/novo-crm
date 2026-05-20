"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Save,
  Unplug,
  Users,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CrmAppUserRow } from "@/components/crm/crm-app-user-row";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { renderLeadEmailFromTemplates } from "@/modules/crm/application/services/lead-email-default-templates";
import {
  LEAD_EMAIL_TEMPLATE_PLACEHOLDER_KEYS,
  SAMPLE_LEAD_EMAIL_PAYLOAD,
  SAMPLE_LEAD_EMAIL_PAYLOAD_SEM_DUE,
} from "@/modules/crm/application/services/lead-email-template-vars";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppUserWithEmail = { full_name: string; area: string; email: string; avatar_url: string | null };

type FixedRow = {
  id?: string;
  key: string;
  label: string;
  recipients: string[];
};

type TemplateBlock = {
  variant: "due" | "sem_due";
  subject_template: string;
  html_template: string;
  from_database: boolean;
  updated_at: string | null;
};

type OutlookApi = {
  configured: boolean;
  from: string | null;
  mode: "delegated" | "application" | "none";
  delegated_connected: boolean;
  application_ready: boolean;
};

type ApiResponse = {
  ok: boolean;
  fixed: FixedRow[];
  usersByArea: AppUserWithEmail[];
  outlook: OutlookApi;
  templates: { due: TemplateBlock; sem_due: TemplateBlock };
  template_defaults: {
    due: { subjectTemplate: string; htmlTemplate: string };
    sem_due: { subjectTemplate: string; htmlTemplate: string };
  };
};

// ─── Recipient tag editor ─────────────────────────────────────────────────────

function RecipientEditor({
  recipients,
  onChange,
}: {
  recipients: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const email = draft.trim().toLowerCase();
    if (!email || recipients.includes(email)) {
      setDraft("");
      return;
    }
    onChange([...recipients, email]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {recipients.map((email, idx) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
          >
            {email}
            <button
              type="button"
              onClick={() => onChange(recipients.filter((_, i) => i !== idx))}
              className="ml-0.5 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {recipients.length === 0 && (
          <span className="text-xs text-muted-foreground italic">Nenhum destinatário fixo</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="email@bismarchipires.com.br"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="h-7 text-xs"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} className="h-7 px-2">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Users by area section ────────────────────────────────────────────────────

function UsersByAreaSection({ users }: { users: AppUserWithEmail[] }) {
  const grouped = users.reduce<Record<string, AppUserWithEmail[]>>((acc, u) => {
    const area = u.area || "Sem área";
    acc[area] = [...(acc[area] ?? []), u];
    return acc;
  }, {});

  const areas = Object.keys(grouped).sort();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Usuários notificados por área</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Quando um lead inclui uma dessas áreas, o respectivo colaborador é incluído automaticamente.
        Para alterar, edite a área do usuário em{" "}
        <span className="font-medium">Administração → Usuários</span>.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((area) => {
          const IconLabel = <AreaIconLabel area={area} className="text-xs font-semibold text-foreground" />;
          return (
            <div key={area} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2">{IconLabel}</div>
              <div className="space-y-2">
                {grouped[area].map((u) => (
                  <CrmAppUserRow
                    key={u.email}
                    fullName={u.full_name}
                    email={u.email}
                    avatarUrl={u.avatar_url}
                    size="sm"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Email templates editor ─────────────────────────────────────────────────────

function EmailTemplatesEditor({
  dueSubject,
  dueHtml,
  semSubject,
  semHtml,
  onChangeDue,
  onChangeSem,
  onSave,
  onResetDue,
  onResetSem,
  isPending,
  saveOk,
  saveError,
}: {
  dueSubject: string;
  dueHtml: string;
  semSubject: string;
  semHtml: string;
  onChangeDue: (s: { subject: string; html: string }) => void;
  onChangeSem: (s: { subject: string; html: string }) => void;
  onSave: () => void;
  onResetDue: () => void;
  onResetSem: () => void;
  isPending: boolean;
  saveOk: boolean;
  saveError: string | null;
}) {
  const [tab, setTab] = useState<"due" | "sem_due">("due");

  const sample = tab === "due" ? SAMPLE_LEAD_EMAIL_PAYLOAD : SAMPLE_LEAD_EMAIL_PAYLOAD_SEM_DUE;
  const subject = tab === "due" ? dueSubject : semSubject;
  const htmlTpl = tab === "due" ? dueHtml : semHtml;

  const preview = useMemo(() => {
    try {
      return renderLeadEmailFromTemplates(tab, subject, htmlTpl, sample);
    } catch {
      return { subject: "(erro ao montar preview)", html: "<p>Verifique os placeholders.</p>" };
    }
  }, [tab, subject, htmlTpl, sample]);

  const keysLine = LEAD_EMAIL_TEMPLATE_PLACEHOLDER_KEYS.map((k) => `{{${k}}}`).join(", ");

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Modelos de e-mail (HTML)</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Use placeholders no assunto e no HTML. Pré-visualização com dados de exemplo.
        </p>
        <p className="text-[11px] text-muted-foreground font-mono mt-1 break-all">{keysLine}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "due" | "sem_due")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="due">Com Due Diligence</TabsTrigger>
          <TabsTrigger value="sem_due">Sem Due</TabsTrigger>
        </TabsList>

        <TabsContent value="due" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onResetDue}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restaurar padrão
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assunto</Label>
            <Input
              value={dueSubject}
              onChange={(e) => onChangeDue({ subject: e.target.value, html: dueHtml })}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">HTML</Label>
            <Textarea
              value={dueHtml}
              onChange={(e) => onChangeDue({ subject: dueSubject, html: e.target.value })}
              className="min-h-[200px] font-mono text-[11px] leading-relaxed"
              spellCheck={false}
            />
          </div>
        </TabsContent>

        <TabsContent value="sem_due" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onResetSem}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restaurar padrão
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assunto</Label>
            <Input
              value={semSubject}
              onChange={(e) => onChangeSem({ subject: e.target.value, html: semHtml })}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">HTML</Label>
            <Textarea
              value={semHtml}
              onChange={(e) => onChangeSem({ subject: semSubject, html: e.target.value })}
              className="min-h-[200px] font-mono text-[11px] leading-relaxed"
              spellCheck={false}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-2 rounded-md border bg-muted/30 p-3">
        <p className="text-xs font-medium text-foreground">Pré-visualização (dados fictícios)</p>
        <p className="text-xs text-muted-foreground">
          Assunto: <span className="font-mono text-foreground">{preview.subject}</span>
        </p>
        <iframe
          title="Preview e-mail"
          sandbox="allow-same-origin"
          className="h-[320px] w-full rounded border bg-white"
          srcDoc={preview.html}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="text-sm min-h-[22px]">
          {saveOk && (
            <span className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Modelos salvos.
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-1.5 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {saveError}
            </span>
          )}
        </div>
        <Button type="button" onClick={onSave} disabled={isPending} size="sm">
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar modelos de e-mail
        </Button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function LeadEmailConfigPanel() {
  const [fixed, setFixed] = useState<FixedRow[]>([]);
  const [usersByArea, setUsersByArea] = useState<AppUserWithEmail[]>([]);
  const [outlook, setOutlook] = useState<OutlookApi | null>(null);
  const [templateDefaults, setTemplateDefaults] = useState<ApiResponse["template_defaults"] | null>(null);
  const [dueSubject, setDueSubject] = useState("");
  const [dueHtml, setDueHtml] = useState("");
  const [semSubject, setSemSubject] = useState("");
  const [semHtml, setSemHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [tplSaveError, setTplSaveError] = useState<string | null>(null);
  const [tplSaveOk, setTplSaveOk] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isPendingFixed, startFixedTransition] = useTransition();
  const [isPendingTpl, startTplTransition] = useTransition();
  const [isPendingOAuth, startOAuthTransition] = useTransition();

  const loadConfig = useCallback((): Promise<void> => {
    setLoading(true);
    return fetch("/api/admin/lead-email-config")
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((json) => {
        if (!json.ok) throw new Error("Falha ao carregar configuração");
        setFixed(json.fixed);
        setUsersByArea(json.usersByArea);
        setOutlook(json.outlook);
        setTemplateDefaults(json.template_defaults);
        setDueSubject(json.templates.due.subject_template);
        setDueHtml(json.templates.due.html_template);
        setSemSubject(json.templates.sem_due.subject_template);
        setSemHtml(json.templates.sem_due.html_template);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  function updateFixed(key: string, recipients: string[]) {
    setFixed((prev) =>
      prev.map((r) => (r.key === key ? { ...r, recipients } : r)),
    );
  }

  function handleSaveFixed() {
    setSaveError(null);
    setSaveOk(false);
    startFixedTransition(async () => {
      try {
        const res = await fetch("/api/admin/lead-email-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fixed: fixed.map(({ key, label, recipients }) => ({ key, label, recipients })),
          }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "Falha ao salvar");
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 3000);
      } catch (e: unknown) {
        setSaveError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  function handleDisconnectOutlook() {
    setError(null);
    startOAuthTransition(async () => {
      try {
        const res = await fetch("/api/admin/microsoft-mail/oauth/disconnect", { method: "POST" });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "Falha ao desligar");
        await loadConfig();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao desligar Outlook");
      }
    });
  }

  function handleSaveTemplates() {
    setTplSaveError(null);
    setTplSaveOk(false);
    startTplTransition(async () => {
      try {
        const res = await fetch("/api/admin/lead-email-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templates: [
              { variant: "due", subject_template: dueSubject, html_template: dueHtml },
              { variant: "sem_due", subject_template: semSubject, html_template: semHtml },
            ],
          }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "Falha ao salvar");
        setTplSaveOk(true);
        setTimeout(() => setTplSaveOk(false), 3000);
        loadConfig();
      } catch (e: unknown) {
        setTplSaveError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">Notificação por E-mail — Novos Leads</CardTitle>
              <p className="text-sm text-muted-foreground">
                E-mail automático disparado ao cadastrar um lead, baseado nos colaboradores por área.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {outlook && (
              <Badge
                variant="outline"
                className={
                  outlook.configured
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }
              >
                {outlook.configured ? (
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                ) : (
                  <AlertCircle className="mr-1 h-3 w-3" />
                )}
                {outlook.delegated_connected
                  ? "Outlook OAuth"
                  : outlook.configured
                    ? "Outlook (aplicação)"
                    : "Outlook não configurado"}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Carregando configuração…</span>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && !error && templateDefaults && (
            <>
              {outlook && !outlook.configured && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Envio de e-mail não configurado</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p className="text-sm">
                      <strong className="text-foreground">Opção A (recomendada, como no n8n):</strong> ligue uma
                      conta Microsoft com OAuth — permissões{" "}
                      <code className="text-xs font-mono">Mail.Send</code> e{" "}
                      <code className="text-xs font-mono">offline_access</code>{" "}
                      <strong>delegadas</strong> no mesmo registo de aplicação (client id do SharePoint), e adicione o
                      redirect URI Web:{" "}
                      <code className="break-all text-xs font-mono">
                        …/api/admin/microsoft-mail/oauth/callback
                      </code>
                      . Defina também <code className="text-xs font-mono">NEXT_PUBLIC_APP_URL</code> com a URL
                      pública do CRM.
                    </p>
                    <a
                      href="/api/admin/microsoft-mail/oauth/authorize"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ligar conta Outlook (OAuth)
                    </a>
                    <p className="text-sm">
                      <strong className="text-foreground">Opção B:</strong> envio por aplicação com{" "}
                      <code className="text-xs font-mono">OUTLOOK_FROM_EMAIL</code> e permissão{" "}
                      <code className="text-xs font-mono">Mail.Send</code> de <strong>aplicação</strong> (consentimento
                      admin).
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {outlook?.delegated_connected && outlook.from && (
                <div className="flex flex-col gap-3 rounded-lg border border-emerald-200/80 bg-emerald-50/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="font-medium text-emerald-950">OAuth delegado (como no n8n)</p>
                      <p className="mt-0.5 text-xs">
                        Remetente: <code className="font-mono text-xs text-foreground">{outlook.from}</code>
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-emerald-300"
                    disabled={isPendingOAuth}
                    onClick={handleDisconnectOutlook}
                  >
                    {isPendingOAuth ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Unplug className="mr-2 h-4 w-4" />
                    )}
                    Desligar conta
                  </Button>
                </div>
              )}

              {outlook?.configured && outlook.mode === "application" && outlook.from && (
                <div className="space-y-2 rounded-lg border bg-muted/40 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Remetente (aplicação):{" "}
                      <code className="font-mono text-xs">{outlook.from}</code>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Para mudar para o fluxo do n8n, use{" "}
                    <a
                      href="/api/admin/microsoft-mail/oauth/authorize"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Ligar conta Outlook (OAuth)
                    </a>{" "}
                    — passará a ter prioridade sobre este modo.
                  </p>
                </div>
              )}

              <EmailTemplatesEditor
                dueSubject={dueSubject}
                dueHtml={dueHtml}
                semSubject={semSubject}
                semHtml={semHtml}
                onChangeDue={({ subject, html }) => {
                  setDueSubject(subject);
                  setDueHtml(html);
                }}
                onChangeSem={({ subject, html }) => {
                  setSemSubject(subject);
                  setSemHtml(html);
                }}
                onSave={handleSaveTemplates}
                onResetDue={() => {
                  setDueSubject(templateDefaults.due.subjectTemplate);
                  setDueHtml(templateDefaults.due.htmlTemplate);
                }}
                onResetSem={() => {
                  setSemSubject(templateDefaults.sem_due.subjectTemplate);
                  setSemHtml(templateDefaults.sem_due.htmlTemplate);
                }}
                isPending={isPendingTpl}
                saveOk={tplSaveOk}
                saveError={tplSaveError}
              />

              {usersByArea.length > 0 && <UsersByAreaSection users={usersByArea} />}

              {fixed.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Destinatários fixos adicionais</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Sempre incluídos no e-mail, independentemente das áreas. Útil para pessoas sem
                      conta no CRM.
                    </p>
                  </div>

                  {fixed.map((row) => (
                    <div key={row.key} className="rounded-lg border bg-card p-4 space-y-3">
                      <p className="text-sm font-medium">{row.label}</p>
                      <RecipientEditor
                        recipients={row.recipients}
                        onChange={(next) => updateFixed(row.key, next)}
                      />
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-sm min-h-[22px]">
                      {saveOk && (
                        <span className="flex items-center gap-1.5 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          Destinatários fixos salvos.
                        </span>
                      )}
                      {saveError && (
                        <span className="flex items-center gap-1.5 text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          {saveError}
                        </span>
                      )}
                    </div>
                    <Button onClick={handleSaveFixed} disabled={isPendingFixed} size="sm">
                      {isPendingFixed ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Salvar destinatários fixos
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
