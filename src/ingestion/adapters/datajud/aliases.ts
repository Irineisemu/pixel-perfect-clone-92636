/**
 * Mapa de aliases DataJud por tribunal.
 * Source: API Pública DataJud / CNJ (2024).
 */
export const DATAJUD_ALIASES: Record<string, string> = {
  // Tribunais Superiores
  STF: "api_publica_stf",
  STJ: "api_publica_stj",
  TST: "api_publica_tst",
  TSE: "api_publica_tse",
  STM: "api_publica_stm",

  // Justiça Federal — TRFs
  TRF1: "api_publica_trf1",
  TRF2: "api_publica_trf2",
  TRF3: "api_publica_trf3",
  TRF4: "api_publica_trf4",
  TRF5: "api_publica_trf5",
  TRF6: "api_publica_trf6",

  // Justiça Estadual (TJs)
  TJSP: "api_publica_tjsp",
  TJRJ: "api_publica_tjrj",
  TJMG: "api_publica_tjmg",
  TJRS: "api_publica_tjrs",
  TJPR: "api_publica_tjpr",
  TJSC: "api_publica_tjsc",
  TJBA: "api_publica_tjba",
  TJDF: "api_publica_tjdft",
  TJGO: "api_publica_tjgo",
  TJES: "api_publica_tjes",
  TJPE: "api_publica_tjpe",
  TJCE: "api_publica_tjce",
  TJMT: "api_publica_tjmt",
  TJMS: "api_publica_tjms",
  TJPA: "api_publica_tjpa",
  TJMA: "api_publica_tjma",
  TJPB: "api_publica_tjpb",
  TJRN: "api_publica_tjrn",
  TJAL: "api_publica_tjal",
  TJSE: "api_publica_tjse",
  TJPI: "api_publica_tjpi",
  TJTO: "api_publica_tjto",
  TJRO: "api_publica_tjro",
  TJAC: "api_publica_tjac",
  TJAM: "api_publica_tjam",
  TJRR: "api_publica_tjrr",
  TJAP: "api_publica_tjap",

  // Justiça do Trabalho — TRTs
  TRT1: "api_publica_trt1",
  TRT2: "api_publica_trt2",
  TRT3: "api_publica_trt3",
  TRT4: "api_publica_trt4",
  TRT5: "api_publica_trt5",
  TRT6: "api_publica_trt6",
  TRT7: "api_publica_trt7",
  TRT8: "api_publica_trt8",
  TRT9: "api_publica_trt9",
  TRT10: "api_publica_trt10",
  TRT11: "api_publica_trt11",
  TRT12: "api_publica_trt12",
  TRT13: "api_publica_trt13",
  TRT14: "api_publica_trt14",
  TRT15: "api_publica_trt15",
  TRT16: "api_publica_trt16",
  TRT17: "api_publica_trt17",
  TRT18: "api_publica_trt18",
  TRT19: "api_publica_trt19",
  TRT20: "api_publica_trt20",
  TRT21: "api_publica_trt21",
  TRT22: "api_publica_trt22",
  TRT23: "api_publica_trt23",
  TRT24: "api_publica_trt24",

  // Justiça Eleitoral
  TREAC: "api_publica_treac",
  TREAL: "api_publica_treal",
  TREAM: "api_publica_treamc",
  TREAP: "api_publica_treap",
  TREBA: "api_publica_treba",
  TRECE: "api_publica_trece",
  TREDFT: "api_publica_tredft",
  TREES: "api_publica_treesc",
  TREGO: "api_publica_trego",
  TREMA: "api_publica_trema",
  TREMG: "api_publica_tremg",
  TREMS: "api_publica_trems",
  TREMT: "api_publica_tremt",
  TREPA: "api_publica_trepa",
  TREPB: "api_publica_trepb",
  TREPE: "api_publica_trepe",
  TREPI: "api_publica_trepi",
  TREPR: "api_publica_trepr",
  TRERJ: "api_publica_trerj",
  TRERN: "api_publica_trern",
  TRERO: "api_publica_trero",
  TRERR: "api_publica_trerr",
  TRERS: "api_publica_trers",
  TRESC: "api_publica_tresc",
  TRESE: "api_publica_trese",
  TRESP: "api_publica_tresp",
  TRETO: "api_publica_treto",

  // Militares estaduais
  TJMSP: "api_publica_tjmsp",
  TJMMG: "api_publica_tjmmg",
  TJMRS: "api_publica_tjmrs",
};

export function resolveAlias(tribunal: string): string | null {
  const upper = tribunal.toUpperCase().trim();
  return DATAJUD_ALIASES[upper] ?? null;
}

export function supportsTribunal(tribunal: string): boolean {
  return resolveAlias(tribunal) !== null;
}
