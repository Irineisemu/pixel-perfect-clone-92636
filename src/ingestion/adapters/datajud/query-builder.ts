/**
 * Builders de Elastic Query para a API DataJud (CNJ).
 */

export type ElasticBody = {
  size?: number;
  query: Record<string, unknown>;
  sort?: Array<Record<string, unknown>>;
  search_after?: Array<unknown>;
};

export function byProcessNumber(processNumber: string): ElasticBody {
  return {
    size: 1,
    query: {
      match: { numeroProcesso: processNumber.replace(/\D/g, "") },
    },
  };
}

export type SearchBuilderInput = {
  classCodes?: number[];
  subjectCodes?: number[];
  partyName?: string;
  pageSize?: number;
  cursor?: string;
};

export function buildSearch(input: SearchBuilderInput): ElasticBody {
  const must: Array<Record<string, unknown>> = [];

  if (input.classCodes?.length) {
    must.push({ terms: { "classe.codigo": input.classCodes } });
  }
  if (input.subjectCodes?.length) {
    must.push({ terms: { "assuntos.codigo": input.subjectCodes } });
  }
  if (input.partyName) {
    must.push({
      nested: {
        path: "partes",
        query: { match: { "partes.pessoa.nome": input.partyName } },
      },
    });
  }

  const body: ElasticBody = {
    size: input.pageSize ?? 50,
    query: must.length ? { bool: { must } } : { match_all: {} },
    sort: [{ "@timestamp": "asc" }, { _id: "asc" }],
  };

  if (input.cursor) {
    try {
      body.search_after = JSON.parse(Buffer.from(input.cursor, "base64").toString("utf8"));
    } catch {
      // ignora cursor inválido
    }
  }
  return body;
}

export function encodeCursor(sortValues: unknown[]): string {
  return Buffer.from(JSON.stringify(sortValues), "utf8").toString("base64");
}
