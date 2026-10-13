"use client";

/**
 * Painéis do Resumo que podem ser recortados por faixa (escritório todo, ICP ou uma
 * faixa): segmento, região, porte por colaboradores e decisor.
 */
import { useState } from "react";
import { BadgeCheck, Factory, MapPin, Users } from "lucide-react";
import { EMPLOYEE_BANDS, sectorShares, type IcpData } from "@/modules/icp/domain/compute";
import { SRC, groupsInScope, scopeText, type TierScope } from "./icp-content";
import { decimal, groupName, isCapitalCity, medianOf, money, pct } from "./icp-format";
import { BarRow, CompanyLogo, Panel, TierScopeTabs } from "./icp-primitives";

/** Segmento dos grupos que pagaram em 12 meses: no escritório todo ou por faixa. */
export function SectorPanel({ data }: { data: IcpData }) {
  const [scope, setScope] = useState<TierScope>("all");
  const inScope = groupsInScope(data, scope);
  const withSector = inScope.filter((g) => g.sectorBucket);
  const shares = sectorShares(withSector);
  // Setores com menos de 3% da receita viram uma linha só, para a lista caber num olhar.
  const tail = shares.filter((s) => s.share < 0.03);
  const list =
    tail.length > 1
      ? [
          ...shares.filter((s) => s.share >= 0.03),
          {
            label: "Outros setores",
            value: tail.reduce((acc, s) => acc + s.value, 0),
            share: tail.reduce((acc, s) => acc + s.share, 0),
            hint: tail.map((s) => s.label).join(", "),
          },
        ]
      : shares;
  const groups = inScope.length;
  const known = withSector.length;
  const individuals = inScope.filter((g) => !g.sectorBucket && g.clientType === "pessoa_fisica").length;
  const others = groups - known - individuals;

  return (
    <Panel
      icon={Factory}
      title="Segmento"
      description={`Receita por segmento dos ${groups} grupos ${scopeText(data, scope)}`}
      info="Segmento é o macrossetor do CNAE principal da empresa de referência de cada grupo, na Receita Federal. A barra mostra quanto da receita dos grupos com segmento vem de cada setor."
      sources={[SRC.cnae, SRC.honorarios]}
    >
      <TierScopeTabs value={scope} onChange={setScope} />
      <div className="space-y-3">
        {list.map((s) => (
          <div key={s.label} title={"hint" in s ? s.hint : undefined}>
            <BarRow
              label={s.label}
              hint={"hint" in s ? `${tail.length} setores` : money(s.value)}
              value={s.share}
              max={Math.max(...list.map((x) => x.share))}
              display={pct(s.share)}
              barClassName={"hint" in s ? "bg-neutral-300" : undefined}
            />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {known} de {groups} grupos têm segmento.
        {individuals > 0 && ` ${individuals} ${individuals === 1 ? "é pessoa física" : "são pessoa física"} e não têm CNPJ.`}
        {others > 0 && ` ${others} ${others === 1 ? "é empresa" : "são empresas"} sem CNPJ no VIOS.`}
      </p>
    </Panel>
  );
}

/** Onde ficam os grupos (sede na Receita ou cidade do VIOS): no escritório todo ou por faixa. */
export function RegionPanel({ data }: { data: IcpData }) {
  const [scope, setScope] = useState<TierScope>("all");
  const inScope = groupsInScope(data, scope);
  const revenue = inScope.reduce((acc, g) => acc + g.revenue12m, 0);
  const counts = [
    { label: "Interior de SP", value: inScope.filter((g) => g.uf === "SP" && g.city && !isCapitalCity(g.city)).length },
    { label: "Capital", value: inScope.filter((g) => g.uf === "SP" && isCapitalCity(g.city)).length },
    { label: "Outros estados", value: inScope.filter((g) => g.uf && g.uf !== "SP").length },
    { label: "Sem cidade", value: inScope.filter((g) => !g.uf || (g.uf === "SP" && !g.city)).length },
  ];
  const byCity = new Map<string, number>();
  let spRevenue = 0;
  for (const g of inScope) {
    if (g.city) byCity.set(g.city, (byCity.get(g.city) ?? 0) + g.revenue12m);
    if (g.uf === "SP") spRevenue += g.revenue12m;
  }
  const cities = [...byCity.entries()]
    .map(([label, value]) => ({ label, value, share: revenue > 0 ? value / revenue : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const fromReceita = inScope.filter((g) => g.regionSource === "receita").length;

  return (
    <Panel
      icon={MapPin}
      title="Região"
      description={`Onde ficam os ${inScope.length} grupos ${scopeText(data, scope)} e de quais cidades vem a receita`}
      info="Região é a cidade da sede da empresa de referência do grupo, na Receita Federal. Grupo sem CNPJ consultado usa a cidade mais frequente no cadastro do VIOS."
      sources={[SRC.sede, SRC.pessoas, SRC.honorarios]}
    >
      <TierScopeTabs value={scope} onChange={setScope} />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {counts.map((c) => (
          <div key={c.label} className="flex flex-col-reverse rounded-(--radius-v2-md) bg-surface-subtle px-3 py-2">
            <dt className="text-xs text-muted-foreground">{c.label}</dt>
            <dd className="text-xl font-semibold tabular-nums text-foreground">{c.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-2 mt-4 text-xs font-medium text-muted-foreground">Cidades com mais receita</p>
      <div className="space-y-2.5">
        {cities.map((c) => (
          <BarRow
            key={c.label}
            label={c.label}
            hint={money(c.value)}
            value={c.share}
            max={cities[0]?.share ?? 1}
            display={pct(c.share, 1)}
            barClassName="bg-chart-6"
          />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        São Paulo (estado) concentra {pct(revenue > 0 ? spRevenue / revenue : null)} da receita.{" "}
        {fromReceita} de {inScope.length} grupos têm a sede pela Receita; os demais usam a cidade do cadastro do VIOS.
      </p>
    </Panel>
  );
}

const LOGOS_PER_BAND = 12;
const BAR_MAX_PX = 104;

/**
 * Porte por colaboradores (faixa declarada na página do LinkedIn): uma coluna por faixa, da
 * menor para a maior empresa, com a parte da receita, o ticket mediano e os logos dos grupos.
 */
export function EmployeesPanel({ data }: { data: IcpData }) {
  const [scope, setScope] = useState<TierScope>("all");
  const inScope = groupsInScope(data, scope);
  const known = inScope.filter((g) => g.employeeBand);
  const knownRevenue = known.reduce((acc, g) => acc + g.revenue12m, 0);
  const bands = EMPLOYEE_BANDS.map((b) => {
    const groups = known.filter((g) => g.employeeBand === b.key).sort((x, y) => y.revenue12m - x.revenue12m);
    const revenue = groups.reduce((acc, g) => acc + g.revenue12m, 0);
    return {
      ...b,
      groups,
      revenue,
      share: knownRevenue > 0 ? revenue / knownRevenue : 0,
      ticket: medianOf(groups.map((g) => g.monthly)),
    };
  });
  const maxShare = Math.max(0.01, ...bands.map((b) => b.share));
  const individuals = inScope.filter((g) => !g.employeeBand && !g.referenceCompany && g.clientType === "pessoa_fisica").length;
  const withoutRange = inScope.length - known.length - individuals;

  return (
    <Panel
      icon={Users}
      title="Porte"
      description={`Receita por número de colaboradores dos ${inScope.length} grupos ${scopeText(data, scope)}`}
      info="Faixa de colaboradores que a empresa declara na página dela no LinkedIn, a mesma dos filtros de busca do LinkedIn. A página de cada grupo foi localizada e conferida pelo nome, sede, setor e site. A coluna mostra quanto da receita dos grupos com porte vem de cada faixa; abaixo, quantos grupos há nela e o honorário mensal do grupo do meio da faixa (mediana)."
      sources={[SRC.colaboradores, SRC.honorarios]}
    >
      <TierScopeTabs value={scope} onChange={setScope} />
      {/* As colunas ficam sempre numa linha só, com a mesma base, para comparar as faixas também no celular. */}
      <div className="grid grid-cols-5 gap-x-2 sm:gap-x-5">
        {bands.map((b) => (
          <div key={b.key} className="min-w-0">
            <div
              className="flex h-32 flex-col items-center justify-end border-b border-neutral-200"
              title={`${b.label} colaboradores: ${b.groups.length} grupos, ${money(b.revenue)} (${pct(b.share)} da receita com porte)`}
            >
              <span className="mb-1 text-sm font-semibold tabular-nums text-foreground sm:text-base">{pct(b.share)}</span>
              <div
                className="w-full max-w-16 rounded-t-(--radius-v2-sm) bg-chart-1"
                style={{ height: b.share > 0 ? Math.max(3, (b.share / maxShare) * BAR_MAX_PX) : 0 }}
              />
            </div>
            <p className="mt-2 text-center text-xs font-medium text-foreground sm:text-left sm:text-sm">
              {b.label}
              <span className="hidden font-normal text-muted-foreground lg:inline"> colaboradores</span>
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:mt-1 lg:grid-cols-5">
        {bands.map((b) => (
          <div key={b.key} className="min-w-0">
            <p className="text-sm font-medium text-foreground lg:hidden">{b.label} colaboradores</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {b.groups.length === 0
                ? "nenhum grupo"
                : `${b.groups.length} ${b.groups.length === 1 ? "grupo" : "grupos"} · ${money(b.revenue)}`}
            </p>
            {b.groups.length > 0 && <p className="text-xs text-muted-foreground">mediana de {money(b.ticket)}/mês</p>}
            {b.groups.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1">
                {b.groups.slice(0, LOGOS_PER_BAND).map((g) => (
                  <span key={g.grupo} title={`${groupName(g.grupo)} · ${money(g.revenue12m)} em 12 meses`}>
                    <CompanyLogo group={g} size="sm" />
                  </span>
                ))}
                {b.groups.length > LOGOS_PER_BAND && (
                  <span className="pl-1 text-xs tabular-nums text-muted-foreground">+{b.groups.length - LOGOS_PER_BAND}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted-foreground">
        {known.length} de {inScope.length} grupos têm porte pelo LinkedIn e somam{" "}
        {pct(knownRevenue / Math.max(1, inScope.reduce((acc, g) => acc + g.revenue12m, 0)))} da receita; as
        porcentagens são sobre essa receita.
        {individuals > 0 && ` ${individuals} ${individuals === 1 ? "é pessoa física" : "são pessoa física"}.`}
        {withoutRange > 0 &&
          ` ${withoutRange} ${withoutRange === 1 ? "grupo não tem" : "grupos não têm"} página no LinkedIn com a faixa de colaboradores.`}
      </p>
    </Panel>
  );
}

/**
 * Quem decide: sócios administradores da Receita, filtrados por faixa, e o cargo de quem
 * respondeu ao NPS (todas as respostas; o NPS não está ligado a um grupo no cálculo).
 */
export function DecisorPanel({ data }: { data: IcpData }) {
  const [scope, setScope] = useState<TierScope>("all");
  const inScope = groupsInScope(data, scope);
  const withAdmins = inScope.filter((g) => g.decisionMakers.length > 0).length;
  const withCompany = inScope.filter((g) => g.referenceCompany).length;
  const roleCounts = new Map<string, number>();
  for (const d of inScope.flatMap((g) => g.decisionMakers)) {
    const role = d.qualificacao ?? "Sem qualificação";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }
  const roles = [...roleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const { decisor } = data;

  return (
    <Panel
      icon={BadgeCheck}
      title="Decisor"
      description={`Quem administra as empresas dos ${inScope.length} grupos ${scopeText(data, scope)}`}
      info="Sócios com poder de administração no quadro de sócios (QSA) da Receita Federal. Mostra quem assina pela empresa; quem contrata o jurídico ainda precisa ser confirmado com os responsáveis."
      sources={[SRC.socios, SRC.npsCargo]}
    >
      <TierScopeTabs value={scope} onChange={setScope} />
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <div className="min-w-0">
          <p className="text-sm">
            <span className="text-2xl font-semibold tabular-nums text-foreground">{withAdmins}</span>
            <span className="text-muted-foreground">
              {" "}
              de {inScope.length} grupos têm sócio com poder de administração no quadro de sócios
            </span>
          </p>
          {roles.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-xs font-medium text-muted-foreground">
                Qualificação no quadro de sócios <span className="font-normal">· pessoas</span>
              </p>
              <div className="space-y-3">
                {roles.map(([label, count]) => (
                  <BarRow key={label} label={label} value={count} max={roles[0][1]} display={String(count)} />
                ))}
              </div>
            </>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            {inScope.length - withCompany > 0
              ? `${inScope.length - withCompany} grupos não têm empresa consultada na Receita (pessoa física ou sem CNPJ). `
              : ""}
            Os nomes estão no detalhe de cada grupo, na aba Clientes.
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Cargo de quem respondeu ao NPS <span className="font-normal">· todas as {decisor.responses} respostas</span>
          </p>
          <div className="space-y-3">
            {decisor.byRole.map((r) => (
              <BarRow
                key={r.label}
                label={r.label}
                value={r.count}
                max={decisor.byRole[0]?.count ?? 1}
                display={String(r.count)}
                barClassName={r.label === "Sócio ou proprietário" ? "bg-chart-1" : "bg-neutral-300"}
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Quem contrata e avalia é o dono
            {decisor.ownerAvg != null && ` (nota média ${decimal(decisor.ownerAvg)})`}. Diretoria e financeiro aparecem
            como interlocutores do dia a dia. As respostas do NPS ainda não são separadas por faixa.
          </p>
        </div>
      </div>
    </Panel>
  );
}
