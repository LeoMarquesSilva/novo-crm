"use client";

import { useId, useState } from "react";
import { BellRing, LoaderCircle, MonitorSmartphone, Play, Send, Volume1, Volume2, VolumeX } from "lucide-react";

import { useCrmNotifications } from "@/components/crm/notifications/notifications-provider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useNotificationPreferences } from "@/lib/crm/notifications/preferences";
import { isIosWithoutStandalone, isServerPushAvailable } from "@/lib/crm/notifications/push-client";
import {
  NOTIFICATION_SOUNDS,
  playNotificationSound,
  unlockNotificationAudio,
  type NotificationSoundId,
} from "@/lib/crm/notifications/sound";
import { cn } from "@/lib/utils";

function SettingRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className={cn("min-w-0 cursor-pointer", disabled && "cursor-not-allowed opacity-60")}>
        <span className="block text-[13px] font-semibold leading-5 text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-[18px] text-muted-foreground">{description}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}

function PushStatus() {
  const { push } = useCrmNotifications();
  const [prefs, setPrefs] = useNotificationPreferences();
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const systemId = useId();

  const state = push.state;
  const serverPush = isServerPushAvailable();

  const status: { tone: "on" | "partial" | "off" | "blocked"; title: string; detail: string } = (() => {
    switch (state) {
      case "subscribed":
        return { tone: "on", title: "Ativas neste dispositivo", detail: "Os avisos chegam mesmo com o CRM fechado." };
      case "granted":
        return serverPush
          ? { tone: "partial", title: "Permitidas, falta registrar", detail: "Ative para receber também com o CRM fechado." }
          : {
              tone: "partial",
              title: "Ativas com o CRM aberto",
              detail: "Aparecem no sistema enquanto o CRM estiver aberto em alguma aba.",
            };
      case "denied":
        return {
          tone: "blocked",
          title: "Bloqueadas no navegador",
          detail: "Clique no cadeado ao lado do endereço, libere Notificações e recarregue a página.",
        };
      case "unsupported":
        return isIosWithoutStandalone()
          ? {
              tone: "off",
              title: "No iPhone, instale o CRM",
              detail: "Toque em Compartilhar → Adicionar à Tela de Início e abra o CRM pelo ícone.",
            }
          : { tone: "off", title: "Não suportadas", detail: "Este navegador não mostra notificações do sistema." };
      case "loading":
        return { tone: "off", title: "Verificando…", detail: "" };
      default:
        return {
          tone: "off",
          title: "Desativadas",
          detail: "Receba os avisos no Windows/celular, mesmo com o CRM em outra janela.",
        };
    }
  })();

  const dotClass = {
    on: "bg-success-text",
    partial: "bg-warning-text",
    off: "bg-neutral-400",
    blocked: "bg-danger-text",
  }[status.tone];

  const canEnable = state === "default" || (state === "granted" && serverPush);
  const canTest = state === "subscribed" || state === "granted";

  async function runTest() {
    setTesting(true);
    setTestFeedback(null);
    try {
      setTestFeedback(await push.sendTest());
    } finally {
      setTesting(false);
    }
  }

  return (
    <section aria-labelledby={`${systemId}-title`} className="space-y-3">
      <div className="flex items-center gap-2">
        <MonitorSmartphone className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden />
        <h3 id={`${systemId}-title`} className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Notificações do sistema
        </h3>
      </div>

      <div className="rounded-(--radius-v2-lg) border border-border bg-neutral-25 p-3">
        <div className="flex items-start gap-2.5">
          <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", dotClass)} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-5 text-foreground">{status.title}</p>
            {status.detail ? <p className="mt-0.5 text-xs leading-[18px] text-muted-foreground">{status.detail}</p> : null}
          </div>
        </div>

        {canEnable || state === "subscribed" || canTest ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {canEnable ? (
              <Button type="button" size="sm" onClick={() => void push.enable()} disabled={push.busy}>
                {push.busy ? <LoaderCircle className="animate-spin" /> : <BellRing />}
                Ativar notificações
              </Button>
            ) : null}
            {canTest ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => void runTest()} disabled={testing}>
                {testing ? <LoaderCircle className="animate-spin" /> : <Send />}
                Enviar teste
              </Button>
            ) : null}
            {state === "subscribed" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => void push.disable()} disabled={push.busy}>
                Desativar neste dispositivo
              </Button>
            ) : null}
          </div>
        ) : null}

        {push.error ? (
          <p role="alert" className="mt-2 text-xs font-medium text-danger-text">
            {push.error}
          </p>
        ) : null}
        {testFeedback ? (
          <p
            role="status"
            className={cn("mt-2 text-xs leading-[18px]", testFeedback.ok ? "text-success-text" : "text-danger-text")}
          >
            {testFeedback.message}
          </p>
        ) : null}
      </div>

      {state === "subscribed" || state === "granted" ? (
        <SettingRow
          id={`${systemId}-hidden`}
          title="Avisar quando o CRM estiver em segundo plano"
          description="Mostra a notificação do sistema se o CRM estiver aberto, mas em outra aba ou janela."
          checked={prefs.systemWhenHidden}
          onCheckedChange={(value) => setPrefs({ systemWhenHidden: value })}
        />
      ) : null}
    </section>
  );
}

export function NotificationSettingsPanel({ className }: { className?: string }) {
  const [prefs, setPrefs] = useNotificationPreferences();
  const baseId = useId();
  const VolumeIcon = !prefs.sound || prefs.volume === 0 ? VolumeX : prefs.volume < 0.5 ? Volume1 : Volume2;

  function preview(id: NotificationSoundId, volume = prefs.volume) {
    unlockNotificationAudio();
    // O contexto pode levar um instante para sair de "suspended" depois do primeiro gesto.
    if (!playNotificationSound(id, volume)) window.setTimeout(() => playNotificationSound(id, volume), 80);
  }

  return (
    <div className={cn("space-y-6", className)}>
      <section aria-labelledby={`${baseId}-sound`} className="space-y-3">
        <div className="flex items-center gap-2">
          <VolumeIcon className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden />
          <h3 id={`${baseId}-sound`} className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Som
          </h3>
        </div>

        <SettingRow
          id={`${baseId}-sound-on`}
          title="Tocar som ao chegar um aviso"
          description="Toca uma vez, mesmo com várias abas do CRM abertas."
          checked={prefs.sound}
          onCheckedChange={(value) => setPrefs({ sound: value })}
        />

        <div className={cn("space-y-3 transition-opacity", !prefs.sound && "pointer-events-none opacity-50")} aria-disabled={!prefs.sound}>
          <div role="radiogroup" aria-label="Tipo de som" className="grid grid-cols-2 gap-1.5">
            {NOTIFICATION_SOUNDS.map((sound) => {
              const selected = prefs.soundId === sound.id;
              return (
                <button
                  key={sound.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={prefs.sound ? 0 : -1}
                  onClick={() => {
                    setPrefs({ soundId: sound.id });
                    preview(sound.id);
                  }}
                  className={cn(
                    "flex flex-col items-start rounded-(--radius-v2-md) border px-2.5 py-2 text-left transition-colors duration-(--motion-fast)",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    selected
                      ? "border-interactive-300 bg-interactive-50 text-interactive-700"
                      : "border-border bg-white text-foreground hover:border-border-strong hover:bg-neutral-50",
                  )}
                >
                  <span className="text-[13px] font-semibold leading-5">{sound.label}</span>
                  <span className={cn("text-xs leading-4", selected ? "text-interactive-700/80" : "text-muted-foreground")}>
                    {sound.hint}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor={`${baseId}-volume`} className="w-14 shrink-0 text-xs font-semibold text-neutral-700">
              Volume
            </label>
            <input
              id={`${baseId}-volume`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(prefs.volume * 100)}
              tabIndex={prefs.sound ? 0 : -1}
              onChange={(event) => setPrefs({ volume: Number(event.target.value) / 100 })}
              onPointerUp={() => preview(prefs.soundId)}
              onKeyUp={(event) => {
                if (event.key.startsWith("Arrow")) preview(prefs.soundId);
              }}
              aria-valuetext={`${Math.round(prefs.volume * 100)}%`}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
            />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(prefs.volume * 100)}%
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              aria-label="Testar som"
              tabIndex={prefs.sound ? 0 : -1}
              onClick={() => preview(prefs.soundId)}
            >
              <Play />
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby={`${baseId}-screen`} className="space-y-3">
        <h3 id={`${baseId}-screen`} className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Na tela
        </h3>
        <SettingRow
          id={`${baseId}-toasts`}
          title="Mostrar pop-up no canto da tela"
          description="Um cartão aparece por alguns segundos quando chega um aviso com o CRM aberto."
          checked={prefs.toasts}
          onCheckedChange={(value) => setPrefs({ toasts: value })}
        />
      </section>

      <PushStatus />

      <p className="text-xs leading-[18px] text-muted-foreground">
        Som e pop-up valem só para este navegador. As notificações do sistema precisam ser ativadas em cada
        computador ou celular.
      </p>
    </div>
  );
}
