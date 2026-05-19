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
  isUrgent: boolean;
}

interface ProcessCardProps {
  process: ProcessCardProcess;
  isSyncing: boolean;
  onSyncNow: (id: string) => void;
  isHighlighted?: boolean;
}

export function ProcessCard({ process: p, isSyncing, onSyncNow, isHighlighted }: ProcessCardProps) {
  const [showSummary, setShowSummary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const lastMovementDate = p.lastMovementAt ? new Date(p.lastMovementAt) : null;
  const isRecent = lastMovementDate && (Date.now() - lastMovementDate.getTime()) < 24 * 60 * 60 * 1000;
  const hasNew = isRecent;
  const notFound = p.syncStatus === "not_found";
  const failed = p.syncStatus === "failed";
  const pending = p.syncStatus === "pending";

  return (
    <div className={`p-5 transition-all duration-500 ${isHighlighted ? "bg-amber-50 ring-2 ring-amber-400 ring-inset shadow-md" : hasNew ? "bg-rose-50/30" : ""}`}>
      {/* Header — meta tags em cima, número grande, classe/órgão como subtítulo */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{p.tribunal}</span>
            {p.instanceLabel && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{p.instanceLabel}</span>
            )}
            {p.formatName && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{p.formatName}</span>
            )}
            {p.secrecyLevel > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                ⚠ {p.secrecyLabel}
              </span>
            )}
            {p.isUrgent && (
              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 animate-pulse">
                🚨 URGENTE
              </span>
            )}
          </div>

          <div className="mt-1.5 font-mono text-[14px] font-semibold text-zinc-900 truncate flex items-center gap-2">
            <span className="truncate">{p.displayNumber || p.processNumber}</span>
            {getPortalUrl(p.tribunal, p.processNumber) && (
              <a
                href={getPortalUrl(p.tribunal, p.processNumber)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[11px] text-sky-600 hover:underline font-sans font-normal flex-shrink-0"
              >
                <ExternalLink className="h-3 w-3" />
                Portal
              </a>
            )}
          </div>

          <div className="mt-1 text-[12.5px] text-zinc-700 truncate">
            {[p.className, p.organName].filter(Boolean).join(" · ")}
            {!p.className && !p.organName && p.target.name}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {hasNew ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-semibold animate-pulse">
              Novo
            </span>
          ) : p.syncStatus === "synced" ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Em dia
            </span>
          ) : pending && !isSyncing ? (
            <span className="text-[11px] text-sky-700">Sincronizando…</span>
          ) : notFound ? (
            <span className="text-[11px] text-amber-700">Não encontrado</span>
          ) : failed ? (
            <span className="text-[11px] text-rose-700">Falha na sync</span>
          ) : null}

          <button
            onClick={() => onSyncNow(p.id)}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 text-white text-[11.5px] font-medium hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>

      {/* Última movimentação — sempre visível (visão rápida da lista) */}
      {p.lastMovement && !notFound && (
        <div className={`mt-3 rounded-lg border-l-2 ${hasNew ? "border-rose-400 bg-rose-50/40" : "border-sky-300 bg-sky-50/40"} px-3 py-2`}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600 flex items-center gap-1.5">
                <span>Última movimentação</span>
                <span className="text-zinc-300 font-normal select-none">•</span>
                <span className="text-zinc-600 font-semibold normal-case">{formatDateBR(p.lastMovement.occurredAt)}</span>
              </div>
              <div className="mt-0.5 text-[13px] font-semibold text-zinc-900 truncate">
                {p.lastMovement.name}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats inline compacto */}
      {!notFound && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-zinc-600">
          {p.filedAt && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3 text-zinc-400" />
              Ajuizado em <strong className="text-zinc-800 font-medium">{formatDateBR(p.filedAt)}</strong>
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Hash className="h-3 w-3 text-zinc-400" />
            <strong className="text-zinc-800 font-medium">{p.totalMovements}</strong> movimento{p.totalMovements !== 1 ? "s" : ""}
          </span>
          {p.lastSyncedAt && (
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="h-3 w-3 text-zinc-400" />
              Verificado <strong className="text-zinc-800 font-medium">{formatRelativeBR(p.lastSyncedAt)}</strong>
            </span>
          )}
        </div>
      )}

      {/* Action row: ver resumo / ver histórico */}
      <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-wrap items-center gap-2 text-[12px]">
        <button
          onClick={() => setShowSummary((v) => !v)}
          aria-expanded={showSummary}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all font-medium ${
            showSummary 
              ? "bg-sky-100 border-sky-200 text-sky-800 shadow-sm" 
              : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-900"
          }`}
        >
          {showSummary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showSummary ? "Recolher resumo" : "Ver resumo completo"}
        </button>
        <button
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all font-medium ${
            showHistory 
              ? "bg-sky-100 border-sky-200 text-sky-800 shadow-sm" 
              : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-900"
          }`}
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
              {/* Detalhes do movimento mais recente (data por extenso + órgão) */}
              {p.lastMovement && (
                <div className="text-[12px] text-zinc-600">
                  <span className="text-zinc-500">Último movimento:</span>{" "}
                  <span className="font-medium text-zinc-800">
                    {formatFullDateBR(p.lastMovement.occurredAt)}
                  </span>
                  {p.lastMovement.organName && (
                    <span className="text-zinc-500"> · {p.lastMovement.organName}</span>
                  )}
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

function getPortalUrl(tribunal: string, processNumber: string): string | null {
  const cnj = (processNumber || "").replace(/\D/g, "");
  if (!cnj) return null;
  const t = (tribunal || "").toUpperCase();
  switch (t) {
    case "TJRJ":
      return `https://www3.tjrj.jus.br/consultaprocessual/#/consultaprocesso?numProcesso=${cnj}`;
    default:
      return null;
  }
}
