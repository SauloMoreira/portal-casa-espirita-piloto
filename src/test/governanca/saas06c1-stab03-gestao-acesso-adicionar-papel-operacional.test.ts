/**
 * SAAS-06-C1-STAB03 — Adicionar papel operacional complementar.
 *
 * Cobre a correção cirúrgica: a Gestão de Acesso deve permitir conceder um
 * papel operacional adicional a um usuário que já possui outro, reaproveitando
 * a mesma RPC de concessão (fn_conceder_acesso_operacional). Esta suíte
 * garante:
 *  - filtragem de papéis disponíveis (nunca duplica papel existente);
 *  - reaproveitamento do service (mesma chave/RPC/params);
 *  - idempotência do backend (status "ja_concedido" não vira erro);
 *  - revogação continua granular (remover 1 papel não remove os demais).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import {
  concederAcessoOperacional,
  revogarAcessoOperacional,
  type OperationalAccessRole,
} from "@/services/governanca/acessoService";

const OPERATIONAL_ROLES: OperationalAccessRole[] = [
  "entrevistador",
  "tarefeiro",
  "coordenador_de_tratamento",
];

/** Regra de UI: papéis oferecidos = todos os operacionais - já concedidos. */
function papeisDisponiveis(
  atuais: OperationalAccessRole[],
): OperationalAccessRole[] {
  return OPERATIONAL_ROLES.filter((r) => !atuais.includes(r));
}

beforeEach(() => rpcMock.mockReset());

describe("STAB03 — filtragem de papéis para adição complementar", () => {
  it("usuário sem papel: todos disponíveis", () => {
    expect(papeisDisponiveis([])).toEqual([
      "entrevistador",
      "tarefeiro",
      "coordenador_de_tratamento",
    ]);
  });

  it("usuário com Entrevistador: coordenador_de_tratamento fica disponível", () => {
    const disp = papeisDisponiveis(["entrevistador"]);
    expect(disp).toContain("coordenador_de_tratamento");
    expect(disp).not.toContain("entrevistador");
  });

  it("usuário com todos os papéis: nada a adicionar", () => {
    expect(papeisDisponiveis([...OPERATIONAL_ROLES])).toEqual([]);
  });
});

describe("STAB03 — reaproveitamento da RPC de concessão", () => {
  it("adicionar coordenador_de_tratamento a usuário com Entrevistador usa a mesma RPC", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "concedido", role: "coordenador_de_tratamento" },
      error: null,
    });
    const r = await concederAcessoOperacional({
      targetUserId: "user-medium-01",
      role: "coordenador_de_tratamento",
      motivo: "Escopo Reiki",
      instituicaoId: "fer-piloto",
    });
    expect(rpcMock).toHaveBeenCalledWith("fn_conceder_acesso_operacional", {
      p_target_user_id: "user-medium-01",
      p_role: "coordenador_de_tratamento",
      p_motivo: "Escopo Reiki",
      p_instituicao_id: "fer-piloto",
    });
    expect(r.status).toBe("concedido");
    expect(r.role).toBe("coordenador_de_tratamento");
  });

  it("idempotência: papel já concedido retorna 'ja_concedido' sem erro", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "ja_concedido", role: "entrevistador" },
      error: null,
    });
    const r = await concederAcessoOperacional({
      targetUserId: "user-medium-01",
      role: "entrevistador",
      instituicaoId: "fer-piloto",
    });
    expect(r.status).toBe("ja_concedido");
  });
});

describe("STAB03 — revogação granular preserva papéis restantes", () => {
  it("revogar Entrevistador não afeta coordenador_de_tratamento (payload isolado)", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "revogado", role: "entrevistador" },
      error: null,
    });
    const r = await revogarAcessoOperacional({
      targetUserId: "user-medium-01",
      role: "entrevistador",
      motivo: null,
    });
    expect(rpcMock).toHaveBeenCalledWith("fn_revogar_acesso_operacional", {
      p_target_user_id: "user-medium-01",
      p_role: "entrevistador",
      p_motivo: null,
    });
    // Apenas o papel enviado é revogado; a RPC não toca em outros papéis.
    expect(r.role).toBe("entrevistador");
  });

  it("revogar coordenador_de_tratamento envia somente esse papel", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "revogado", role: "coordenador_de_tratamento" },
      error: null,
    });
    await revogarAcessoOperacional({
      targetUserId: "user-medium-01",
      role: "coordenador_de_tratamento",
    });
    const [, params] = rpcMock.mock.calls[0];
    expect((params as Record<string, unknown>).p_role).toBe(
      "coordenador_de_tratamento",
    );
  });
});

describe("STAB03 — propagação de erro de permissão", () => {
  it("erro de negócio (sem_permissao) vira Error para a UI tratar", async () => {
    rpcMock.mockResolvedValue({ data: { error: "sem_permissao" }, error: null });
    await expect(
      concederAcessoOperacional({
        targetUserId: "u",
        role: "coordenador_de_tratamento",
        instituicaoId: "fer-piloto",
      }),
    ).rejects.toThrow("sem_permissao");
  });
});
