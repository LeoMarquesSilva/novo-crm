import { describe, expect, it } from "vitest";

import { sanitizeReturnTo } from "./sanitize-return-to";

describe("sanitizeReturnTo", () => {
  it.each([
    ["/crm/leads/1?tab=billing", "/crm/leads/1?tab=billing"],
    ["/crm", "/crm"],
    ["https://evil.com", null],
    ["//evil.com/crm/", null],
    ["/login", null],
    ["/crm/\\evil", null],
    [null, null],
  ])("%s → %s", (raw, expected) => {
    expect(sanitizeReturnTo(raw)).toBe(expected);
  });
});
