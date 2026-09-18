import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { normalizeImportedAreaKey } from "./schemas";

export type SioeHonorarioItem = {
  ciTitulo: number;
  departamento: string | null;
  valorItem: number;
  competencia: string | null;
  situacao: string | null;
  planoContas: string | null;
  descricao: string | null;
};

export type SioeRateioShare = {
  areaKey: string;
  percentageBasisPoints: number;
  amountCents: number;
};

export type SioeRateioSnapshot = {
  shares: SioeRateioShare[];
  totalCents: number;
  competency: string | null;
  situacao: string | null;
  ciTitulo: number | null;
};

const RATEIO_DEPARTMENT_ALIASES: Record<string, string> = {
  civel: "Cível",
  trabalhista: "Trabalhista",
  tributario: "Tributário",
  contratos: "Societário e Contratos",
  societario: "Societário e Contratos",
  insolvencia: "Reestruturação e Insolvência",
  reestruturacao: "Reestruturação e Insolvência",
  "recuperacao de credito": "Recuperação de Créditos",
  "recuperacao de creditos": "Recuperação de Créditos",
};

export function mapSioeDepartamentoToAreaKey(departamento: string | null | undefined): string | null {
  const raw = (departamento ?? "").trim();
  if (!raw || raw.includes("|")) return null;
  const canonical = normalizeImportedAreaKey(raw);
  if (canonical && (CRM_PRACTICE_AREAS as readonly string[]).includes(canonical)) return canonical;
  const key = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return RATEIO_DEPARTMENT_ALIASES[key] ?? null;
}

export function isSioeHonorariosItem(item: Pick<SioeHonorarioItem, "planoContas" | "descricao">): boolean {
  const text = `${item.planoContas ?? ""} ${item.descricao ?? ""}`.toLocaleLowerCase("pt-BR");
  if (text.includes("reembolso") || text.includes("despesa")) return false;
  return text.includes("honor") || text.includes("advocat");
}

export function sharesFromCents(centsByArea: Map<string, number>): SioeRateioShare[] {
  const entries = [...centsByArea.entries()].filter(([, cents]) => cents > 0);
  const totalCents = entries.reduce((sum, [, cents]) => sum + cents, 0);
  if (totalCents <= 0 || entries.length === 0) return [];

  const raw = entries.map(([areaKey, amountCents]) => ({
    areaKey,
    amountCents,
    exact: (amountCents * 10_000) / totalCents,
  }));
  const floored = raw.map((row) => ({
    ...row,
    percentageBasisPoints: Math.floor(row.exact),
    remainder: row.exact - Math.floor(row.exact),
  }));
  let leftover = 10_000 - floored.reduce((sum, row) => sum + row.percentageBasisPoints, 0);
  floored
    .sort((left, right) => right.remainder - left.remainder)
    .forEach((row) => {
      if (leftover <= 0) return;
      row.percentageBasisPoints += 1;
      leftover -= 1;
    });

  return floored
    .sort((left, right) => left.areaKey.localeCompare(right.areaKey, "pt-BR"))
    .map(({ areaKey, amountCents, percentageBasisPoints }) => ({
      areaKey,
      amountCents,
      percentageBasisPoints,
    }));
}

function competencyRank(value: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return value;
}

export function buildSioeRateioSnapshot(items: SioeHonorarioItem[]): SioeRateioSnapshot | null {
  const honorarios = items.filter((item) => isSioeHonorariosItem(item) && Number(item.valorItem) > 0);
  const byTitle = new Map<number, SioeHonorarioItem[]>();
  for (const item of honorarios) {
    const list = byTitle.get(item.ciTitulo) ?? [];
    list.push(item);
    byTitle.set(item.ciTitulo, list);
  }

  const ranked = [...byTitle.entries()]
    .map(([ciTitulo, rows]) => {
      const situacao = String(rows[0]?.situacao ?? "").toUpperCase();
      const competency = rows
        .map((row) => competencyRank(row.competencia))
        .sort()
        .at(-1) ?? "";
      const mappedRows = rows.filter((row) => mapSioeDepartamentoToAreaKey(row.departamento));
      return { ciTitulo, rows: mappedRows, situacao, competency };
    })
    .filter((row) => (row.situacao === "ABERTO" || row.situacao === "PAGO") && row.rows.length > 0)
    .sort((left, right) => {
      const openDelta = Number(right.situacao === "ABERTO") - Number(left.situacao === "ABERTO");
      if (openDelta !== 0) return openDelta;
      return right.competency.localeCompare(left.competency);
    });

  const chosen = ranked[0];
  if (!chosen) return null;

  const centsByArea = new Map<string, number>();
  for (const item of chosen.rows) {
    const areaKey = mapSioeDepartamentoToAreaKey(item.departamento);
    if (!areaKey) continue;
    const cents = Math.round(Number(item.valorItem) * 100);
    centsByArea.set(areaKey, (centsByArea.get(areaKey) ?? 0) + cents);
  }
  const shares = sharesFromCents(centsByArea);
  if (!shares.length) return null;
  return {
    shares,
    totalCents: shares.reduce((sum, share) => sum + share.amountCents, 0),
    competency: chosen.competency || null,
    situacao: chosen.situacao,
    ciTitulo: chosen.ciTitulo,
  };
}
