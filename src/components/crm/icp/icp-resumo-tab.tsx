"use client";

/** Aba Resumo: o cliente ideal em uma frase, indicadores e o retrato da carteira. */
import {
  BadgeCheck,
  Check,
  CircleDollarSign,
  Crosshair,
  Factory,
  Layers,
  MapPin,
  MessageSquareHeart,
  Users,
  X,
} from "lucide-react";
import { EMPLOYEE_BANDS, typicalEmployeeRange, type IcpData } from "@/modules/icp/domain/compute";
import { SOURCE_SYSTEM, SRC, type Source } from "./icp-content";
import { decimal, excludedRevenueNote, money, pct } from "./icp-format";
import { DetailsTooltip, Kpi, KpiGroup, Panel, type IcpIcon } from "./icp-primitives";
import { DecisorPanel, EmployeesPanel, RegionPanel, SectorPanel } from "./icp-scope-panels";

export function ResumoTab({ data }: { data: IcpData }) {
  return (
    <div className="flex flex-col gap-5">
      <IdealClientSummary data={data} />

      <KpiGroup label="Indicadores do ICP">
        <Kpi
          icon={CircleDollarSign}
          label="Honorários em 12 meses"
          value={money(data.totals.revenue12m)}
          hint={`pagos por ${data.totals.payingGroups} grupos de clientes`}
          source={SRC.honorarios}
          info={`Honorários pagos por clientes nos últimos 12 meses. ${excludedRevenueNote(data)}`.trim()}
        />
        <Kpi
          icon={Crosshair}
          label="Concentração"
          value={`${data.totals.groupsFor50} grupos`}
          hint={`os ${data.totals.groupsFor50} maiores fazem 50% da receita; os ${data.totals.groupsFor80} maiores, 80%; os outros ${data.totals.payingGroups - data.totals.groupsFor80}, 20%`}
          source={SRC.honorarios}
          info={`Os grupos são ordenados do que mais pagou para o que menos pagou em 12 meses, e a receita é somada nessa ordem. Os ${data.totals.groupsFor50} primeiros já somam metade da receita; os ${data.totals.groupsFor80} primeiros (os mesmos ${data.totals.groupsFor50} mais os ${data.totals.groupsFor80 - data.totals.groupsFor50} seguintes) somam 80%. Os ${data.totals.payingGroups - data.totals.groupsFor80} restantes somam os outros 20%.`}
        />
        <Kpi
          icon={Layers}
          label="Efeito de várias áreas"
          value={data.totals.breadthMultiplier ? `${decimal(data.totals.breadthMultiplier)}×` : "—"}
          hint="receita mediana de quem usa 3+ áreas frente a quem usa uma"
          source={SRC.departamento}
        />
        <Kpi
          icon={MessageSquareHeart}
          label="NPS"
          value={data.decisor.nps != null ? String(data.decisor.nps) : "—"}
          hint={
            data.marketingAvailable === false
              ? "sem conexão com o ORQESTRAI neste ambiente"
              : `${data.decisor.responses} respostas; ${data.decisor.ownerResponses} de sócios ou donos`
          }
          source={SRC.npsNota}
        />
      </KpiGroup>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectorPanel data={data} />
        <RegionPanel data={data} />
      </div>

      <EmployeesPanel data={data} />

      <DecisorPanel data={data} />

      <QualificationPanel data={data} />
    </div>
  );
}

/** Bloco de abertura: a frase do cliente ideal e os seis traços que a compõem. */
function IdealClientSummary({ data }: { data: IcpData }) {
  const core = data.tiers.filter((t) => t.key === "A" || t.key === "B");
  const coreGroupsCount = core.reduce((acc, t) => acc + t.groups, 0);
  const coreAvgMonthly = core.reduce((acc, t) => acc + t.revenue, 0) / Math.max(1, coreGroupsCount) / 12;
  const coreAvgAreas = core.reduce((acc, t) => acc + t.avgAreas * t.groups, 0) / Math.max(1, coreGroupsCount);
  const topSector = data.sectors.core[0];
  const coreCount = data.totals.coreGroups;
  const { geography: geo, decisor, cnpjCoverage } = data;
  const regions = [
    { key: "interior", label: "Interior de SP", value: geo.coreInterior, phrase: "sediada no interior de São Paulo" },
    { key: "capital", label: "Capital de SP", value: geo.coreCapital, phrase: "sediada na capital paulista" },
    { key: "outros", label: "Outros estados", value: geo.coreOtherUf, phrase: "sediada fora de São Paulo" },
  ].sort((a, b) => b.value - a.value);
  const topRegion = regions[0].value > 0 ? regions[0] : null;
  const topAdminRole = decisor.adminRoles[0];
  const receitaDate = cnpjCoverage.fetchedAt ? new Date(cnpjCoverage.fetchedAt).toLocaleDateString("pt-BR") : null;
  const coreGroups = data.groups.filter((g) => g.tier === "A" || g.tier === "B");
  const coreWithEmployees = coreGroups.filter((g) => g.employeeBand);
  const topBand = EMPLOYEE_BANDS.map((b) => ({
    ...b,
    count: coreWithEmployees.filter((g) => g.employeeBand === b.key).length,
  })).sort((a, b) => b.count - a.count)[0];
  const typicalBand = topBand && topBand.count > 0 ? topBand : null;

  const traits: { icon: IcpIcon; label: string; value: string; hint?: string; source?: Source }[] = [
    {
      icon: Factory,
      label: "Segmento",
      value: topSector ? topSector.label : "—",
      hint: topSector ? `${pct(topSector.share)} da receita dos grupos A e B` : undefined,
      source: SRC.cnae,
    },
    {
      icon: Users,
      label: "Porte",
      value: typicalBand ? `${typicalBand.label} colaboradores` : "—",
      hint: typicalBand ? `${typicalBand.count} de ${coreWithEmployees.length} grupos com porte no LinkedIn` : undefined,
      source: SRC.colaboradores,
    },
    {
      icon: MapPin,
      label: "Região",
      value: topRegion ? topRegion.label : "—",
      hint: topRegion ? `${topRegion.value} de ${coreCount} grupos` : undefined,
      source: geo.coreFromReceita > coreCount / 2 ? SRC.sede : SRC.pessoas,
    },
    {
      icon: BadgeCheck,
      label: "Decisor",
      value: topAdminRole ? topAdminRole.label : "—",
      hint: `presente em ${decisor.coreWithAdmins} de ${coreCount} grupos`,
      source: SRC.socios,
    },
    {
      icon: CircleDollarSign,
      label: "Contrato",
      value: `~${money(coreAvgMonthly)}/mês`,
      hint: `${pct(data.retainer.core)} têm honorário mensal`,
      source: SRC.honorarios,
    },
    {
      icon: Layers,
      label: "Áreas",
      value: `${decimal(coreAvgAreas)} em média`,
      hint: "que faturaram em 12 meses",
      source: SRC.departamento,
    },
  ];

  const sentence = [
    topSector ? topSector.label : "Empresa",
    typicalBand ? ` de ${typicalBand.label.toLowerCase()} colaboradores` : "",
    topRegion ? `, ${topRegion.phrase}` : "",
    topAdminRole ? ", comandada pelo sócio-administrador" : "",
    `, com honorário mensal e cerca de ${Math.max(1, Math.round(coreAvgAreas))} áreas do escritório.`,
  ].join("");

  return (
    <section className="rounded-(--radius-v2-xl) border border-border bg-white p-5 sm:p-6">
      <p className="text-xs font-medium text-muted-foreground">O cliente ideal em uma frase</p>
      <p className="mt-2 max-w-3xl text-xl font-semibold leading-8 text-foreground">{sentence}</p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        Retrato dos {data.totals.coreGroups} grupos que pagaram R$ 60 mil ou mais em 12 meses: são{" "}
        {pct(data.totals.coreGroups / Math.max(1, data.totals.payingGroups))} da carteira pagante e geram{" "}
        {pct(data.totals.coreRevenueShare)} dos honorários.
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-v2-lg) border border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {traits.map((t) => (
          <div
            key={t.label}
            className="bg-surface-subtle px-3 py-2.5"
            title={t.source ? `Fonte: ${SOURCE_SYSTEM[t.source.system].label} · ${t.source.detail}` : undefined}
          >
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <t.icon className="size-3.5 shrink-0" aria-hidden />
              {t.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold leading-snug text-foreground">{t.value}</dd>
            {t.hint && <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">{t.hint}</dd>}
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <span>Fontes:</span>
        <span className="font-medium text-neutral-700">Receita Federal</span>
        <span aria-hidden>·</span>
        <span className="font-medium text-neutral-700">VIOS</span>
        <span aria-hidden>·</span>
        <span className="font-medium text-neutral-700">LinkedIn</span>
        <span aria-hidden>·</span>
        <span className="font-medium text-neutral-700">ORQESTRAI</span>
        <DetailsTooltip className="ml-1">
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">Receita Federal</span>: segmento (CNAE), sede e sócios da
              empresa de referência de cada grupo, pelos dados abertos do CNPJ
              {receitaDate ? `, consultados em ${receitaDate}` : ""}. Cobre {cnpjCoverage.coreWithCompany} dos{" "}
              {cnpjCoverage.coreGroups} grupos A e B.
            </li>
            <li>
              <span className="font-semibold text-foreground">VIOS</span>: honorários, áreas e contrato.{" "}
              {excludedRevenueNote(data)}
            </li>
            <li>
              <span className="font-semibold text-foreground">LinkedIn</span>: porte (faixa de colaboradores declarada na
              página da empresa) e logo. Cobre {coreWithEmployees.length} dos {coreGroups.length} grupos A e B.
            </li>
            <li>
              <span className="font-semibold text-foreground">ORQESTRAI</span>: NPS.
            </li>
          </ul>
        </DetailsTooltip>
      </div>
    </section>
  );
}

function QualificationPanel({ data }: { data: IcpData }) {
  const tierD = data.tiers.find((t) => t.key === "D");
  // Segmentos que somam pelo menos 75% da receita A e B.
  const mainSectors: string[] = [];
  let covered = 0;
  for (const s of data.sectors.core) {
    if (covered >= 0.75 || mainSectors.length >= 3) break;
    mainSectors.push(s.label);
    covered += s.share;
  }
  const geo = data.geography;
  const porte = typicalEmployeeRange(data.groups.filter((g) => g.tier === "A" || g.tier === "B"));
  const yes = [
    "Pessoa jurídica, de preferência grupo com várias empresas",
    porte ? `${porte.label} colaboradores (${porte.count} de ${porte.known} grupos A e B com porte)` : null,
    mainSectors.length
      ? `${mainSectors.join(", ").replace(/, ([^,]*)$/, " ou $1")} (${pct(covered)} da receita A e B)`
      : null,
    `Sede no interior de SP ou na capital (${geo.coreInterior + geo.coreCapital} de ${data.totals.coreGroups} grupos A e B)`,
    "Endividamento, recuperação judicial, passivo trabalhista volumoso ou crédito relevante em risco",
    "Decisão com o sócio-administrador ou dono",
    "Aceita honorário mensal e tem potencial para três ou mais áreas",
    "Ticket a partir de R$ 5 mil por mês",
  ].filter(Boolean) as string[];
  const no = [
    "Pessoa física em causa pontual, sobretudo reclamante trabalhista com honorário de êxito",
    "Demanda de uma área só, sem recorrência",
    "Ticket abaixo de R$ 1,7 mil por mês",
    tierD
      ? `A faixa D tem ${tierD.groups} grupos, ${pct(tierD.revenueShare)} da receita e atraso equivalente a ${pct(tierD.overdueRatio)} do que pagou em 12 meses`
      : null,
  ].filter(Boolean) as string[];

  return (
    <Panel
      icon={Crosshair}
      title="Critérios de qualificação"
      description="Use para priorizar prospecção e avaliar leads novos"
      sources={[SRC.honorarios, SRC.cnae, SRC.sede, SRC.colaboradores, SRC.socios, SRC.processos, SRC.npsCargo]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-(--radius-v2-lg) border border-success-border bg-success-bg p-4">
          <p className="text-sm font-semibold text-success-text">Priorizar</p>
          <ul className="mt-3 space-y-2">
            {yes.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-(--radius-v2-lg) border border-warning-border bg-warning-bg p-4">
          <p className="text-sm font-semibold text-warning-text">Fora do perfil</p>
          <ul className="mt-3 space-y-2">
            {no.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-foreground">
                <X className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
