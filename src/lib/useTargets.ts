// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from "react";
import { Mock } from "../data/mock";
import { Utils, NOW, isProfessor } from "./jr-utils";

const STORAGE_KEY = "jusradar.targets.v1";

export function validateCNJNumber(formatted) {
  const clean = String(formatted || "").replace(/\D/g, "");
  if (clean.length !== 20) return false;
  const sequencial = clean.slice(0, 7);
  const dv = clean.slice(7, 9);
  const ano = clean.slice(9, 13);
  const orgao = clean.slice(13, 14);
  const tribunal = clean.slice(14, 16);
  const origem = clean.slice(16, 20);
  const numero = sequencial + ano + orgao + tribunal + origem;
  let resto = 0;
  for (const digit of numero) resto = (resto * 10 + parseInt(digit, 10)) % 97;
  resto = (resto * 100) % 97;
  const dvCalc = String(98 - resto).padStart(2, "0");
  return dv === dvCalc;
}

export function validateCPF(formatted) {
  const c = String(formatted || "").replace(/\D/g, "");
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i], 10) * (10 - i);
  let d1 = 11 - (s % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(c[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i], 10) * (11 - i);
  let d2 = 11 - (s % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(c[10], 10);
}

export function maskCPF(v) {
  const c = String(v || "").replace(/\D/g, "").slice(0, 11);
  return c
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function maskCNJ(v) {
  const c = String(v || "").replace(/\D/g, "").slice(0, 20);
  if (c.length <= 7) return c;
  if (c.length <= 9) return `${c.slice(0, 7)}-${c.slice(7)}`;
  if (c.length <= 13) return `${c.slice(0, 7)}-${c.slice(7, 9)}.${c.slice(9)}`;
  if (c.length <= 14) return `${c.slice(0, 7)}-${c.slice(7, 9)}.${c.slice(9, 13)}.${c.slice(13)}`;
  if (c.length <= 16) return `${c.slice(0, 7)}-${c.slice(7, 9)}.${c.slice(9, 13)}.${c.slice(13, 14)}.${c.slice(14)}`;
  return `${c.slice(0, 7)}-${c.slice(7, 9)}.${c.slice(9, 13)}.${c.slice(13, 14)}.${c.slice(14, 16)}.${c.slice(16, 20)}`;
}

export function maskOAB(v) {
  const s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const uf = s.slice(0, 2).replace(/[^A-Z]/g, "");
  const num = s.slice(uf.length).replace(/[^0-9]/g, "").slice(0, 6);
  return uf + num;
}

export function detectTribunalAlias(cnj) {
  const c = String(cnj || "").replace(/\D/g, "");
  if (c.length < 16) return "";
  const J = c[13];
  const TR = c.slice(14, 16);
  const map: any = {
    "8": { "26": "TJSP", "19": "TJRJ", "13": "TJMG", "16": "TJPR", "05": "TJBA", "21": "TJGO" },
    "4": { "03": "TRF3" },
    "5": { "02": "TRT2" },
    "3": { "00": "STJ" },
  };
  return (map[J] && map[J][TR]) || "";
}

const SEED: any[] = [
  { id: "t1", type: "person", active: true, createdAt: Date.now() - 1000*60*60*24*12,
    full_name: "Maria Clara Andrade", cpf: "", oab: "", qualification: "Professor",
    aliases: ["Maria C. Andrade"], notes: "Cliente — magistério estadual",
    stats30d: 18, sparkline: [2,3,1,4,2,1,5] },
  { id: "t2", type: "process", active: true, createdAt: Date.now() - 1000*60*60*24*30,
    process_number: "1003421-55.2024.8.26.0100", tribunal_alias: "TJSP", nickname: "Andrade — reintegração",
    stats30d: 9, sparkline: [0,1,0,2,1,3,2] },
  { id: "t3", type: "radar", active: true, createdAt: Date.now() - 1000*60*60*24*45,
    tribunal_aliases: ["TJSP","TJRJ","TJMG"], class_codes: ["Recurso em MS","Ações de Cobrança contra o Estado"],
    keywords: ["professor","magistério"], against_state_only: true,
    stats30d: 142, sparkline: [12,18,9,22,15,28,38] },
  { id: "t4", type: "radar", active: false, createdAt: Date.now() - 1000*60*60*24*60,
    tribunal_aliases: ["TRF3"], class_codes: ["Liquidação de Sentença"],
    keywords: ["quintos","incorporação"], against_state_only: true,
    stats30d: 23, sparkline: [3,2,4,5,3,4,2] },
  { id: "t5", type: "person", active: true, createdAt: Date.now() - 1000*60*60*24*5,
    full_name: "João Batista Ferreira", cpf: "", oab: "SP145220", qualification: "Servidor Público",
    aliases: [], notes: "", stats30d: 6, sparkline: [0,1,2,0,1,1,1] },
];

let _state: any[] | null = null;
const _subs = new Set<(s: any[]) => void>();

function load(): any[] {
  if (_state) return _state;
  if (typeof window === "undefined") return (_state = SEED.slice());
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) { _state = JSON.parse(raw); return _state!; }
  } catch {}
  _state = SEED.slice();
  save();
  return _state;
}
function save() {
  if (typeof window === "undefined" || !_state) return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch {}
  _subs.forEach((fn) => fn(_state!));
}
function subscribe(fn) { _subs.add(fn); return () => { _subs.delete(fn); }; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet() { await sleep(120); return load().slice(); }
async function apiCreate(t) {
  await sleep(180);
  const item = { ...t, id: "t" + Math.random().toString(36).slice(2, 8), createdAt: Date.now(), active: true, stats30d: 0, sparkline: [0,0,0,0,0,0,0] };
  _state = [item, ...load()];
  save();
  return item;
}
async function apiUpdate(id, patch) {
  await sleep(150);
  _state = load().map((t) => (t.id === id ? { ...t, ...patch } : t));
  save();
  return _state!.find((t) => t.id === id);
}
async function apiRemove(id) {
  await sleep(150);
  _state = load().filter((t) => t.id !== id);
  save();
  return true;
}
async function apiTest(payload) {
  await sleep(700);
  const mov = Mock.movimentacoes || [];
  const sevenDaysAgo = NOW - 7 * 86400e3;
  let pool = mov.filter((m) => new Date(m.publicadoEm).getTime() >= sevenDaysAgo);
  if (payload.type === "person") {
    const needle = (payload.full_name || "").toLowerCase();
    const aliases = (payload.aliases || []).map((a) => a.toLowerCase());
    pool = pool.filter((m) => {
      const p = m.parte.toLowerCase();
      if (needle && p.includes(needle)) return true;
      return aliases.some((a) => a && p.includes(a));
    });
    if (payload.qualification === "Professor") {
      pool = pool.filter((m) => isProfessor(m.parteQualificacao));
    }
  } else if (payload.type === "radar") {
    if (payload.against_state_only) pool = pool.filter((m) => m.contraEstado);
    if (payload.tribunal_aliases?.length) pool = pool.filter((m) => payload.tribunal_aliases.includes(m.tribunal));
    const kws = (payload.keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
    if (kws.length) {
      pool = pool.filter((m) => {
        const blob = (m.parteQualificacao + " " + m.resumo + " " + m.detalhe).toLowerCase();
        return kws.some((k) => blob.includes(k));
      });
    }
  }
  return { count: pool.length, samples: pool.slice(0, 5) };
}

export function useTargets() {
  const [items, setItems] = useState<any[]>(() => load());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const off = subscribe((s) => setItems(s.slice()));
    setLoading(true);
    apiGet().then((r) => { setItems(r); setLoading(false); });
    return () => { off(); };
  }, []);

  const create = useCallback(async (payload) => apiCreate(payload), []);
  const update = useCallback(async (id, patch) => apiUpdate(id, patch), []);
  const remove = useCallback(async (id) => apiRemove(id), []);
  const toggle = useCallback(async (id) => {
    const cur = load().find((t) => t.id === id);
    return apiUpdate(id, { active: !cur?.active });
  }, []);
  const duplicate = useCallback(async (id) => {
    const cur = load().find((t) => t.id === id);
    if (!cur) return null;
    const { id: _id, createdAt: _c, stats30d: _s, sparkline: _sp, ...rest } = cur;
    return apiCreate({ ...rest,
      nickname: rest.nickname ? rest.nickname + " (cópia)" : undefined,
      full_name: rest.full_name ? rest.full_name + " (cópia)" : undefined });
  }, []);
  const get = useCallback((id) => load().find((t) => t.id === id) || null, []);

  const counters = useMemo(() => ({
    total: items.length,
    active: items.filter((t) => t.active).length,
    person: items.filter((t) => t.type === "person").length,
    process: items.filter((t) => t.type === "process").length,
    radar: items.filter((t) => t.type === "radar").length,
    radarActive: items.filter((t) => t.type === "radar" && t.active).length,
  }), [items]);

  return { items, loading, counters, create, update, remove, toggle, duplicate, get, testCriteria: apiTest };
}

export const RADAR_LIMIT = 5;
export const CLASS_CODES = ["Recurso em MS", "Liquidação de Sentença", "Ações de Cobrança contra o Estado"];
export const QUALIFICATIONS = ["Professor", "Servidor Público", "Outro"];
export const typeMeta = {
  person:  { label: "Pessoa",   icon: "user",      emoji: "👤", chip: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  process: { label: "Processo", icon: "file-text", emoji: "📄", chip: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  radar:   { label: "Radar",    icon: "radio",     emoji: "📡", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

export const TargetsAPI = {
  useTargets, validateCNJNumber, validateCPF, maskCPF, maskCNJ, maskOAB, detectTribunalAlias,
  RADAR_LIMIT, CLASS_CODES, QUALIFICATIONS, typeMeta,
};
export default TargetsAPI;
