"use client";

import Link from "next/link";
import { AlertCircle, Check, ChevronDown, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCrmInAppNotificationsRealtime } from "@/lib/crm/use-in-app-notifications-realtime";
import {
  NOTIFICATION_TAB_GROUPS,
  formatContextoDateTimePtBr,
  notificationTabGroupForTipo,
  parseDueLevantamentoEnrichment,
  parseLeadContextoDatas,
  parseLeadCriadorPor,
  parseOriginadoPor,
  type NotificationTabGroupId,
} from "@/lib/crm/in-app-notification-meta";

type Row = {
  id: string;
  tipo: string;
  payload: unknown;
  lida_em: string | null;
  created_at: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  const a = parts[0]![0] ?? "";
  const b = parts[parts.length - 1]![0] ?? "";
  return `${a}${b}`.toUpperCase();
}

function NotificationCards({
  items,
  markRead,
  emptyHint,
}: {
  items: Row[];
  markRead: (id: string) => void | Promise<void>;
  emptyHint?: string;
}) {
  if (items.length === 0) {
    return (
      <Card className="glass-card-no-float border-white/30">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <p>Nenhuma notificação nesta categoria.</p>
          {emptyHint ? <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground/90">{emptyHint}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((n) => {
        const payload = (n.payload ?? {}) as {
          title?: string;
          link?: string;
          path?: string;
          area_key?: string;
          preview?: string;
          leadName?: string;
        };
        const originadoPor = parseOriginadoPor(n.payload);
        const leadCriador = parseLeadCriadorPor(n.payload);
        const face = originadoPor ?? leadCriador;
        const title = payload.title ?? n.tipo;
        const description =
          typeof payload.preview === "string" && payload.preview.trim()
            ? payload.preview
            : typeof payload.leadName === "string" && payload.leadName.trim()
              ? payload.leadName
              : null;
        const href =
          typeof payload.link === "string" && payload.link.startsWith("http")
            ? payload.link
            : typeof payload.path === "string"
              ? payload.path
              : "/crm/leads";

        const dueLevantamento = parseDueLevantamentoEnrichment(n.payload);
        const contextoDatas = parseLeadContextoDatas(n.payload);

        return (
          <li key={n.id}>
            <Card
              className={`glass-card-no-float transition-colors ${n.lida_em ? "opacity-80" : "border-primary-dark/20 bg-white/55"}`}
            >
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar className="size-10 shrink-0 border border-[#e1e5eb]">
                    {face?.avatar_url ? (
                      <AvatarImage src={face.avatar_url} alt="" />
                    ) : null}
                    <AvatarFallback className="text-[11px]">
                      {face ? initialsFromName(face.full_name) : "—"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {originadoPor ? (
                        <>
                          <span className="font-medium text-foreground/80">Originado por </span>
                          {originadoPor.full_name}
                        </>
                      ) : leadCriador ? (
                        <>
                          <span className="font-medium text-foreground/80">Lead criado por </span>
                          {leadCriador.full_name}
                        </>
                      ) : (
                        <span>Origem: sistema / automático</span>
                      )}
                    </p>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription className="text-xs leading-relaxed sm:text-sm">
                      <span className="font-medium text-muted-foreground/90">Alerta criado em </span>
                      {new Date(n.created_at).toLocaleString("pt-BR")}
                      <span className="text-muted-foreground/80">
                        {payload.area_key ? ` · Área: ${payload.area_key}` : null}
                        {n.lida_em ? (
                          <>
                            {" "}
                            · Lida em {new Date(n.lida_em).toLocaleString("pt-BR")}
                          </>
                        ) : null}
                      </span>
                    </CardDescription>
                    {contextoDatas ? (
                      <div className="mt-2 space-y-1 rounded-lg border border-primary-dark/10 bg-white/60 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                        <p>
                          <span className="font-semibold text-foreground/85">Lead criado: </span>
                          {formatContextoDateTimePtBr(contextoDatas.lead_criado_em) ?? "—"}
                        </p>
                        <p>
                          <span className="font-semibold text-foreground/85">Entrega DUE: </span>
                          {formatContextoDateTimePtBr(contextoDatas.due_entrega_em) ?? "—"}
                        </p>
                        <p>
                          <span className="font-semibold text-foreground/85">Reunião: </span>
                          {formatContextoDateTimePtBr(contextoDatas.reuniao_em) ?? "—"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
                {description ? (
                  <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                ) : null}
                {dueLevantamento && dueLevantamento.areas.length > 0 ? (
                  <details className="due-kanban-details mt-3 rounded-lg border border-primary-dark/10 bg-white/70 open:bg-white/90">
                    <summary
                      className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-primary-dark/75 outline-none transition-colors hover:bg-primary-dark/[0.04] [&::-webkit-details-marker]:hidden"
                      title="Abrir ou fechar o detalhe por área"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <ChevronDown
                          className="due-kanban-chevron h-3.5 w-3.5 shrink-0 text-primary-dark/45 transition-transform duration-200"
                          aria-hidden
                        />
                        <span className="truncate">Levantamento DUE</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {dueLevantamento.disponibilizados}/{dueLevantamento.total}
                      </span>
                    </summary>
                    <ul className="space-y-1.5 border-t border-primary-dark/10 px-2 pb-2.5 pt-2">
                      {dueLevantamento.areas.map((row) => (
                        <li
                          key={row.areaKey}
                          className="flex items-start gap-2 text-[10px] font-medium leading-snug text-primary-dark/85"
                        >
                          <span className="mt-0.5 shrink-0" aria-hidden>
                            {row.entregue ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                            ) : row.emAtraso ? (
                              <AlertCircle className="h-3.5 w-3.5 text-rose-600" strokeWidth={2.5} />
                            ) : (
                              <Clock className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-bold text-primary-dark">{row.areaKey}</span>
                            {row.entregue ? (
                              <span className="text-emerald-900/85">
                                {" "}
                                — concluída
                                {row.semProcessosAtivos ? (
                                  <span className="font-normal text-primary-dark/65"> (sem proc. ativos)</span>
                                ) : null}
                              </span>
                            ) : row.emAtraso ? (
                              <span className="text-rose-900/85"> — em atraso</span>
                            ) : (
                              <span className="text-amber-950/80"> — pendente</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {dueLevantamento.atrasados > 0 ? (
                      <p className="border-t border-primary-dark/10 px-2 pb-2 text-[10px] font-bold text-rose-700">
                        {dueLevantamento.atrasados} área(s) em atraso
                      </p>
                    ) : null}
                  </details>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3 pt-0">
                <Link
                  href={href}
                  className="text-sm font-medium text-primary-dark underline-offset-4 hover:underline"
                >
                  Abrir oportunidade
                </Link>
                {!n.lida_em ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => void markRead(n.id)}
                  >
                    Marcar como lida
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function itemsForTabGroup(items: Row[], group: NotificationTabGroupId): Row[] {
  if (group === "todas") return items;
  return items.filter((n) => notificationTabGroupForTipo(n.tipo) === group);
}

export function NotificationList({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [activeTab, setActiveTab] = useState<NotificationTabGroupId>("todas");

  const hasOutras = useMemo(
    () => items.some((n) => notificationTabGroupForTipo(n.tipo) === "outras"),
    [items],
  );

  const countsByGroup = useMemo(() => {
    const map = new Map<Exclude<NotificationTabGroupId, "todas">, { total: number; unread: number }>();
    const keys: Exclude<NotificationTabGroupId, "todas">[] = [
      "due",
      "propostas",
      "indicadores",
      "anotacoes",
      "sla_etapa",
      "outras",
    ];
    for (const k of keys) {
      map.set(k, { total: 0, unread: 0 });
    }
    for (const n of items) {
      const g = notificationTabGroupForTipo(n.tipo);
      const cur = map.get(g) ?? { total: 0, unread: 0 };
      cur.total += 1;
      if (!n.lida_em) cur.unread += 1;
      map.set(g, cur);
    }
    return map;
  }, [items]);

  useEffect(() => {
    if (activeTab === "outras" && !hasOutras) {
      setActiveTab("todas");
    }
  }, [activeTab, hasOutras]);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/notifications", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; notifications?: Row[] };
      if (data.ok && Array.isArray(data.notifications)) setItems(data.notifications);
    } catch {
      /* mantém lista atual */
    }
  }, []);

  useCrmInAppNotificationsRealtime(() => {
    void refreshList();
  });

  async function markRead(id: string) {
    const res = await fetch(`/api/crm/notifications/${encodeURIComponent(id)}`, { method: "PATCH" });
    if (!res.ok) return;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, lida_em: new Date().toISOString() } : x)));
    router.refresh();
  }

  const totalUnread = useMemo(() => items.filter((n) => !n.lida_em).length, [items]);

  const slaEmptyHint =
    "O CRM ainda não gera alertas automáticos de SLA por etapa. Quando essa função existir, as notificações aparecerão nesta aba.";

  const outrasCount = countsByGroup.get("outras") ?? { total: 0, unread: 0 };

  if (items.length === 0) {
    return (
      <Card className="glass-card-no-float border-white/30">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma notificação por agora.
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as NotificationTabGroupId)}
      className="gap-4"
    >
      <div className="overflow-x-auto rounded-xl border border-[#e1e5eb] bg-white/80 p-1.5 shadow-sm">
        <TabsList variant="line" className="h-auto min-w-max gap-0.5 bg-transparent p-0">
          <TabsTrigger value="todas" className="shrink-0 rounded-lg px-3 py-2 text-xs sm:text-sm">
            Todas
            {totalUnread > 0 ? (
              <span className="ml-1 rounded-full bg-primary-dark/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary-dark">
                {totalUnread}
              </span>
            ) : null}
          </TabsTrigger>
          {NOTIFICATION_TAB_GROUPS.map(({ id, label }) => {
            const c = countsByGroup.get(id) ?? { total: 0, unread: 0 };
            return (
              <TabsTrigger key={id} value={id} className="shrink-0 rounded-lg px-3 py-2 text-xs sm:text-sm">
                {label}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  ({c.total}
                  {c.unread > 0 ? ` · ${c.unread} nova${c.unread > 1 ? "s" : ""}` : ""})
                </span>
              </TabsTrigger>
            );
          })}
          {hasOutras ? (
            <TabsTrigger value="outras" className="shrink-0 rounded-lg px-3 py-2 text-xs sm:text-sm">
              Outras
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                ({outrasCount.total}
                {outrasCount.unread > 0 ? ` · ${outrasCount.unread} nova${outrasCount.unread > 1 ? "s" : ""}` : ""})
              </span>
            </TabsTrigger>
          ) : null}
        </TabsList>
      </div>

      <TabsContent value="todas" className="mt-0 outline-none">
        <NotificationCards items={items} markRead={markRead} />
      </TabsContent>
      {NOTIFICATION_TAB_GROUPS.map(({ id }) => (
        <TabsContent key={id} value={id} className="mt-0 outline-none">
          <NotificationCards
            items={itemsForTabGroup(items, id)}
            markRead={markRead}
            emptyHint={id === "sla_etapa" ? slaEmptyHint : undefined}
          />
        </TabsContent>
      ))}
      {hasOutras ? (
        <TabsContent value="outras" className="mt-0 outline-none">
          <NotificationCards items={itemsForTabGroup(items, "outras")} markRead={markRead} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
