import { describe, expect, it } from "vitest";

import { DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences } from "./preferences";

describe("normalizeNotificationPreferences", () => {
  it("usa o padrão para valores ausentes ou inválidos", () => {
    expect(normalizeNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(normalizeNotificationPreferences({ soundId: "sirene", volume: "alto", sound: "sim" })).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
  });

  it("mantém valores válidos e limita o volume entre 0 e 1", () => {
    expect(
      normalizeNotificationPreferences({ sound: false, soundId: "sino", volume: 3, toasts: false, systemWhenHidden: false }),
    ).toEqual({ sound: false, soundId: "sino", volume: 1, toasts: false, systemWhenHidden: false });
    expect(normalizeNotificationPreferences({ volume: -1 }).volume).toBe(0);
  });
});
