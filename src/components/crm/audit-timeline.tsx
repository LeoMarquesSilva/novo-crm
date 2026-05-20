import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StickyNote } from "@/components/crm/sticky-note";

export interface AuditTimelineItem {
  id: string;
  actor: string;
  from: string;
  to: string;
  at: string;
  leadName?: string | null;
  observacao?: string | null;
}

interface AuditTimelineProps {
  items: AuditTimelineItem[];
  loading?: boolean;
}

export function AuditTimeline({ items, loading }: AuditTimelineProps) {
  return (
    <Card className="hover:shadow-xl hover:shadow-primary-dark/20">
      <CardHeader>
        <CardTitle>Timeline de auditoria</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Últimas mudanças de etapa registradas no banco (importação RD e histórico de transições).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando eventos…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma transição de etapa registrada ainda. Os eventos aparecem quando o funil registrar
            histórico (por exemplo após sincronização com o RD).
          </p>
        ) : (
          <ol className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-white/35 bg-white/60 p-3 text-sm shadow-sm transition-all duration-200 hover:-translate-y-0.5"
              >
                <p className="font-medium">{item.actor}</p>
                {item.leadName ? (
                  <p className="text-xs text-muted-foreground">Lead: {item.leadName}</p>
                ) : null}
                <p className="text-muted-foreground">
                  {item.from} → {item.to}
                </p>
                <p className="text-xs text-muted-foreground">{item.at}</p>
                {item.observacao ? (
                  <p className="mt-1 text-xs italic text-muted-foreground">{item.observacao}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        <StickyNote color="teal">
          Mantenha rastreabilidade dos handoffs com SLA de resposta em 4 horas.
        </StickyNote>
      </CardContent>
    </Card>
  );
}
