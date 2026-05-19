// @ts-nocheck
import { Icon } from "./Icon";
import { Utils } from "../lib/jr-utils";

function Kpi({ icon, label, value, hint, isUrgent }) {
  return (
    <div className={`rounded-lg border bg-white p-4 transition shadow-sm ${
      isUrgent && value > 0 
        ? "border-rose-200 bg-rose-50/30 hover:border-rose-300" 
        : "border-zinc-200 hover:border-zinc-300"
    }`}>
      <div className="flex items-center gap-2 text-zinc-500">
        <Icon name={icon} className={`h-3.5 w-3.5 ${isUrgent && value > 0 ? "text-rose-500" : ""}`} />
        <span className={`text-[11px] font-medium uppercase tracking-wide ${isUrgent && value > 0 ? "text-rose-700" : ""}`}>{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`font-display text-3xl tabular-nums tracking-tight ${
          isUrgent && value > 0 ? "text-rose-600 font-bold" : "text-zinc-900"
        }`}>
          {value}
        </span>
      </div>
      {hint && <div className={`mt-1 text-[12px] ${isUrgent && value > 0 ? "text-rose-500" : "text-zinc-500"}`}>{hint}</div>}
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
                via {stats.totalAlvos} fonte{stats.totalAlvos !== 1 ? 's' : ''} de busca
              </span>
            )}
          </div>
        } 

      />
      <Kpi icon="activity" label="Novas mov. (24h)" value={stats.novas24h} hint="últimas 24 horas" />
      <Kpi icon="alert-octagon" label="Urgentes pendentes" value={stats.urgentes} hint="prazos < 48h ou intimações" isUrgent />
      <Kpi icon="bell" label="Tribunais ativos"
        value={`${stats.tribunaisAtivos}/${stats.tribunaisTotal}`}
        hint={stats.tribunaisAtrasados ? `${stats.tribunaisAtrasados} atrasado(s)` : "—"} />
    </div>
  );
}
export default KpiRow;
