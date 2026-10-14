"use client";

/** Aba Marketing: público do LinkedIn, visitas ao site, leads de WhatsApp, temas do NPS e próximos passos. */
import { Crosshair, Globe, Lightbulb, MessageCircle, MessageSquareHeart, TriangleAlert } from "lucide-react";
import type { IcpData } from "@/modules/icp/domain/compute";
import { SRC } from "./icp-content";
import { decimal, pct } from "./icp-format";
import { BarRow, Callout, LinkedinIcon, Panel } from "./icp-primitives";

export function MarketingTab({ data }: { data: IcpData }) {
  const m = data.marketing;
  const maxCity = Math.max(...m.ga4TopCities.map((c) => c.sessions), 1);
  const maxSource = Math.max(...m.whatsappBySource.map((s) => s.count), 1);
  const maxTheme = Math.max(...data.decisor.strengths.map((s) => s.count), ...data.decisor.pains.map((s) => s.count), 1);

  const steps = [
    {
      title: "Completar o segmento dos grupos sem CNPJ",
      text: `O segmento já vem da Receita para clientes que somam ${pct(data.sectors.coverageShare)} da receita. Falta cadastrar no VIOS o CNPJ dos demais grupos. O porte vem da página da empresa no LinkedIn para ${data.groups.filter((g) => g.employeeBand).length} de ${data.groups.length} grupos.`,
    },
    { title: "Pontuar leads com os critérios de ICP", text: "Criar no CRM os campos de setor, porte, gatilho, decisor e potencial de áreas." },
    {
      title: "Montar lista de empresas parecidas",
      text: "Indústrias na RMC e no interior de SP, com sinais de crise (protestos, execuções, pedidos de RJ).",
    },
    { title: "Mudar o alvo do conteúdo e da mídia paga", text: "Falar com o dono e o CFO industrial: reestruturação, passivo trabalhista e crédito." },
    {
      title: "Plano de expansão para quem entra por Insolvência",
      text: data.totals.breadthMultiplier
        ? `Quem usa três ou mais áreas gera ${decimal(data.totals.breadthMultiplier)}× mais receita.`
        : "Quem usa três ou mais áreas gera mais receita.",
    },
    { title: "Qualificar os leads de WhatsApp", text: "Separar pessoa física de empresa no pipeline que já existe no ORQESTRAI." },
  ];

  return (
    <div className="flex flex-col gap-4">
      {data.marketingAvailable === false ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-(--radius-v2-xl) border border-warning-border bg-warning-bg px-4 py-3 text-sm leading-relaxed text-foreground"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">Dados de marketing indisponíveis neste ambiente</p>
            <p className="mt-0.5 text-muted-foreground">
              NPS, público do LinkedIn, visitas ao site e leads de WhatsApp vêm do ORQESTRAI, e o CRM não está conectado
              a ele aqui. É preciso configurar a conexão (ORQESTRAI_SUPABASE_URL e ORQESTRAI_SUPABASE_SERVICE_ROLE_KEY) e
              depois usar Recalcular.
            </p>
          </div>
        </div>
      ) : (
        <Callout icon={Lightbulb} className="rounded-(--radius-v2-xl)">
          A região de atuação já coincide com o ICP. O público das redes e os leads que chegam, não: a audiência é de
          advogados e o inbound traz principalmente pessoas físicas.
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={LinkedinIcon}
          title="Quem segue a página no LinkedIn"
          description={`${m.linkedinFollowers.toLocaleString("pt-BR")} seguidores com setor informado`}
          sources={[SRC.linkedin]}
        >
          <div className="space-y-3">
            <BarRow
              label="Setor jurídico"
              value={m.linkedinLegalShare ?? 0}
              max={1}
              display={pct(m.linkedinLegalShare)}
              barClassName="bg-neutral-400"
            />
            <BarRow label="Indústria" value={m.linkedinIndustryShare ?? 0} max={1} display={pct(m.linkedinIndustryShare)} />
            <BarRow
              label="Donos, dirigentes e diretores"
              value={m.linkedinDecisionShare ?? 0}
              max={1}
              display={pct(m.linkedinDecisionShare)}
            />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">O conteúdo precisa mirar o dono e o CFO da indústria.</p>
        </Panel>

        <Panel
          icon={Globe}
          title="De onde vêm as visitas ao site"
          description="Sessões no Google Analytics em 12 meses"
          sources={[SRC.ga4]}
        >
          <div className="space-y-3">
            {m.ga4TopCities.map((c) => (
              <BarRow
                key={c.city}
                label={c.city}
                value={c.sessions}
                max={maxCity}
                display={c.sessions.toLocaleString("pt-BR")}
                barClassName="bg-chart-6"
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Campinas e São Paulo concentram o tráfego, como a carteira.</p>
        </Panel>

        <Panel
          icon={MessageCircle}
          title="Leads de WhatsApp"
          description={`${m.whatsappTotal} conversas individuais`}
          sources={[SRC.whatsapp]}
        >
          <div className="space-y-3">
            {m.whatsappBySource.map((s) => (
              <BarRow
                key={s.label}
                label={s.label}
                value={s.count}
                max={maxSource}
                display={String(s.count)}
                barClassName="bg-chart-4"
              />
            ))}
          </div>
          <div className="mt-4 rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-text">
            {m.whatsappUnqualified} de {m.whatsappTotal} ainda estão em &quot;lead recebido&quot;, sem qualificação registrada.
          </div>
        </Panel>

        <Panel
          icon={MessageSquareHeart}
          title="O que o cliente valoriza"
          description="Temas dos comentários do NPS"
          sources={[SRC.npsTemas]}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2.5">
              <p className="text-xs font-medium text-success-text">Pontos fortes</p>
              {data.decisor.strengths.slice(0, 5).map((s) => (
                <BarRow
                  key={s.label}
                  label={s.label}
                  value={s.count}
                  max={maxTheme}
                  display={String(s.count)}
                  barClassName="bg-chart-2"
                />
              ))}
            </div>
            <div className="space-y-2.5">
              <p className="text-xs font-medium text-warning-text">Pontos de atenção</p>
              {data.decisor.pains.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum ponto de atenção classificado.</p>
              )}
              {data.decisor.pains.slice(0, 5).map((s) => (
                <BarRow
                  key={s.label}
                  label={s.label}
                  value={s.count}
                  max={maxTheme}
                  display={String(s.count)}
                  barClassName="bg-chart-3"
                />
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel icon={Crosshair} title="Próximos passos" description="Como colocar o ICP em uso">
        <ol className="grid gap-3 md:grid-cols-2">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-(--radius-v2-md) bg-surface-subtle px-3 py-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-interactive-100 text-xs font-semibold tabular-nums text-interactive-700">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <details className="rounded-(--radius-v2-xl) border border-border bg-white px-4 py-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Como os números são calculados</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            Receita: itens a receber do VIOS com plano de contas de honorários e pagamento registrado nos últimos 12 meses.
            Reembolsos e outras receitas ficam de fora.
          </li>
          <li>Clientes agrupados pelo grupo cliente do VIOS, a partir do nome do cliente no título.</li>
          <li>Faixas: A a partir de R$ 200 mil, B de R$ 60 a 200 mil, C de R$ 20 a 60 mil e D abaixo de R$ 20 mil em 12 meses.</li>
          <li>
            Segmento (CNAE) e sede vêm do cadastro da Receita Federal, pelo CNPJ das empresas do grupo no VIOS. Porte é a
            faixa de colaboradores que a empresa declara na página dela no LinkedIn; o logo vem da mesma página ou do site
            da empresa. Primeira área com processo é a área do primeiro processo do grupo.
          </li>
          <li>Atraso: parcelas vencidas em aberto no VIOS, inclusive valores antigos e renegociados.</li>
          <li>LinkedIn: último retrato importado. GA4 e WhatsApp: dados sincronizados no ORQESTRAI.</li>
        </ul>
      </details>
    </div>
  );
}
