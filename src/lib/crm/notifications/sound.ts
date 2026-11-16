/**
 * Sons das notificações, sintetizados com Web Audio (16/11/2026): nada de arquivo de áudio
 * para baixar e cada som é curto e baixo, pensado para escritório.
 *
 * O navegador só libera áudio depois de um gesto do usuário (clique/tecla). O provider chama
 * `unlockNotificationAudio()` no primeiro gesto; antes disso `playNotificationSound` não toca.
 */

export type NotificationSoundId = "suave" | "cristal" | "pop" | "sino";

export const NOTIFICATION_SOUNDS: ReadonlyArray<{ id: NotificationSoundId; label: string; hint: string }> = [
  { id: "suave", label: "Suave", hint: "Duas notas curtas" },
  { id: "cristal", label: "Cristal", hint: "Arpejo agudo" },
  { id: "pop", label: "Pop", hint: "Discreto" },
  { id: "sino", label: "Sino", hint: "Mais presente" },
];

export function isNotificationSoundId(value: unknown): value is NotificationSoundId {
  return NOTIFICATION_SOUNDS.some((s) => s.id === value);
}

type AudioContextCtor = typeof AudioContext;

let sharedContext: AudioContext | null = null;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function getContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
  } catch {
    sharedContext = null;
  }
  return sharedContext;
}

export function isNotificationAudioSupported(): boolean {
  return audioContextCtor() !== null;
}

/** Chamar dentro de um gesto do usuário. Seguro chamar várias vezes. */
export function unlockNotificationAudio(): void {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
}

export function isNotificationAudioUnlocked(): boolean {
  return sharedContext?.state === "running";
}

type ToneSpec = {
  freq: number;
  /** Segundos depois do início do som. */
  at: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  attack?: number;
  /** Frequência final (glissando curto), opcional. */
  freqEnd?: number;
};

function scheduleTone(ctx: AudioContext, out: AudioNode, start: number, spec: ToneSpec) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const t0 = start + spec.at;
  const attack = spec.attack ?? 0.006;
  osc.type = spec.type ?? "sine";
  osc.frequency.setValueAtTime(spec.freq, t0);
  if (spec.freqEnd) osc.frequency.exponentialRampToValueAtTime(spec.freqEnd, t0 + spec.duration * 0.6);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(spec.gain, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration);
  osc.connect(env);
  env.connect(out);
  osc.start(t0);
  osc.stop(t0 + spec.duration + 0.02);
}

function presetTones(id: NotificationSoundId): ToneSpec[] {
  switch (id) {
    case "cristal":
      return [1046.5, 1318.51, 1567.98].flatMap((freq, i) => [
        { freq, at: i * 0.075, duration: 0.55, gain: 0.32 },
        { freq: freq * 2, at: i * 0.075, duration: 0.3, gain: 0.06 },
      ]);
    case "pop":
      return [
        { freq: 920, freqEnd: 460, at: 0, duration: 0.16, gain: 0.5, attack: 0.003 },
        { freq: 1840, at: 0, duration: 0.05, gain: 0.05, type: "triangle", attack: 0.002 },
      ];
    case "sino": {
      const f = 880;
      // Parciais inarmônicos de sino, cada um decaindo mais rápido.
      return [
        { freq: f, at: 0, duration: 1.35, gain: 0.34, attack: 0.004 },
        { freq: f * 2.76, at: 0, duration: 0.7, gain: 0.1, attack: 0.003 },
        { freq: f * 5.4, at: 0, duration: 0.4, gain: 0.05, attack: 0.002 },
        { freq: f * 0.5, at: 0, duration: 1.0, gain: 0.08, attack: 0.01 },
      ];
    }
    case "suave":
    default:
      return [
        { freq: 659.25, at: 0, duration: 0.42, gain: 0.34 },
        { freq: 1318.51, at: 0, duration: 0.18, gain: 0.04, type: "triangle" },
        { freq: 987.77, at: 0.11, duration: 0.55, gain: 0.3 },
        { freq: 1975.53, at: 0.11, duration: 0.2, gain: 0.035, type: "triangle" },
      ];
  }
}

/**
 * Toca o som escolhido. `volume` de 0 a 1. Devolve false quando o navegador ainda não
 * liberou o áudio (sem gesto do usuário) ou não suporta Web Audio.
 */
export function playNotificationSound(id: NotificationSoundId, volume: number): boolean {
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
    if ((ctx.state as AudioContextState) !== "running") return false;
  }
  const level = Math.min(1, Math.max(0, volume));
  if (level === 0) return true;

  const master = ctx.createGain();
  master.gain.value = level * 0.9;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 4;
  master.connect(compressor);
  compressor.connect(ctx.destination);

  const start = ctx.currentTime + 0.01;
  let end = start;
  for (const tone of presetTones(id)) {
    scheduleTone(ctx, master, start, tone);
    end = Math.max(end, start + tone.at + tone.duration);
  }
  window.setTimeout(() => {
    try {
      master.disconnect();
      compressor.disconnect();
    } catch {
      /* já desconectado */
    }
  }, Math.ceil((end - ctx.currentTime + 0.2) * 1000));
  return true;
}
