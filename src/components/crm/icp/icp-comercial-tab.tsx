/** Aba Pauta comercial: anotações estáticas do Comercial para a reunião. */
import { Handshake, Megaphone, NotebookPen, Package, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Callout, Panel } from "./icp-primitives";

export const COMMERCIAL_AGENDA: { title: string; description: string; icon: LucideIcon; items: string[] }[] = [
  {
    title: "Área institucional",
    description: "Ações de marca e geração de demanda",
    icon: Megaphone,
    items: ["E-books", "Workshops", "Premiação por indicação", "Café com Cultura para clientes"],
  },
  {
    title: "Área de relacionamento",
    description: "Atendimento e acompanhamento dos clientes",
    icon: Handshake,
    items: ["Focal point", "Triagem dos leads online", "Triagem do NPS", "Controle de qualidade e satisfação"],
  },
  {
    title: "Produtos",
    description: "Ofertas que podem ser vendidas",
    icon: Package,
    items: ["E-books", "Cursos para profissionais", "Rec branca", "Consultoria"],
  },
];

export function ComercialTab() {
  const repeated = new Set(
    COMMERCIAL_AGENDA.flatMap((g) => g.items).filter((item, i, all) => all.indexOf(item) !== i),
  );

  return (
    <div className="flex flex-col gap-4">
      <Callout icon={NotebookPen} className="rounded-(--radius-v2-xl)">
        Anotações do Rafael (Comercial) para discutir na reunião, organizadas nas três frentes que ele propôs.
      </Callout>

      <div className="grid gap-4 lg:grid-cols-3">
        {COMMERCIAL_AGENDA.map((group) => (
          <Panel key={group.title} icon={group.icon} title={group.title} description={group.description}>
            <ul className="divide-y divide-border">
              {group.items.map((item) => {
                const others = repeated.has(item)
                  ? COMMERCIAL_AGENDA.filter((g) => g.title !== group.title && g.items.includes(item)).map((g) => g.title)
                  : [];
                return (
                  <li key={item} className="flex min-h-11 items-center justify-between gap-3 py-2">
                    <span className="text-sm font-medium text-foreground">{item}</span>
                    {others.length > 0 && (
                      <Badge variant="secondary" className="h-auto shrink-0 whitespace-normal py-0.5 font-medium text-muted-foreground">
                        também em {others.join(", ")}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">Fonte: anotações do Comercial (Rafael), trazidas para a reunião.</p>
    </div>
  );
}
