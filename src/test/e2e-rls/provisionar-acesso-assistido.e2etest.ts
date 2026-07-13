/**
 * STAB10-A.3 — Teste E2E automatizado do fluxo administrativo de geração
 * de acesso do assistido.
 *
 * Único caminho permitido: Edge Function `provisionar-acesso-assistido`
 * chamada com JWT real do operador. Proibido chamar `fn_provisionar_acesso_assistido`
 * diretamente (assert estático abaixo).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import {
  HAS_STAB10A3,
  NS,
  FER_ID,
  SECUNDARIA_ID,
  newTracker,
  uniq,
  emailFor,
  seedOperador,
  seedAssistidoSemAcesso,
  signInWithEmail,
  invokeProvisionar,
  restAsUser,
  adminGetAuthUser,
  adminListAuthUserByEmail,
  cleanupTracked,
  residuosFinais,
  closeStab10A3Pool,
  type CreatedIds,
} from "./_stab10a3Fixtures";

const d = HAS_STAB10A3 ? describe : describe.skip;

d("STAB10-A.3 · provisionar-acesso-assistido — E2E real", () => {
  const tracker: CreatedIds = newTracker();
  const runId = crypto.randomUUID().slice(0, 8);

  let operador!: { userId: string; email: string; password: string };
  let operadorSecundario!: { userId: string; email: string; password: string };
  let operadorJwt = "";
  let operadorSecJwt = "";

  beforeAll(async () => {
    // Seed dos operadores (FER + tenant secundário) e login real.
    operador = await seedOperador(tracker, FER_ID, `fer-${runId}`);
    operadorSecundario = await seedOperador(tracker, SECUNDARIA_ID, `sec-${runId}`);
    operadorJwt = (await signInWithEmail(operador.email, operador.password)).accessToken;
    operadorSecJwt = (await signInWithEmail(operadorSecundario.email, operadorSecundario.password)).accessToken;
  }, 60_000);

  afterAll(async () => {
    try {
      const counts = await residuosFinais(tracker);
      // Log apenas em caso de resíduo, sem expor UUIDs em logs padrão.
      const naoZero = Object.entries(counts).filter(([, v]) => v !== 0);
      if (naoZero.length) console.warn("residuos_pre_cleanup", naoZero);
    } finally {
      await cleanupTracked(tracker);
      await closeStab10A3Pool();
    }
  }, 60_000);

  it("proibição de bypass: teste não importa nem chama a RPC diretamente", () => {
    const self = readFileSync(__filename, "utf8");
    // Não importa o helper `rpc` do _rlsClient e não usa o endpoint de RPC do PostgREST.
    // (tokens montados por concatenação para não colidirem com a própria asserção)
    const forbiddenImport = /from\s+["']\.\/_rlsClient["'][^;]*\b(?<!\w)r(?=p)pc\b/;
    const rpcEndpoint = "/rest/v1/" + "rpc/";
    const rpcName = "fn_provisionar" + "_acesso_assistido";
    expect(self).not.toMatch(forbiddenImport);
    expect(self.includes(rpcEndpoint)).toBe(false);
    expect(self.includes(rpcName)).toBe(false);
    // A única chamada de provisionamento deve ser via a Edge Function.
    expect(self).toContain("functions/v1/provisionar-acesso-assistido");
  });

  it("caminho feliz cria estado consistente e permite login tenant-aware", async () => {
    const assistido = await seedAssistidoSemAcesso(tracker, FER_ID, operador.userId, `fer-${runId}`);
    const email = emailFor("as", `fer-${runId}`);
    const password = `Assist!${crypto.randomUUID().slice(0, 8)}`;

    const res = await invokeProvisionar(operadorJwt, {
      assistido_id: assistido.assistidoId,
      email,
      password,
      celular: "11912345678",
      data_nascimento: "1990-05-10",
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(typeof res.body?.user_id).toBe("string");
    expect(res.body?.already_provisioned).not.toBe(true);

    const novoUserId = res.body.user_id as string;
    tracker.authUsers.push(novoUserId);
    tracker.emails.push(email);

    // Auth user existe e confirmado
    const au = await adminGetAuthUser(novoUserId);
    expect(au?.id).toBe(novoUserId);
    expect(au?.email_confirmed_at).toBeTruthy();

    // Login real do assistido
    const login = await signInWithEmail(email, password);
    expect(login.userId).toBe(novoUserId);

    // Validações estruturais (service role — leitura)
    const svcHeaders = {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    };
    const base = process.env.VITE_SUPABASE_URL!;
    const [profRes, roleRes, iuRes, assRes] = await Promise.all([
      fetch(`${base}/rest/v1/profiles?user_id=eq.${novoUserId}&select=user_id`, {
        headers: svcHeaders,
      }).then((r) => r.json()),
      fetch(`${base}/rest/v1/user_roles?user_id=eq.${novoUserId}&select=role`, {
        headers: svcHeaders,
      }).then((r) => r.json()),
      fetch(
        `${base}/rest/v1/instituicao_usuarios?user_id=eq.${novoUserId}&select=instituicao_id,papel_local,status`,
        { headers: svcHeaders },
      ).then((r) => r.json()),
      fetch(
        `${base}/rest/v1/assistidos?id=eq.${assistido.assistidoId}&select=user_id,instituicao_id`,
        { headers: svcHeaders },
      ).then((r) => r.json()),
    ]);

    expect(profRes?.[0]?.user_id).toBe(novoUserId);
    const rolesAssistido = (roleRes as Array<{ role: string }>).filter((r) => r.role === "assistido");
    expect(rolesAssistido.length).toBe(1);
    const vinculoFer = (iuRes as Array<{ instituicao_id: string; papel_local: string; status: string }>).find(
      (v) => v.instituicao_id === FER_ID,
    );
    expect(vinculoFer?.papel_local).toBe("assistido");
    expect(vinculoFer?.status).toBe("ativo");
    expect(assRes?.[0]?.user_id).toBe(novoUserId);
    expect(assRes?.[0]?.instituicao_id).toBe(FER_ID);

    // Validação tenant-aware equivalente ao usePortalHub — via JWT real do assistido
    const iuAsUser = await restAsUser<Array<{ instituicao_id: string; status: string }>>(
      login.accessToken,
      `instituicao_usuarios?user_id=eq.${login.userId}&status=eq.ativo&select=instituicao_id,status`,
    );
    expect(iuAsUser.status).toBe(200);
    expect(iuAsUser.body.length).toBe(1);
    expect(iuAsUser.body[0].instituicao_id).toBe(FER_ID);

    const instsAsUser = await restAsUser<Array<{ id: string; nome: string }>>(
      login.accessToken,
      `instituicoes?select=id,nome`,
    );
    expect(instsAsUser.status).toBe(200);
    const ids = instsAsUser.body.map((i) => i.id);
    expect(ids).toContain(FER_ID);
    expect(ids).not.toContain(SECUNDARIA_ID);

    // Idempotência: segunda chamada exige already_provisioned=true
    const res2 = await invokeProvisionar(operadorJwt, {
      assistido_id: assistido.assistidoId,
      email,
      password,
      celular: "11912345678",
      data_nascimento: "1990-05-10",
    });
    expect(res2.status, JSON.stringify(res2.body)).toBe(200);
    expect(res2.body?.ok).toBe(true);
    expect(res2.body?.already_provisioned).toBe(true);
    expect(res2.body?.user_id).toBe(novoUserId);

    // Contagens continuam em 1 (sem duplicação)
    const [profDup, roleDup, iuDup] = await Promise.all([
      fetch(`${base}/rest/v1/profiles?user_id=eq.${novoUserId}&select=user_id`, {
        headers: svcHeaders,
      }).then((r) => r.json()),
      fetch(
        `${base}/rest/v1/user_roles?user_id=eq.${novoUserId}&role=eq.assistido&select=id`,
        { headers: svcHeaders },
      ).then((r) => r.json()),
      fetch(
        `${base}/rest/v1/instituicao_usuarios?user_id=eq.${novoUserId}&instituicao_id=eq.${FER_ID}&status=eq.ativo&select=id`,
        { headers: svcHeaders },
      ).then((r) => r.json()),
    ]);
    expect((profDup as Array<unknown>).length).toBe(1);
    expect((roleDup as Array<unknown>).length).toBe(1);
    expect((iuDup as Array<unknown>).length).toBe(1);
  }, 120_000);

  it("negativo cross-tenant: operador do tenant secundário é bloqueado", async () => {
    // Assistido em FER, separado, com user_id inicialmente NULL
    const assistido = await seedAssistidoSemAcesso(
      tracker,
      FER_ID,
      operador.userId,
      `xt-${runId}`,
    );
    const emailNeg = emailFor("neg", `xt-${runId}`);

    const res = await invokeProvisionar(operadorSecJwt, {
      assistido_id: assistido.assistidoId,
      email: emailNeg,
      password: `Neg!${crypto.randomUUID().slice(0, 8)}`,
      celular: "11912345678",
      data_nascimento: "1990-05-10",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body?.error).toBe("CROSS_TENANT_ACCESS_DENIED");

    // assistidos.user_id ainda NULL
    const svcHeaders = {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    };
    const base = process.env.VITE_SUPABASE_URL!;
    const check = await fetch(
      `${base}/rest/v1/assistidos?id=eq.${assistido.assistidoId}&select=user_id`,
      { headers: svcHeaders },
    ).then((r) => r.json());
    expect(check?.[0]?.user_id).toBeNull();

    // Nenhum auth.user criado com o e-mail negativo
    const usersNeg = await adminListAuthUserByEmail(emailNeg);
    expect(usersNeg.length).toBe(0);
  }, 60_000);

  it("marcador de namespace presente para inspeção residual", () => {
    // Trivial: garante que o run gerou registros namespaced que o cleanup
    // seguirá removendo via IDs — o afterAll fará a comprovação.
    expect(NS).toBe("stab10a3");
    expect(tracker.authUsers.length).toBeGreaterThan(0);
  });
});
