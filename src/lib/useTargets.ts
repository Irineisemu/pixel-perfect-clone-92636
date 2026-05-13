// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from "react";


import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

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

// ---------- Supabase row <-> UI shape ----------
function rowToUi(r: any) {
  return {
    id: r.id,
    type: r.type,
    active: r.is_active,
    createdAt: new Date(r.created_at).getTime(),
    full_name: r.full_name || "",
    oab: r.oab || "",
    qualification: r.qualification || "Outro",
    aliases: r.aliases || [],
    process_number: r.process_number || "",
    tribunal_alias: r.tribunal_alias || "",
    nickname: r.nickname || "",
    tribunal_aliases: r.tribunal_aliases || [],
    class_codes: r.class_codes || [],
    keywords: r.keywords || [],
    against_state_only: !!r.against_state_only,
    cpf: "", // never returned from db
    notes: "", // not persisted
    stats30d: 0,
    sparkline: [0, 0, 0, 0, 0, 0, 0],
  };
}

function uiToRow(t: any, userId: string) {
  const base: any = {
    user_id: userId,
    type: t.type,
    is_active: t.active !== false,
  };
  if (t.type === "person") {
    base.full_name = t.full_name || null;
    base.oab = t.oab || null;
    base.qualification = t.qualification || null;
    base.aliases = t.aliases || [];
  } else if (t.type === "process") {
    base.process_number = t.process_number || null;
    base.tribunal_alias = t.tribunal_alias || null;
    base.nickname = t.nickname || null;
  } else if (t.type === "radar") {
    base.tribunal_aliases = t.tribunal_aliases || [];
    base.class_codes = t.class_codes || [];
    base.keywords = t.keywords || [];
    base.against_state_only = !!t.against_state_only;
  }
  return base;
}

async function apiTest(_payload) {
  // Test de critérios desativado: não há dados sintéticos no banco.
  // A simulação contra DataJud deve ser feita após a criação do alvo.
  await new Promise((r) => setTimeout(r, 200));
  return { count: 0, samples: [] };
}

export function useTargets() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("monitoring_targets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[useTargets] load", error);
      setItems([]);
    } else {
      setItems((data || []).map(rowToUi));
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (payload) => {
    if (!user) throw new Error("Não autenticado");
    const row = uiToRow(payload, user.id);
    const { data, error } = await supabase
      .from("monitoring_targets")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    const ui = rowToUi(data);
    setItems((s) => [ui, ...s]);
    return ui;
  }, [user?.id]);

  const update = useCallback(async (id, patch) => {
    if (!user) throw new Error("Não autenticado");
    const { data: cur } = await supabase.from("monitoring_targets").select("*").eq("id", id).single();
    if (!cur) throw new Error("Alvo não encontrado");
    const merged = { ...rowToUi(cur), ...patch };
    const row = uiToRow(merged, user.id);
    if ("active" in patch) row.is_active = patch.active;
    const { data, error } = await supabase
      .from("monitoring_targets")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    const ui = rowToUi(data);
    setItems((s) => s.map((t) => (t.id === id ? ui : t)));
    return ui;
  }, [user?.id]);

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from("monitoring_targets").delete().eq("id", id);
    if (error) throw error;
    setItems((s) => s.filter((t) => t.id !== id));
    return true;
  }, []);

  const toggle = useCallback(async (id) => {
    const cur = items.find((t) => t.id === id);
    if (!cur) return null;
    return update(id, { active: !cur.active });
  }, [items, update]);

  const duplicate = useCallback(async (id) => {
    const cur = items.find((t) => t.id === id);
    if (!cur) return null;
    const { id: _i, createdAt: _c, stats30d: _s, sparkline: _sp, ...rest } = cur;
    return create({
      ...rest,
      active: true,
      nickname: rest.nickname ? rest.nickname + " (cópia)" : undefined,
      full_name: rest.full_name ? rest.full_name + " (cópia)" : undefined,
    });
  }, [items, create]);

  const get = useCallback((id) => items.find((t) => t.id === id) || null, [items]);

  const counters = useMemo(() => ({
    total: items.length,
    active: items.filter((t) => t.active).length,
    person: items.filter((t) => t.type === "person").length,
    process: items.filter((t) => t.type === "process").length,
    radar: items.filter((t) => t.type === "radar").length,
    radarActive: items.filter((t) => t.type === "radar" && t.active).length,
  }), [items]);

  return { items, loading, counters, create, update, remove, toggle, duplicate, get, testCriteria: apiTest, refresh };
}

export const RADAR_LIMIT = 5;
export const CLASS_CODES = ["Recurso em MS", "Liquidação de Sentença", "Ações de Cobrança contra o Estado"];
export const QUALIFICATIONS = ["Professor", "Servidor Público", "Outro"];
export const typeMeta = {
  person:  { label: "Pessoa",   icon: "user",      emoji: "👤", chip: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  process: { label: "Processo", icon: "file-text", emoji: "📄", chip: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  radar:   { label: "Radar",    icon: "radio",     emoji: "📡", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  lawyer:  { label: "Advogado", icon: "users",     emoji: "⚖️", chip: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500" },
};

export const TargetsAPI = {
  useTargets, validateCNJNumber, validateCPF, maskCPF, maskCNJ, maskOAB, detectTribunalAlias,
  RADAR_LIMIT, CLASS_CODES, QUALIFICATIONS, typeMeta,
};
export default TargetsAPI;
