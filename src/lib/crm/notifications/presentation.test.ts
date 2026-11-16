import { describe, expect, it } from "vitest";

import {
  buildPushMessage,
  formatNotificationTime,
  groupNotificationsByDay,
  notificationBody,
  notificationDayBucket,
  notificationGroupLabel,
  notificationHref,
  notificationTitle,
} from "./presentation";

const NOW = new Date(2026, 10, 16, 15, 30); // 16/11/2026 15:30 local

function at(day: number, hour: number, minute = 0): string {
  return new Date(2026, 10, day, hour, minute).toISOString();
}

describe("notificationHref", () => {
  it("prefere o caminho relativo ao link absoluto", () => {
    expect(notificationHref({ path: "/crm/leads/1?tab=due", link: "https://crm.exemplo/crm/leads/1" })).toBe(
      "/crm/leads/1?tab=due",
    );
  });

  it("usa o link absoluto de avisos antigos e cai em /crm/leads sem nada", () => {
    expect(notificationHref({ link: "https://crm.exemplo/x" })).toBe("https://crm.exemplo/x");
    expect(notificationHref(null)).toBe("/crm/leads");
  });

  it("não aceita caminho protocol-relative (//host)", () => {
    expect(notificationHref({ path: "//evil.example/x" })).toBe("/crm/leads");
  });
});

describe("título e corpo", () => {
  it("cai no rótulo do tipo sem título e no nome do lead sem preview", () => {
    const row = { tipo: "venda_fechada", payload: { leadName: "ACME S.A." } };
    expect(notificationTitle(row)).toBe("Venda fechada");
    expect(notificationBody(row)).toBe("ACME S.A.");
  });

  it("rótulo de grupo 'outras' é Geral", () => {
    expect(notificationGroupLabel("outras")).toBe("Geral");
    expect(notificationGroupLabel("due")).toBe("DUE");
  });
});

describe("agrupamento por dia", () => {
  it("classifica hoje, ontem, semana e antigas", () => {
    expect(notificationDayBucket(at(16, 0, 5), NOW)).toBe("hoje");
    expect(notificationDayBucket(at(15, 23, 59), NOW)).toBe("ontem");
    expect(notificationDayBucket(at(11, 9), NOW)).toBe("semana");
    expect(notificationDayBucket(at(9, 9), NOW)).toBe("antigas");
  });

  it("mantém a ordem e cria uma seção por faixa", () => {
    const rows = [
      { id: "a", created_at: at(16, 10) },
      { id: "b", created_at: at(16, 8) },
      { id: "c", created_at: at(15, 18) },
      { id: "d", created_at: at(1, 9) },
    ];
    const sections = groupNotificationsByDay(rows, NOW);
    expect(sections.map((s) => [s.label, s.items.map((i) => i.id)])).toEqual([
      ["Hoje", ["a", "b"]],
      ["Ontem", ["c"]],
      ["Mais antigas", ["d"]],
    ]);
  });
});

describe("formatNotificationTime", () => {
  it("mostra agora, minutos e hora", () => {
    expect(formatNotificationTime(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe("agora");
    expect(formatNotificationTime(new Date(NOW.getTime() - 12 * 60_000).toISOString(), NOW)).toBe("12 min");
    expect(formatNotificationTime(at(16, 9, 5), NOW)).toBe("09:05");
    expect(formatNotificationTime(at(15, 9, 5), NOW)).toBe("ontem 09:05");
  });
});

describe("buildPushMessage", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    tipo: "proposta_escopo_area",
    created_at: at(16, 10),
  };

  it("monta título, corpo, tag pelo id e caminho relativo", () => {
    const msg = buildPushMessage(
      { ...base, payload: { title: "Escopo pedido", preview: "Trabalhista · ACME", path: "/crm/leads/9" } },
      { unread: 4 },
    );
    expect(msg).toMatchObject({
      title: "Escopo pedido",
      body: "Trabalhista · ACME",
      path: "/crm/leads/9",
      tag: `crm-notif-${base.id}`,
      group: "propostas",
      groupLabel: "Propostas",
      unread: 4,
    });
  });

  it("link absoluto vira a central (o service worker não abre outro domínio)", () => {
    const msg = buildPushMessage({ ...base, payload: { link: "https://outro.exemplo/x" } });
    expect(msg.path).toBe("/crm/notifications");
    expect(msg.body).toBe("Propostas");
  });

  it("corta textos longos", () => {
    const msg = buildPushMessage({ ...base, payload: { title: "x".repeat(300), preview: "y".repeat(400) } });
    expect(msg.title.length).toBe(120);
    expect(msg.body.length).toBe(240);
    expect(msg.title.endsWith("…")).toBe(true);
  });
});
