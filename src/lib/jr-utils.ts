// @ts-nocheck
// JusRadar shared helpers.

export const URGENCIA = {
  critico: { label: "Crítico", dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200", bar: "bg-red-500", text: "text-red-700", ring: "ring-red-200" },
  alto:    { label: "Alto", dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border-orange-200", bar: "bg-orange-500", text: "text-orange-700", ring: "ring-orange-200" },
  medio:   { label: "Médio", dot: "bg-amber-400", badge: "bg-amber-50 text-amber-700 border-amber-200", bar: "bg-amber-400", text: "text-amber-700", ring: "ring-amber-200" },
  info:    { label: "Informativo", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200", bar: "bg-blue-500", text: "text-blue-700", ring: "ring-blue-200" },
};

export const NOW = new Date("2026-05-09T14:32:00-03:00").getTime();

export function tempoRelativo(iso) {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, NOW - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `há ${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function dataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const PROFESSOR_RE = /(?:^|[^a-zà-úA-ZÀ-Ú])(professor|professora|professores|professoras|docente|docentes|magistério|magisterio)(?:[^a-zà-úA-ZÀ-Ú]|$)/i;

export function isProfessor(qualificacao) {
  if (!qualificacao) return false;
  return PROFESSOR_RE.test(qualificacao);
}

export function cx(...args) {
  return args.filter(Boolean).join(" ");
}

export const Utils = { URGENCIA, tempoRelativo, dataHora, isProfessor, cx, NOW };
export default Utils;
