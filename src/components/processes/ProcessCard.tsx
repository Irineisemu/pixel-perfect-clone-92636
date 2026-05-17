// @ts-nocheck
import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  Building2,
  FileText,
  AlertCircle,
  ExternalLink,
  Hash,
  Clock,
  Tag,
  History,
  RefreshCw,
} from "lucide-react";
import { Users } from "lucide-react";
import { ProcessMovementsTree } from "@/components/ProcessMovementsTree";

export interface ProcessCardProcess {
  id: string;
  processNumber: string;
  displayNumber: string;
  tribunal: string;
  classCode: number | null;
  className: string | null;
  subjects: Array<{ code: number; name: string | null }>;
  instance: number | null;
  instanceLabel: string | null;
  organCode: string | null;
  organName: string | null;
  filedAt: string | null;
  lastMovementAt: string | null;
  lastUpdateAt: string | null;
  lastSyncedAt: string | null;
  lastMovement: { name: string; occurredAt: string; organName: string | null } | null;
  secrecyLevel: number;
  secrecyLabel: string;
  systemName: string | null;
  formatName: string | null;
  totalMovements: number;
  newMovementsCount: number;
  syncStatus: string;
  target: { name: string };
}

interface ProcessCardProps {
  process: ProcessCardProcess;
  isSyncing: boolean;
  onSyncNow: (id: string) => void;
}

export function ProcessCard({ process: p, isSyncing, onSyncNow }: ProcessCardProps) {
  const [showSummary, setShowSummary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const hasNew = (p.newMovementsCount ?? 0) > 0;
  const notFound = p.syncStatus === "not_found";
  const failed = p.syncStatus === "failed";
  const pending = p.syncStatus === "pending";

  return (
    <div className={`p-4 ${hasNew ? "bg-rose-50/30" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-mono text-[13px] text-zinc-900 truncate">
              {p.displayNumber || p.processNumber}
            </div>
            {(() => {
              const url = portalUrl(p.tribunal, p.processNumber);
              return url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Abrir portal do ${p.tribunal} — pesquise por: ${p.processNumber}`}
                  className="flex-shrink-0 inline-flex items-center gap-0.5 text-[11px] text-sky-600 hover:text-sky-800 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Portal</span>
                </a>
              ) : null;
            })()}
          </div>
          <div className="mt-1 text-[12px] text-zinc-700">
            {p.target.name}
          </div>
          {p.className && (
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-700">
              <FileText className="h-3 w-3 text-zinc-400" />
              <span className="truncate">{p.className}</span>
            </div>
          )}
          {p.organName && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-zinc-600">
              <Building2 className="h-3 w-3 text-zinc-400" />
              <span className="truncate">{p.organName}</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-700 font-medium">
              {p.tribunal}
            </span>
            {p.instanceLabel && (
              <span className="px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-700">
                {p.instanceLabel}
              </span>
            )}
            {p.formatName && (
              <span className="px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-600">
                {p.formatName}
              </span>
            )}
            {p.secrecyLevel > 0 && (
              <span className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
                ⚠ {p.secrecyLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {hasNew && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-medium">
              {p.newMovementsCount} nova{p.newMovementsCount > 1 ? "s" : ""}
            </span>
          )}
          {!hasNew && p.syncStatus === "synced" && (
            <span className="text-[11px] text-emerald-700">✓ Em dia</span>
          )}
          {pending && !isSyncing && <span className="text-[11px] text-sky-700">Sincronizando…</span>}
          {notFound && <span className="text-[11px] text-amber-700">Não encontrado</span>}
          {failed && <span className="text-[11px] text-rose-700">Falha na sync</span>}

          <div className="flex items-center gap-1.5 mt-1">
            <button
              onClick={() => onSyncNow(p.id)}
              disabled={isSyncing}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-900 text-white text-[11.5px] font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Sincronizando…" : "Sincronizar"}
            </button>
          </div>
        </div>
      </div>

      {/* Action row: ver resumo / ver histórico */}
      <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-4 text-[12px]">
        <button
          onClick={() => setShowSummary((v) => !v)}
          aria-expanded={showSummary}
          className="inline-flex items-center gap-1 text-zinc-700 hover:text-zinc-900"
        >
          {showSummary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showSummary ? "Recolher resumo" : "Ver resumo completo"}
        </button>
        <button
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="inline-flex items-center gap-1 text-zinc-700 hover:text-zinc-900"
        >
          <History className="h-3.5 w-3.5" />
          {showHistory ? "Ocultar histórico" : "Ver histórico"}
        </button>
      </div>

      {/* Resumo expandido */}
      {showSummary && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 space-y-4">
          {notFound ? (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[12.5px] text-amber-900">
                <strong>Processo não encontrado no DataJud.</strong> Confira se o número está
                correto. Alguns processos podem estar em segredo de justiça ou ainda não terem sido
                sincronizados pelo TJRJ ao CNJ.
              </p>
            </div>
          ) : (
            <>
              {/* Datas e contagens */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {p.filedAt && (
                  <Field icon={<Calendar className="h-3 w-3" />} label="Ajuizado em" value={formatDateBR(p.filedAt)} />
                )}
                {p.lastMovementAt && (
                  <Field
                    icon={<Clock className="h-3 w-3" />}
                    label="Último movimento"
                    value={formatDateBR(p.lastMovementAt)}
                  />
                )}
                <Field
                  icon={<Hash className="h-3 w-3" />}
                  label="Total de movimentos"
                  value={String(p.totalMovements)}
                />
                {p.lastSyncedAt && (
                  <Field
                    icon={<RefreshCw className="h-3 w-3" />}
                    label="Última verificação"
                    value={formatRelativeBR(p.lastSyncedAt)}
                  />
                )}
              </div>

              {/* Movimento mais recente — destaque */}
              {p.lastMovement && (
                <div className="rounded-md border border-zinc-200 bg-white p-3">
                  <div className="text-[10.5px] uppercase tracking-wide text-zinc-500 font-medium">
                    Movimento mais recente
                  </div>
                  <div className="mt-1 text-[13px] font-medium text-zinc-900">
                    {p.lastMovement.name}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-zinc-600 flex flex-wrap items-center gap-1">
                    <span>{formatFullDateBR(p.lastMovement.occurredAt)}</span>
                    {p.lastMovement.organName && (
                      <>
                        <span>·</span>
                        <span>{p.lastMovement.organName}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Assuntos */}
              {p.subjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-zinc-500 font-medium mb-1.5">
                    <Tag className="h-3 w-3" />
                    Assunto{p.subjects.length > 1 ? "s" : ""}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.subjects.map((s, i) => (
                      <span
                        key={`${s.code}-${i}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full border border-zinc-200 bg-white text-[11px] text-zinc-700"
                      >
                        {s.name || `Código ${s.code}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sistema/Órgão */}
              {(p.systemName || p.organCode) && (
                <div className="grid grid-cols-2 gap-3">
                  {p.systemName && <Field label="Sistema" value={p.systemName} />}
                  {p.organCode && <Field label="Cód. órgão julgador" value={p.organCode} />}
                </div>
              )}

              {/* Partes / metadados TJRJ */}
              {(() => {
                const parties = (p as any).parties as
                  | {
                      blocked_reason?: string;
                      message?: string;
                      tjrj_metadata?: {
                        nomeComarca?: string;
                        descricaoServentia?: string;
                        dataAutuacao?: number;
                        isProcessoVirtual?: boolean;
                      };
                      autores?: Array<{ nome: string; qualificacao?: string | null; representantes?: Array<{ nome: string; oab?: string | null }> }>;
                      reus?: Array<{ nome: string; qualificacao?: string | null; representantes?: Array<{ nome: string; oab?: string | null }> }>;
                      outros?: Array<{ nome: string; qualificacao?: string | null; representantes?: Array<{ nome: string; oab?: string | null }> }>;
                    }
                  | null
                  | undefined;
                const total =
                  (parties?.autores?.length ?? 0) +
                  (parties?.reus?.length ?? 0) +
                  (parties?.outros?.length ?? 0);
                if (total > 0) {
                  return (
                    <div>
                      <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-zinc-500 font-medium mb-1.5">
                        <Users className="h-3 w-3" />
                        Partes envolvidas
                      </div>
                      <div className="space-y-2">
                        {parties?.autores && parties.autores.length > 0 && (
                          <PartyGroup label="Autor(es)" items={parties.autores} tone="emerald" />
                        )}
                        {parties?.reus && parties.reus.length > 0 && (
                          <PartyGroup label="Réu(s)" items={parties.reus} tone="rose" />
                        )}
                        {parties?.outros && parties.outros.length > 0 && (
                          <PartyGroup label="Outros" items={parties.outros} tone="zinc" />
                        )}
                      </div>
                    </div>
                  );
                }
                const meta = parties?.tjrj_metadata;
                const isPendingScrape = (parties as any)?.parties_status === "pending_scrape";
                return (
                  <div className="space-y-2">
                    {meta && (meta.nomeComarca || meta.descricaoServentia) && (
                      <div className="rounded-md border border-zinc-200 bg-white p-3 text-[12px] text-zinc-700 space-y-0.5">
                        <div className="text-[10.5px] uppercase tracking-wide text-zinc-500 font-medium mb-1">
                          Identificação no portal TJRJ
                        </div>
                        {meta.nomeComarca && <div><strong>Comarca:</strong> {meta.nomeComarca}</div>}
                        {meta.descricaoServentia && <div><strong>Serventia:</strong> {meta.descricaoServentia}</div>}
                        {typeof meta.isProcessoVirtual === "boolean" && (
                          <div><strong>Tipo:</strong> {meta.isProcessoVirtual ? "Eletrônico" : "Físico"}</div>
                        )}
                      </div>
                    )}
                    <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                      <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[12px] text-amber-900">
                        {isPendingScrape ? (
                          <>
                            <strong>Partes aguardando captura.</strong> O worker PJe TJRJ raspa
                            estes dados em segundo plano. Recarregue em alguns minutos.
                          </>
                        ) : (
                          <>
                            <strong>Partes não disponíveis automaticamente.</strong> O portal TJRJ
                            protege a lista de autores/réus/representantes com reCAPTCHA, e o
                            DataJud não devolve esses dados. Consulte direto no{" "}
                            <a
                              href="https://www3.tjrj.jus.br/consultaprocessual/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline font-medium inline-flex items-center gap-0.5"
                            >
                              portal do TJRJ
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            .
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* Histórico paginado */}
      {showHistory && <ProcessMovementsTree processId={p.id} />}
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-zinc-500 font-medium">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[12.5px] text-zinc-900 font-medium">{value}</div>
    </div>
  );
}

function PartyGroup({
  label,
  items,
  tone,
}: {
  label: string;
  items: Array<{ nome: string; qualificacao?: string | null; representantes?: Array<{ nome: string; oab?: string | null }> }>;
  tone: "emerald" | "rose" | "zinc";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/40"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50/40"
        : "border-zinc-200 bg-white";
  return (
    <div className={`rounded-md border ${toneClass} p-2.5`}>
      <div className="text-[10.5px] uppercase tracking-wide text-zinc-500 font-medium mb-1">
        {label}
      </div>
      <ul className="space-y-1.5">
        {items.map((party, i) => (
          <li key={`${party.nome}-${i}`} className="text-[12.5px] text-zinc-900">
            <div className="font-medium">{party.nome}</div>
            {party.qualificacao && (
              <div className="text-[11px] text-zinc-600">{party.qualificacao}</div>
            )}
            {party.representantes && party.representantes.length > 0 && (
              <ul className="mt-1 ml-3 space-y-0.5">
                {party.representantes.map((rep, j) => (
                  <li key={`${rep.nome}-${j}`} className="text-[11.5px] text-zinc-700">
                    <span className="text-zinc-400">↳ Adv.</span> {rep.nome}
                    {rep.oab && <span className="text-zinc-500"> (OAB {rep.oab})</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function portalUrl(tribunal: string, processNumber: string): string | null {
  const num = processNumber?.trim();
  if (!num) return null;
  const t = tribunal?.toUpperCase();
  if (t === "TJRJ") {
    return `https://www3.tjrj.jus.br/consultaprocessual/`;
  }
  if (t === "TJSP") {
    return `https://esaj.tjsp.jus.br/cpopg/show.do?processo.codigo=&processo.foro=&processo.numero=${encodeURIComponent(num)}`;
  }
  if (t === "TJMG") {
    return `https://www4.tjmg.jus.br/juridico/sf/proc_resultado2.jsp?listaProcessos=${encodeURIComponent(num)}`;
  }
  if (t === "TJRS") {
    return `https://www.tjrs.jus.br/site_php/consulta/consulta_processo.php?q_nro_processo=${encodeURIComponent(num)}`;
  }
  if (t === "TJPR") {
    return `https://consulta.tjpr.jus.br/projudi_consulta/processo.do?_tj=PR&numero=${encodeURIComponent(num)}`;
  }
  if (t === "TJBA") {
    return `https://esaj.tjba.jus.br/cpopg/show.do?processo.numero=${encodeURIComponent(num)}`;
  }
  if (t === "TJPE") {
    return `https://srv01.tjpe.jus.br/consultaprocessualexterna/processo/${encodeURIComponent(num)}`;
  }
  if (t === "TJSC") {
    return `https://esaj.tjsc.jus.br/cpopg/show.do?processo.numero=${encodeURIComponent(num)}`;
  }
  // Fallback: portal CNJ DataJud
  return `https://www.cnj.jus.br/pjecnj/ConsultaPublica/listView.seam?numeroProcesso=${encodeURIComponent(num)}`;
}

function formatDateBR(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatFullDateBR(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatRelativeBR(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  if (diffHour < 24) return `há ${diffHour}h`;
  if (diffDay < 7) return `há ${diffDay}d`;
  return formatDateBR(iso);
}
