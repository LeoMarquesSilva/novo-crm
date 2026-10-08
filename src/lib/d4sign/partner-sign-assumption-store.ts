import {
  isPartnerSignAssumption,
  type PartnerSignAssumption,
} from "@/lib/d4sign/partner-sign-assumption";

const STORAGE_KEY = "crm.partner-sign-assumption.v1";
const REVERTED_KEY = "crm.partner-sign-reverted.v1";
const CHANGE_EVENT = "crm-partner-sign-assumption";

const EMPTY: PartnerSignAssumption[] = [];

let snapshotRaw: string | null = null;
let snapshot: PartnerSignAssumption[] = EMPTY;

function parse(raw: string | null): PartnerSignAssumption[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY;
    const list = parsed.filter(isPartnerSignAssumption);
    return list.length > 0 ? list : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readPartnerSignAssumptions(): PartnerSignAssumption[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === snapshotRaw) return snapshot;
  snapshotRaw = raw;
  snapshot = parse(raw);
  return snapshot;
}

export function writePartnerSignAssumptions(list: PartnerSignAssumption[]): void {
  const raw = JSON.stringify(list);
  localStorage.setItem(STORAGE_KEY, raw);
  snapshotRaw = raw;
  snapshot = list;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribePartnerSignAssumptions(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

export function emptyPartnerSignAssumptions(): PartnerSignAssumption[] {
  return EMPTY;
}

const EMPTY_NAMES: string[] = [];
let revertedRaw: string | null = null;
let revertedSnapshot: string[] = EMPTY_NAMES;

function parseNames(raw: string | null): string[] {
  if (!raw) return EMPTY_NAMES;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY_NAMES;
    const names = parsed.filter((name): name is string => typeof name === "string" && name.trim() !== "");
    return names.length > 0 ? names : EMPTY_NAMES;
  } catch {
    return EMPTY_NAMES;
  }
}

export function readRevertedPartnerSignNames(): string[] {
  if (typeof window === "undefined") return EMPTY_NAMES;
  const raw = sessionStorage.getItem(REVERTED_KEY);
  if (raw === revertedRaw) return revertedSnapshot;
  revertedRaw = raw;
  revertedSnapshot = parseNames(raw);
  return revertedSnapshot;
}

export function rememberRevertedPartnerSignNames(names: string[]): void {
  const current = readRevertedPartnerSignNames();
  const merged = [...current];
  for (const name of names) {
    if (!merged.includes(name)) merged.push(name);
  }
  if (merged.length === current.length) return;
  const raw = JSON.stringify(merged);
  sessionStorage.setItem(REVERTED_KEY, raw);
  revertedRaw = raw;
  revertedSnapshot = merged;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function emptyRevertedPartnerSignNames(): string[] {
  return EMPTY_NAMES;
}
