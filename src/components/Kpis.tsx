// @ts-nocheck
import { Icon } from "./Icon";
import { Utils } from "../lib/jr-utils";

function Sparkline({ data, color = "currentColor" }) {
  const w = 60, h = 18;
  const max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="text-zinc-300" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

function Kpi({ icon, label, value, hint, trend, sparkColor = "rgb(113 113 122)", spark }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 transition">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-zinc-500">
          <Icon name={icon} className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        </div>
        {spark && <Sparkline data={spark} color={sparkColor} />}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-3xl text-zinc-900 tabular-nums tracking-tight">{value}</span>
        {trend && (
          <span className={Utils.cx(
            "inline-flex items-center gap-0.5 text-[11px] font-medium",
            trend.dir === "up" ? "text-emerald-600" : trend.dir === "down" ? "text-red-600" : "text-zinc-500"
          )}>
            {trend.dir === "up" ? <Icon name="trending-up" className="h-3 w-3" /> :
             trend.dir === "down" ? <Icon name="trending-down" className="h-3 w-3" /> : null}
            {trend.label}
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-[12px] text-zinc-500">{hint}</div>}
    </div>
  );
}

export function KpiRow({ stats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi icon="layers" label="Total monitorado"
        value={stats.totalMonitorado.toLocaleString("pt-BR")} hint="processos ativos"
        trend={{ dir: "up", label: "+12 esta semana" }}
        spark={[40,42,41,44,46,48,50,49,52,55,57,58]} />
      <Kpi icon="activity" label="Novas mov. (24h)"
        value={stats.novas24h} hint="desde ontem às 14:32"
        trend={{ dir: "up", label: "+18%" }} sparkColor="rgb(59 130 246)"
        spark={[3,5,4,7,8,6,9,11,9,12,14,17]} />
      <Kpi icon="alert-octagon" label="Urgentes pendentes"
        value={stats.urgentes} hint="prazos < 48h ou intimações"
        trend={{ dir: "up", label: "+2 hoje" }} sparkColor="rgb(239 68 68)"
        spark={[1,1,2,1,2,3,2,3,4,3,4,4]} />
      <Kpi icon="bell" label="Tribunais ativos"
        value={`${stats.tribunaisAtivos}/${stats.tribunaisTotal}`}
        hint={stats.tribunaisAtrasados ? `${stats.tribunaisAtrasados} atrasado(s)` : "Todos sincronizados"}
        trend={{ dir: stats.tribunaisAtrasados ? "down" : "flat", label: stats.tribunaisAtrasados ? "atenção" : "ok" }} />
    </div>
  );
}
export default KpiRow;
