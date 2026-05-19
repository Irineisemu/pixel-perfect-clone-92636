// @ts-nocheck
import { Icon } from "./Icon";
import { Utils } from "../lib/jr-utils";

function Kpi({ icon, label, value, hint }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 transition">
      <div className="flex items-center gap-2 text-zinc-500">
        <Icon name={icon} className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-3xl text-zinc-900 tabular-nums tracking-tight">{value}</span>
      </div>
      {hint && <div className="mt-1 text-[12px] text-zinc-500">{hint}</div>}
    </div>
  );
}

export function KpiRow({ stats }) {
  const hasProcesses = stats.totalProcessos > 0;
  
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi 
        icon="layers" 
        label="Processos"
        value={stats.totalMonitorado.toLocaleString("pt-BR")}
        hint={
          <div className="flex flex-col">
            <span>{stats.totalMonitorado === 1 ? "processo monitorado" : "processos monitorados"}</span>
            {stats.totalAlvos > 0 && (
              <span className="text-[10px] text-zinc-400">
                vinculados a {stats.totalAlvos} alvo{stats.totalAlvos !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        } 

      />
      <Kpi icon="activity" label="Novas mov. (24h)" value={stats.novas24h} hint="últimas 24 horas" />
      <Kpi icon="alert-octagon" label="Urgentes pendentes" value={stats.urgentes} hint="prazos < 48h ou intimações" />
      <Kpi icon="bell" label="Tribunais ativos"
        value={`${stats.tribunaisAtivos}/${stats.tribunaisTotal}`}
        hint={stats.tribunaisAtrasados ? `${stats.tribunaisAtrasados} atrasado(s)` : "—"} />
    </div>
  );
}
export default KpiRow;
