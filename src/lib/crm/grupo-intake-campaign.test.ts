import { describe, expect, it } from "vitest";
import {
  campaignTokenPayload,
  isCampaignIntakeToken,
  parseCampaignTokenRaw,
  resolveCampaignIntakeAction,
} from "./grupo-intake-campaign";
import { createGrupoIntakeToken, hashGrupoIntakeToken } from "./grupo-intake-token";

function token(overrides: Partial<{
  id: string;
  grupoId: string | null;
  scope: string | null;
  expiresAt: string;
  payload: unknown;
}> = {}) {
  return {
    id: overrides.id ?? "token-1",
    grupoId: overrides.grupoId ?? null,
    scope: overrides.scope ?? "carteira",
    expiresAt: overrides.expiresAt ?? "2026-10-18T12:00:00.000Z",
    payload: overrides.payload ?? campaignTokenPayload("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
  };
}

describe("token único da grade pública", () => {
  it("gera um token opaco de alta entropia e guarda só o hash para lookup", () => {
    const first = createGrupoIntakeToken();
    const second = createGrupoIntakeToken();
    expect(first.raw).toMatch(/^[A-Za-z0-9_-]{32,64}$/);
    expect(first.hash).toBe(hashGrupoIntakeToken(first.raw));
    expect(first.hash).toHaveLength(64);
    expect(first.raw).not.toBe(second.raw);
  });

  it("recusa token antigo 1:1 por grupo", () => {
    expect(isCampaignIntakeToken({ grupoId: "grupo-1", scope: "carteira" })).toBe(false);
    expect(isCampaignIntakeToken({ grupoId: null, scope: "carteira" })).toBe(true);
  });

  it("reusa o mesmo token de campanha enquanto válido", () => {
    const raw = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const resolved = resolveCampaignIntakeAction({
      now: new Date("2026-09-18T12:00:00.000Z"),
      activeTokens: [
        token({
          id: "current",
          expiresAt: "2026-10-18T12:00:00.000Z",
          payload: campaignTokenPayload(raw),
        }),
        token({
          id: "stale-group",
          grupoId: "grupo-1",
          payload: campaignTokenPayload("cccccccccccccccccccccccccccccccc"),
        }),
      ],
    });
    expect(resolved).toMatchObject({ action: "reuse", rawToken: raw, token: { id: "current" } });
    if (resolved.action === "reuse") expect(resolved.expireIds).toEqual([]);
  });

  it("emite um token novo quando o anterior expirou, não tem raw, ou pediu rotação", () => {
    expect(
      resolveCampaignIntakeAction({
        now: new Date("2026-09-18T12:00:00.000Z"),
        activeTokens: [token({ expiresAt: "2026-09-01T00:00:00.000Z" })],
      }).action,
    ).toBe("mint");
    expect(
      resolveCampaignIntakeAction({
        now: new Date("2026-09-18T12:00:00.000Z"),
        activeTokens: [token({ payload: {} })],
      }).action,
    ).toBe("mint");
    expect(
      resolveCampaignIntakeAction({
        now: new Date("2026-09-18T12:00:00.000Z"),
        rotate: true,
        activeTokens: [token({ id: "current" })],
      }),
    ).toEqual({ action: "mint", expireIds: ["current"] });
  });

  it("colapsa tokens extras de campanha no mesmo lote", () => {
    const resolved = resolveCampaignIntakeAction({
      now: new Date("2026-09-18T12:00:00.000Z"),
      activeTokens: [
        token({
          id: "older",
          expiresAt: "2026-10-01T00:00:00.000Z",
          payload: campaignTokenPayload("dddddddddddddddddddddddddddddddd"),
        }),
        token({
          id: "newer",
          expiresAt: "2026-10-20T00:00:00.000Z",
          payload: campaignTokenPayload("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
        }),
      ],
    });
    expect(resolved.action).toBe("reuse");
    if (resolved.action === "reuse") {
      expect(resolved.token.id).toBe("newer");
      expect(resolved.rawToken).toBe("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
      expect(resolved.expireIds).toEqual(["older"]);
    }
  });

  it("ignora payload sem token opaco válido", () => {
    expect(parseCampaignTokenRaw({ rawToken: "curto" })).toBeNull();
    expect(parseCampaignTokenRaw(campaignTokenPayload("ffffffffffffffffffffffffffffffff"))).toBe(
      "ffffffffffffffffffffffffffffffff",
    );
  });
});
