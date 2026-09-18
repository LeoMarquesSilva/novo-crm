import { isGrupoIntakeTokenFormat } from "@/lib/crm/grupo-intake-token";

export const GRUPO_INTAKE_CAMPAIGN_SCOPE = "carteira" as const;

export type CampaignIntakeTokenRecord = {
  id: string;
  grupoId: string | null;
  scope?: string | null;
  expiresAt: string;
  payload: unknown;
};

export function isCampaignIntakeToken(row: {
  grupoId?: string | null;
  scope?: string | null;
}): boolean {
  if (row.grupoId) return false;
  return !row.scope || row.scope === GRUPO_INTAKE_CAMPAIGN_SCOPE;
}

export function parseCampaignTokenRaw(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { rawToken?: unknown }).rawToken;
  if (typeof raw !== "string" || !isGrupoIntakeTokenFormat(raw)) return null;
  return raw;
}

export function campaignTokenPayload(rawToken: string): { kind: "carteira"; rawToken: string } {
  return { kind: GRUPO_INTAKE_CAMPAIGN_SCOPE, rawToken };
}

export function resolveCampaignIntakeAction(input: {
  activeTokens: CampaignIntakeTokenRecord[];
  now?: Date;
  rotate?: boolean;
}):
  | { action: "reuse"; token: CampaignIntakeTokenRecord; rawToken: string; expireIds: string[] }
  | { action: "mint"; expireIds: string[] } {
  const now = input.now ?? new Date();
  const campaign = input.activeTokens.filter(
    (row) => isCampaignIntakeToken(row) && new Date(row.expiresAt).getTime() > now.getTime(),
  );
  const expireAll = campaign.map((row) => row.id);

  if (input.rotate) return { action: "mint", expireIds: expireAll };

  const reusable = campaign
    .map((token) => ({ token, rawToken: parseCampaignTokenRaw(token.payload) }))
    .filter((row): row is { token: CampaignIntakeTokenRecord; rawToken: string } => Boolean(row.rawToken))
    .sort((left, right) => new Date(right.token.expiresAt).getTime() - new Date(left.token.expiresAt).getTime());

  const winner = reusable[0];
  if (!winner) return { action: "mint", expireIds: expireAll };

  return {
    action: "reuse",
    token: winner.token,
    rawToken: winner.rawToken,
    expireIds: campaign.filter((row) => row.id !== winner.token.id).map((row) => row.id),
  };
}
