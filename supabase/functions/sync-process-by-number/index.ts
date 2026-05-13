// Edge Function: sync-process-by-number
// Busca um processo no DataJud por número CNJ e persiste dados + movimentações.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const DATAJUD_BASE_URL = "https://api-publica.datajud.cnj.jus.br";
const TJRJ_ALIAS = "api_publica_tjrj";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: { processNumber?: string; targetId?: string; isInitialSync?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const { processNumber, targetId, isInitialSync = false } = body;
  if (!processNumber) return jsonResponse(400, { error: "processNumber_required" });

  const apiKey = Deno.env.get("DATAJUD_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "datajud_key_missing",
      message: "Configure DATAJUD_API_KEY nos Secrets do Supabase.",
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const normalizedNumber = String(processNumber).replace(/\D/g, "");
  if (normalizedNumber.length < 15 || normalizedNumber.length > 25) {
    return jsonResponse(422, {
      error: "invalid_process_number",
      message: "Número de processo inválido. Use o formato CNJ.",
    });
  }

  console.log(`[sync] processNumber=${normalizedNumber} targetId=${targetId} initial=${isInitialSync}`);

  let datajudData: any;
  try {
    datajudData = await fetchFromDataJud(apiKey, normalizedNumber);
  } catch (err: any) {
    console.error("[sync] DataJud fetch failed:", err.message);
    await admin.from("processes").upsert(
      {
        process_number: normalizedNumber,
        tribunal_alias: TJRJ_ALIAS,
        sync_status: "failed",
        last_synced_at: new Date().toISOString(),
        last_source_used: "datajud",
      },
      { onConflict: "process_number" },
    );
    return jsonResponse(502, { error: "datajud_fetch_failed", message: err.message });
  }

  if (!datajudData) {
    await admin.from("processes").upsert(
      {
        process_number: normalizedNumber,
        tribunal_alias: TJRJ_ALIAS,
        sync_status: "not_found",
        last_synced_at: new Date().toISOString(),
        last_source_used: "datajud",
      },
      { onConflict: "process_number" },
    );
    return jsonResponse(404, {
      error: "process_not_found",
      message: `Processo ${processNumber} não encontrado no DataJud TJRJ.`,
    });
  }

  const processRow = await upsertProcess(admin, datajudData);
  console.log(`[sync] process upserted: ${processRow.id}`);

  if (targetId) {
    await admin.from("target_process_links").upsert(
      {
        target_id: targetId,
        process_id: processRow.id,
        matched_via: "process_number",
        matched_value: normalizedNumber,
        first_linked_at: new Date().toISOString(),
      },
      { onConflict: "target_id,process_id", ignoreDuplicates: true },
    );

    // Marcar discovery_status do target como completo
    await admin
      .from("monitoring_targets")
      .update({ discovery_status: "completed", last_discovery_at: new Date().toISOString() })
      .eq("id", targetId);
  }

  const movimentos = datajudData.movimentos || [];
  const { newCount, totalCount } = await upsertMovements(admin, processRow.id, movimentos, isInitialSync);
  console.log(`[sync] movements: ${totalCount} total, ${newCount} new`);

  const lastMovementAt =
    movimentos.length > 0
      ? movimentos
          .filter((m: any) => m.dataHora)
          .sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())[0]?.dataHora
      : null;

  await admin
    .from("processes")
    .update({
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
      total_movements: totalCount,
      new_movements_count: newCount,
      last_movement_at: lastMovementAt,
    })
    .eq("id", processRow.id);

  return jsonResponse(200, {
    processId: processRow.id,
    processNumber: normalizedNumber,
    syncStatus: "synced",
    totalMovements: totalCount,
    newMovements: newCount,
    isInitialSync,
    className: datajudData.classe?.nome,
    tribunal: "TJRJ",
  });
});

async function fetchFromDataJud(apiKey: string, normalizedNumber: string): Promise<any> {
  const res = await fetch(`${DATAJUD_BASE_URL}/${TJRJ_ALIAS}/_search`, {
    method: "POST",
    headers: {
      Authorization: `APIKey ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      size: 1,
      query: { match: { numeroProcesso: normalizedNumber } },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (res.status === 401 || res.status === 403) throw new Error(`DataJud auth error: ${res.status}`);
  if (!res.ok) throw new Error(`DataJud error: ${res.status}`);

  const data = await res.json();
  return data?.hits?.hits?.[0]?._source ?? null;
}

// DataJud TJRJ retorna alguns campos com U+FFFD (representado em JSON como "ï¿½")
// no lugar de caracteres acentuados. Aplicamos um dicionário de palavras
// conhecidas + title-case para devolver o texto legível ao usuário.
const ACCENT_FIXES: Record<string, string> = {
  "CMARA": "Câmara",
  "CVEL": "Cível",
  "FAMLIA": "Família",
  "FAZENDRIA": "Fazendária",
  "FAZENDRIO": "Fazendário",
  "INFNCIA": "Infância",
  "RFOS": "Órfãos",
  "RFO": "Órfão",
  "TRIBUTRIA": "Tributária",
  "TRIBUTRIO": "Tributário",
  "EMPRESARIAL": "Empresarial",
  "PBLICA": "Pública",
  "PBLICO": "Público",
  "AUDITORIA": "Auditoria",
  "PRESIDNCIA": "Presidência",
  "VICEPRESIDNCIA": "Vice-Presidência",
  "EXECUO": "Execução",
  "EXECUES": "Execuções",
  "REGIO": "Região",
  "REGIES": "Regiões",
  "DAS": "das",
  "DOS": "dos",
  "DA": "da",
  "DE": "de",
  "DO": "do",
  "E": "e",
};

function cleanDataJudText(input: any): any {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map(cleanDataJudText);
  if (typeof input !== "string") return input;

  // Remove a sequência mojibake "ï¿½" (3 chars) e o próprio U+FFFD
  let s = input.replace(/ï¿½/g, "").replace(/\uFFFD/g, "");
  // Colapsa espaços
  s = s.replace(/\s+/g, " ").trim();

  // Title-case por palavra, com dicionário de correções
  const titled = s
    .split(" ")
    .map((word) => {
      if (!word) return word;
      // Mantém ordinais "19", "1ª", "II" etc.
      if (/^\d+[ºªa-z]*$/i.test(word)) {
        return word.replace(/^(\d+)([ºªa])?$/i, (_, n, suf) => `${n}${suf ? "ª" : "ª"}`);
      }
      const upper = word.toUpperCase();
      if (ACCENT_FIXES[upper]) return ACCENT_FIXES[upper];
      // Title-case padrão
      return upper.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(" ");
  return titled;
}

function parseDataJudDate(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw);
  // ISO já formatado
  if (s.includes("-") || s.includes("T")) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // YYYYMMDDHHMMSS
  if (s.length >= 8 && /^\d+$/.test(s)) {
    const year = s.slice(0, 4);
    const month = s.slice(4, 6);
    const day = s.slice(6, 8);
    const hour = s.length >= 10 ? s.slice(8, 10) : "00";
    const min = s.length >= 12 ? s.slice(10, 12) : "00";
    const sec = s.length >= 14 ? s.slice(12, 14) : "00";
    return `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`;
  }
  return null;
}

async function upsertProcess(admin: any, source: any): Promise<{ id: string }> {
  const movimentos = source.movimentos || [];
  const movementsHash = await calculateHash(
    movimentos
      .map((m: any) => `${m.codigo}-${m.dataHora}`)
      .sort()
      .join("|"),
  );

  const { data, error } = await admin
    .from("processes")
    .upsert(
      {
        process_number: source.numeroProcesso,
        tribunal_alias: TJRJ_ALIAS,
        class_code: source.classe?.codigo ?? null,
        class_name: cleanDataJudText(source.classe?.nome) ?? null,
        subject_codes: (source.assuntos || []).map((a: any) => a.codigo).filter(Boolean),
        subject_names: cleanDataJudText((source.assuntos || []).map((a: any) => a.nome).filter(Boolean)),
        instance: source.grau === "G1" ? 1 : source.grau === "G2" ? 2 : 3,
        filed_at: parseDataJudDate(source.dataAjuizamento),
        organ_code: source.orgaoJulgador?.codigo ? String(source.orgaoJulgador.codigo) : null,
        organ_name: cleanDataJudText(source.orgaoJulgador?.nome) ?? null,
        municipality_ibge: source.orgaoJulgador?.codigoMunicipioIBGE ?? null,
        secrecy_level: source.nivelSigilo ?? 0,
        system_name: cleanDataJudText(source.sistema?.nome) ?? null,
        format_name: cleanDataJudText(source.formato?.nome) ?? null,
        last_update_at: parseDataJudDate(source.dataHoraUltimaAtualizacao),
        last_known_movements_hash: movementsHash,
        last_synced_at: new Date().toISOString(),
        last_source_used: "datajud",
        sync_status: "synced",
      },
      { onConflict: "process_number" },
    )
    .select("id")
    .single();

  if (error || !data) throw new Error(`Process upsert failed: ${error?.message}`);
  return data;
}

async function upsertMovements(
  admin: any,
  processId: string,
  movimentos: any[],
  isInitialSync: boolean,
): Promise<{ newCount: number; totalCount: number }> {
  if (movimentos.length === 0) return { newCount: 0, totalCount: 0 };

  let newCount = 0;
  for (const m of movimentos) {
    if (!m.dataHora || !m.nome) continue;

    const { error, data } = await admin
      .from("process_movements")
      .upsert(
        {
          process_id: processId,
          movement_code: m.codigo ?? null,
          movement_name: cleanDataJudText(m.nome),
          occurred_at: m.dataHora,
          organ_code: m.orgaoJulgador?.codigo ?? null,
          organ_name: cleanDataJudText(m.orgaoJulgador?.nome) ?? null,
          complements: m.complementosTabelados ?? null,
          raw_data: m,
          is_new: !isInitialSync,
        },
        { onConflict: "process_id,movement_code,occurred_at", ignoreDuplicates: true },
      )
      .select("id");

    if (!error && data && data.length > 0 && !isInitialSync) newCount++;
  }
  return { newCount, totalCount: movimentos.length };
}

async function calculateHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input || "empty");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
