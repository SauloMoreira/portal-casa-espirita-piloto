import { supabase } from "@/integrations/supabase/client";

export type AgendamentoInicialSessao = {
  data_sessao: string; // YYYY-MM-DD
  horario: string | null; // HH:mm or null
};

export type AgendamentoInicialResultado =
  | {
      ok: true;
      already_committed: boolean;
      status: "aguardando_inicio";
      data_inicio: string | null;
      sessoes_criadas: number;
    };

export type AgendamentoInicialErro =
  | { code: "SESSOES_INCONSISTENTES" }
  | { code: "STATUS_NAO_PERMITE_AGENDAMENTO" }
  | { code: "NAO_AUTORIZADO" }
  | { code: "PAYLOAD_INVALIDO" }
  | { code: "AGENDAMENTO_TRATAMENTO_COMMIT_FAILED" };

export class AgendamentoInicialError extends Error {
  readonly code: AgendamentoInicialErro["code"];
  constructor(code: AgendamentoInicialErro["code"], message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "AgendamentoInicialError";
  }
}

const CODIGOS_FUNCIONAIS: ReadonlySet<string> = new Set([
  "SESSOES_INCONSISTENTES",
  "STATUS_NAO_PERMITE_AGENDAMENTO",
  "NAO_AUTORIZADO",
  "PAYLOAD_INVALIDO",
]);

function normalizaSessao(s: AgendamentoInicialSessao): AgendamentoInicialSessao {
  return {
    data_sessao: s.data_sessao,
    horario: s.horario && s.horario.length > 0 ? s.horario : null,
  };
}

export async function confirmarAgendamentoInicial(
  vinculoId: string,
  sessoes: AgendamentoInicialSessao[],
): Promise<AgendamentoInicialResultado> {
  const payload = sessoes.map(normalizaSessao);
  const { data, error } = await supabase.rpc(
    "fn_confirmar_agendamento_tratamento" as never,
    { p_vinculo_id: vinculoId, p_sessoes: payload as unknown as never } as never,
  );

  if (error) {
    const raw = `${error.message ?? ""} ${(error as { details?: string }).details ?? ""}`;
    const match = /(SESSOES_INCONSISTENTES|STATUS_NAO_PERMITE_AGENDAMENTO|NAO_AUTORIZADO|PAYLOAD_INVALIDO|AGENDAMENTO_TRATAMENTO_COMMIT_FAILED)/.exec(
      raw,
    );
    const code = (match?.[1] as AgendamentoInicialErro["code"] | undefined) ??
      "AGENDAMENTO_TRATAMENTO_COMMIT_FAILED";
    if (!CODIGOS_FUNCIONAIS.has(code) && code !== "AGENDAMENTO_TRATAMENTO_COMMIT_FAILED") {
      throw new AgendamentoInicialError("AGENDAMENTO_TRATAMENTO_COMMIT_FAILED");
    }
    throw new AgendamentoInicialError(code);
  }

  const d = data as unknown as Partial<AgendamentoInicialResultado> | null;
  if (
    !d ||
    typeof d !== "object" ||
    d.ok !== true ||
    typeof d.already_committed !== "boolean" ||
    d.status !== "aguardando_inicio" ||
    typeof d.sessoes_criadas !== "number"
  ) {
    throw new AgendamentoInicialError("AGENDAMENTO_TRATAMENTO_COMMIT_FAILED");
  }
  return d as AgendamentoInicialResultado;
}
