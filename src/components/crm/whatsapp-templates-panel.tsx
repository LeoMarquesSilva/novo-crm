"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  exampleValuesFor,
  renderWhatsappTemplate,
  type WhatsappTemplateDef,
  type WhatsappTemplateKey,
} from "@/lib/crm/whatsapp/templates";
import { cn } from "@/lib/utils";

type TemplateState = WhatsappTemplateDef & {
  body: string;
  enabled: boolean;
  fromDatabase: boolean;
  updatedAt: string | null;
};

type LoadResponse = { ok: boolean; error?: string; tableMissing?: boolean; templates?: TemplateState[] };

/** `*negrito*` e `_itálico_` como o WhatsApp mostra; o resto fica como texto. */
function WhatsappFormatted({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, j) => {
            if (/^\*[^*\n]+\*$/.test(part)) return <strong key={j}>{part.slice(1, -1)}</strong>;
            if (/^_[^_\n]+_$/.test(part)) return <em key={j}>{part.slice(1, -1)}</em>;
            return <Fragment key={j}>{part}</Fragment>;
          })}
        </Fragment>
      ))}
    </>
  );
}

export function WhatsappTemplatesPanel() {
  const [templates, setTemplates] = useState<TemplateState[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<WhatsappTemplateKey | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selected = templates.find((t) => t.key === selectedKey) ?? null;

  const load = useCallback(async (keepKey?: WhatsappTemplateKey | null) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/whatsapp-templates", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as LoadResponse;
      if (!res.ok || !data.ok || !data.templates) throw new Error(data.error ?? "Não foi possível carregar os modelos.");
      setTemplates(data.templates);
      setTableMissing(Boolean(data.tableMissing));
      const next = data.templates.find((t) => t.key === keepKey) ?? data.templates[0] ?? null;
      setSelectedKey(next?.key ?? null);
      setDraftBody(next?.body ?? "");
      setDraftEnabled(next?.enabled ?? true);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao carregar os modelos." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function select(template: TemplateState) {
    setSelectedKey(template.key);
    setDraftBody(template.body);
    setDraftEnabled(template.enabled);
    setMessage(null);
  }

  const dirty = Boolean(selected) && (draftBody !== selected!.body || draftEnabled !== selected!.enabled);

  const preview = useMemo(
    () => (selected ? renderWhatsappTemplate(draftBody, exampleValuesFor(selected.key)) : ""),
    [draftBody, selected],
  );

  function insertPlaceholder(name: string) {
    const token = `{{${name}}}`;
    const el = textareaRef.current;
    if (!el) {
      setDraftBody((current) => current + token);
      return;
    }
    const start = el.selectionStart ?? draftBody.length;
    const end = el.selectionEnd ?? draftBody.length;
    const next = draftBody.slice(0, start) + token + draftBody.slice(end);
    setDraftBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/whatsapp-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: selected.key, body: draftBody, enabled: draftEnabled }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Não foi possível salvar o modelo.");
      setMessage({ tone: "ok", text: "Modelo salvo. As próximas mensagens já saem com este texto." });
      await load(selected.key);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao salvar." });
    } finally {
      setBusy(false);
    }
  }

  async function restoreDefault() {
    if (!selected) return;
    setConfirmRestore(false);
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/whatsapp-templates?key=${encodeURIComponent(selected.key)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Não foi possível restaurar o padrão.");
      setMessage({ tone: "ok", text: "Texto padrão restaurado." });
      await load(selected.key);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao restaurar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mensagens do WhatsApp</CardTitle>
        <p className="mt-2 text-xs text-muted-foreground">
          Texto de cada mensagem que o CRM manda no WhatsApp. Use os campos entre chaves para os dados do lead; a
          linha cujo campo vier vazio some da mensagem. <strong>*negrito*</strong> e <em>_itálico_</em> funcionam
          como no WhatsApp.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {tableMissing ? (
          <Alert>
            <AlertTitle>Edição indisponível até aplicar a migration</AlertTitle>
            <AlertDescription>
              Os textos abaixo são os padrões e continuam valendo. Para salvar alterações, aplique a migration
              <code className="mx-1 font-mono text-[11px]">20261022130000_whatsapp_message_templates</code>
              no banco.
            </AlertDescription>
          </Alert>
        ) : null}

        {loading && templates.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando os modelos…
          </p>
        ) : null}

        {templates.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <nav aria-label="Modelos" className="flex flex-col gap-1">
              {templates.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => select(template)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-(--radius-v2-lg) border px-3 py-2 text-left text-xs transition-colors",
                    template.key === selectedKey
                      ? "border-primary bg-interactive-50 font-semibold text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span className="min-w-0 truncate">{template.label}</span>
                  {!template.enabled ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Desligada
                    </Badge>
                  ) : template.fromDatabase ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Editada
                    </Badge>
                  ) : null}
                </button>
              ))}
            </nav>

            {selected ? (
              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">{selected.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Quando:</span> {selected.when}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Para:</span> {selected.destination}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Switch
                      checked={draftEnabled}
                      onCheckedChange={setDraftEnabled}
                      disabled={busy || tableMissing}
                      aria-label="Mensagem ligada"
                    />
                    {draftEnabled ? "Ligada" : "Desligada"}
                  </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="whatsapp-template-body" className="text-xs">
                      Texto
                    </Label>
                    <Textarea
                      id="whatsapp-template-body"
                      ref={textareaRef}
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      disabled={busy || tableMissing}
                      className="min-h-[280px] font-mono text-xs leading-relaxed"
                    />
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground">Campos (clique para inserir)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.placeholders.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            title={p.description}
                            onClick={() => insertPlaceholder(p.name)}
                            disabled={busy || tableMissing}
                            className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-[11px] text-foreground hover:bg-muted disabled:opacity-50"
                          >
                            {`{{${p.name}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <p className="text-xs font-medium">Prévia com dados de exemplo</p>
                    <div className="rounded-(--radius-v2-xl) border border-success-border bg-success-bg p-3 text-[13px] leading-relaxed break-words text-foreground">
                      {preview ? <WhatsappFormatted text={preview} /> : <span className="text-muted-foreground">Mensagem vazia.</span>}
                    </div>
                    {!draftEnabled ? (
                      <p className="text-xs text-warning-text">Desligada: o CRM não manda esta mensagem.</p>
                    ) : null}
                  </div>
                </div>

                {message ? (
                  <p
                    role="status"
                    className={cn("text-xs", message.tone === "ok" ? "text-success-text" : "text-danger-text")}
                  >
                    {message.text}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmRestore(true)}
                    disabled={busy || tableMissing || !selected.fromDatabase}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Restaurar padrão
                  </Button>
                  <Button type="button" size="sm" onClick={() => void save()} disabled={busy || tableMissing || !dirty}>
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                    Salvar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restaurar o texto padrão?</AlertDialogTitle>
              <AlertDialogDescription>
                O texto editado de &quot;{selected?.label}&quot; será apagado e a mensagem volta ao padrão do CRM,
                ligada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void restoreDefault()}>Restaurar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
