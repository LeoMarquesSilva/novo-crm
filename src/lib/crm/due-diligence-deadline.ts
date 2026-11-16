import { formatDateYmdBr } from "@/lib/format-datetime";

const BR_OFFSET = "-03:00";

/** `time` do Postgres ou texto livre; devolve HH:mm:ss ou null se inválido / "a definir". */
function parseClock(horario: string | null | undefined): string | null {
  if (horario == null) return null;
  const s = String(horario).trim();
  if (!s || /^a\s+definir$/i.test(s)) return null;
  const head = s.replace(/\+.*/, "").split(/[Zz]/)[0] ?? s;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(head);
  if (!m) return null;
  const hh = String(Number(m[1])).padStart(2, "0");
  const mm = String(Number(m[2])).padStart(2, "0");
  const ss = m[3] != null ? String(Number(m[3])).padStart(2, "0") : "00";
  return `${hh}:${mm}:${ss}`;
}

/**
 * Prazo combinado (data + hora no fuso BR) para comparação com `Date` UTC.
 * Sem hora válida: fim do dia civil em Brasília (23:59:59).
 */
export function dueDeadlineInstantIso(
  dataEntregaDue: string | null | undefined,
  horarioEntregaDue: string | null | undefined,
): string | null {
  if (dataEntregaDue == null) return null;
  const d = String(dataEntregaDue).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const clock = parseClock(horarioEntregaDue);
  const t = clock ?? "23:59:59";
  return `${d}T${t}${BR_OFFSET}`;
}

/**
 * Prazo de tarefa (data + hora de Brasília) em ISO UTC; sem horário, 18:00. Antes as tarefas montavam
 * "2026-11-19T18:00:00" sem fuso e, no servidor da Vercel (UTC), o prazo virava 15:00 de Brasília (16/11/2026).
 */
export function prazoBrasiliaIso(date: string | null | undefined, time: string | null | undefined): string | null {
  if (!date?.trim()) return null;
  const instant = dueDeadlineInstantIso(date, time?.trim() || "18:00");
  if (!instant) return null;
  const ms = Date.parse(instant);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function formatDueDeadlineDisplay(
  dataEntregaDue: string | null | undefined,
  horarioEntregaDue: string | null | undefined,
): string {
  if (dataEntregaDue == null || String(dataEntregaDue).trim() === "") return "—";
  const dateBr = formatDateYmdBr(String(dataEntregaDue).slice(0, 10));
  if (!dateBr) return "—";
  const clock = parseClock(horarioEntregaDue);
  if (!clock) return `${dateBr} · horário a definir`;
  const short = clock.slice(0, 5);
  return `${dateBr} · ${short}`;
}

export type DuePunctuality =
  | { kind: "sem_prazo"; label: string }
  | { kind: "no_prazo"; label: string }
  | { kind: "fora_do_prazo"; label: string; detail: string }
  | { kind: "em_andamento"; label: string }
  | { kind: "em_atraso"; label: string; detail: string };

function diffDaysLate(finalMs: number, deadlineMs: number): number {
  const delta = finalMs - deadlineMs;
  if (delta <= 0) return 0;
  return Math.ceil(delta / (24 * 60 * 60 * 1000));
}

export function computeDuePunctuality(params: {
  deadlineIso: string | null;
  finalizadaIso: string | null;
  nowMs?: number;
}): DuePunctuality {
  const now = params.nowMs ?? Date.now();
  const { deadlineIso, finalizadaIso } = params;

  if (!deadlineIso) {
    return { kind: "sem_prazo", label: "Prazo não informado" };
  }

  const deadlineMs = Date.parse(deadlineIso);
  if (Number.isNaN(deadlineMs)) {
    return { kind: "sem_prazo", label: "Prazo não informado" };
  }

  if (finalizadaIso) {
    const finMs = Date.parse(finalizadaIso);
    if (Number.isNaN(finMs)) {
      return { kind: "sem_prazo", label: "Prazo não informado" };
    }
    if (finMs <= deadlineMs) {
      return { kind: "no_prazo", label: "Entregue no prazo" };
    }
    const days = diffDaysLate(finMs, deadlineMs);
    return {
      kind: "fora_do_prazo",
      label: "Entrega fora do prazo",
      detail: days <= 1 ? "após o deadline" : `${days} dias após o deadline`,
    };
  }

  if (now > deadlineMs) {
    const days = diffDaysLate(now, deadlineMs);
    return {
      kind: "em_atraso",
      label: "Em atraso",
      detail: days <= 1 ? "prazo ultrapassado" : `${days} dias após o deadline`,
    };
  }

  return { kind: "em_andamento", label: "Em curso" };
}
