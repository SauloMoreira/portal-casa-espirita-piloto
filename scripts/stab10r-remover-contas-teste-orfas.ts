/**
 * SAAS-06-C1-STAB10-R-B1 — Remoção segura das contas órfãs de teste R3-B e R4.
 *
 * Escopo estritamente allowlisted (2 UUIDs). Modos: --dry-run | --execute.
 * Operação: valida precondições read-only → transação pública all-or-nothing
 * (cadastro_solicitacoes, user_roles, profiles) → auditoria pré-remoção
 * (STAB10R_EXCLUSAO_CONTA_TESTE_ORFA) → auth.admin.deleteUser fora da tx.
 * Idempotente para retry do delete Auth. Recusa qualquer UUID fora da lista.
 *
 * Uso:
 *   bun run scripts/stab10r-remover-contas-teste-orfas.ts --dry-run
 *   bun run scripts/stab10r-remover-contas-teste-orfas.ts --execute
 *   bun run scripts/stab10r-remover-contas-teste-orfas.ts --execute --retry-auth
 */
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const ALLOWLIST: Record<string, { rotulo: string; emailEsperado: string; solicitacaoId?: string }> = {
  "f7112797-3b24-42f3-bd6c-d7e9434e25c0": {
    rotulo: "R3-B",
    emailEsperado: "assitido03@teste.com",
  },
  "5945c94f-49a5-4bdb-94a3-b5214bd29139": {
    rotulo: "R4",
    emailEsperado: "assitidonovo@teste.com",
    solicitacaoId: "8f18e750-93cc-4e9b-934a-be850e6d8187",
  },
};

const ALLOWED = new Set(Object.keys(ALLOWLIST));

type Modo = "dry-run" | "execute";

interface Args {
  modo: Modo;
  retryAuth: boolean;
  uidsExtras: string[];
}

function parseArgs(argv: string[]): Args {
  const modoFlag = argv.includes("--execute") ? "execute" : argv.includes("--dry-run") ? "dry-run" : null;
  if (!modoFlag) throw new Error("Modo obrigatório: --dry-run ou --execute");
  const retryAuth = argv.includes("--retry-auth");
  // qualquer flag adicional posicional é rejeitada
  const uidsExtras = argv.filter((a) => !a.startsWith("--"));
  return { modo: modoFlag, retryAuth, uidsExtras };
}

function assertAllowlistOnly(args: Args) {
  for (const u of args.uidsExtras) {
    if (!ALLOWED.has(u)) throw new Error(`UUID fora da allowlist rejeitado: ${u}`);
  }
}

interface Snapshot {
  uid: string;
  rotulo: string;
  emailAuth: string | null;
  profileExiste: boolean;
  roles: string[];
  vinculosInstitucionais: number;
  assistidosVinculados: number;
  solicitacoes: Array<{ id: string; email: string; status: string }>;
  auditCount: number;
  operacionaisExtras: Record<string, number>;
}

async function snapshot(pg: Client, admin: ReturnType<typeof createClient>, uid: string): Promise<Snapshot> {
  const meta = ALLOWLIST[uid];
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(uid);
  if (userErr && !/not.?found/i.test(userErr.message)) throw userErr;
  const emailAuth = userData?.user?.email ?? null;

  const [prof, roles, iu, ass, sol, aud] = await Promise.all([
    pg.query("SELECT 1 FROM profiles WHERE user_id=$1", [uid]),
    pg.query("SELECT role FROM user_roles WHERE user_id=$1 ORDER BY role", [uid]),
    pg.query("SELECT count(*)::int c FROM instituicao_usuarios WHERE user_id=$1", [uid]),
    pg.query("SELECT count(*)::int c FROM assistidos WHERE user_id=$1", [uid]),
    pg.query("SELECT id, email, status FROM cadastro_solicitacoes WHERE user_id=$1", [uid]),
    pg.query("SELECT count(*)::int c FROM audit_logs WHERE user_id=$1 OR registro_id=$1", [uid]),
  ]);

  const checks: Array<[string, string]> = [
    ["entrevistas_fraternas", "entrevistador_id"],
    ["avisos_internos", "created_by"],
    ["avisos_internos", "destinatario_id"],
    ["presencas_tratamentos", "registrado_por"],
    ["checkins_publicos", "registrado_por"],
    ["notificacoes_preferencias", "assistido_id"],
    ["consentimentos_comunicacao", "assistido_id"],
    ["ia_sugestoes", "entrevistador_id"],
    ["assistido_tratamentos", "created_by"],
  ];
  const operacionaisExtras: Record<string, number> = {};
  for (const [t, c] of checks) {
    const r = await pg.query(`SELECT count(*)::int c FROM ${t} WHERE ${c}=$1`, [uid]);
    if (r.rows[0].c > 0) operacionaisExtras[`${t}.${c}`] = r.rows[0].c;
  }

  return {
    uid,
    rotulo: meta.rotulo,
    emailAuth,
    profileExiste: prof.rowCount === 1,
    roles: roles.rows.map((r) => r.role),
    vinculosInstitucionais: iu.rows[0].c,
    assistidosVinculados: ass.rows[0].c,
    solicitacoes: sol.rows,
    auditCount: aud.rows[0].c,
    operacionaisExtras,
  };
}

function validarPrecondicoes(s: Snapshot): string[] {
  const meta = ALLOWLIST[s.uid];
  const erros: string[] = [];
  if (s.emailAuth !== meta.emailEsperado) erros.push(`email Auth divergente: ${s.emailAuth}`);
  if (!s.profileExiste) erros.push("profile ausente");
  if (s.roles.length !== 1 || s.roles[0] !== "assistido")
    erros.push(`roles divergentes: [${s.roles.join(",")}]`);
  if (s.vinculosInstitucionais !== 0) erros.push("instituicao_usuarios presente");
  if (s.assistidosVinculados !== 0) erros.push("assistidos.user_id apontando para este usuário");
  if (s.solicitacoes.length !== 1) erros.push(`cadastro_solicitacoes esperado 1, encontrado ${s.solicitacoes.length}`);
  else {
    const sol = s.solicitacoes[0];
    if (sol.email !== meta.emailEsperado) erros.push(`cadastro_solicitacoes.email divergente: ${sol.email}`);
    if (meta.solicitacaoId && sol.id !== meta.solicitacaoId)
      erros.push(`cadastro_solicitacoes.id divergente: ${sol.id}`);
  }
  if (Object.keys(s.operacionaisExtras).length > 0)
    erros.push(`referências operacionais adicionais: ${JSON.stringify(s.operacionaisExtras)}`);
  return erros;
}

/**
 * Remoção pública. O usuário pg do sandbox é select/insert-only, portanto as
 * DELETEs são executadas via service_role (bypass RLS) na ordem
 * child→parent. Precondições e ausência de referências já foram validadas.
 * Pré-flight repetido dentro da fase de execução detecta corrida antes de
 * qualquer escrita destrutiva.
 */
async function removerPublico(
  pg: Client,
  admin: ReturnType<typeof createClient>,
  uid: string,
  runId: string,
) {
  const iu = await pg.query("SELECT count(*)::int c FROM instituicao_usuarios WHERE user_id=$1", [uid]);
  if (iu.rows[0].c !== 0) throw new Error(`ABORT: instituicao_usuarios apareceu para ${uid}`);
  const ass = await pg.query("SELECT count(*)::int c FROM assistidos WHERE user_id=$1", [uid]);
  if (ass.rows[0].c !== 0) throw new Error(`ABORT: assistidos.user_id apareceu para ${uid}`);

  // Auditoria pré-remoção (via service_role, sem dados sensíveis)
  const { error: auditErr } = await admin.from("audit_logs").insert({
    user_id: uid,
    tabela: "auth.users",
    acao: "STAB10R_EXCLUSAO_CONTA_TESTE_ORFA",
    registro_id: uid,
    dados_novos: {
      motivo: "conta_teste_descartavel",
      run_id: runId,
      resultado_planejado: "remocao_publica_e_auth",
    },
  });
  if (auditErr) throw new Error(`audit insert falhou: ${auditErr.message}`);

  // Ordem child → parent. Falha em qualquer etapa interrompe e fail-close a conta.
  const d1 = await admin.from("cadastro_solicitacoes").delete().eq("user_id", uid).select("id");
  if (d1.error) throw new Error(`delete cadastro_solicitacoes: ${d1.error.message}`);
  const d2 = await admin.from("user_roles").delete().eq("user_id", uid).select("id");
  if (d2.error) throw new Error(`delete user_roles: ${d2.error.message}`);
  const d3 = await admin.from("profiles").delete().eq("user_id", uid).select("user_id");
  if (d3.error) throw new Error(`delete profiles: ${d3.error.message}`);
  if ((d3.data?.length ?? 0) !== 1) throw new Error(`ABORT: profiles esperado 1 removido, foi ${d3.data?.length}`);

  return { cadastro_solicitacoes: d1.data?.length ?? 0, user_roles: d2.data?.length ?? 0, profiles: d3.data?.length ?? 0 };
}

/**
 * Zera `audit_logs.user_id` para as linhas históricas do usuário para permitir
 * o delete em auth.users (FK). Conteúdo (`acao`, `tabela`, `registro_id`,
 * `dados_novos`) é preservado, incluindo a auditoria da própria remoção.
 */
async function desanexarAuditoria(admin: ReturnType<typeof createClient>, uid: string) {
  const { error, data } = await admin
    .from("audit_logs")
    .update({ user_id: null })
    .eq("user_id", uid)
    .select("id");
  if (error) throw new Error(`audit_logs desanexar: ${error.message}`);
  return data?.length ?? 0;
}

async function deletarAuth(admin: ReturnType<typeof createClient>, uid: string) {
  const { data: existente } = await admin.auth.admin.getUserById(uid);
  if (!existente?.user) return { alreadyGone: true };
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) throw error;
  return { alreadyGone: false };
}

async function verificarResiduos(pg: Client, admin: ReturnType<typeof createClient>, uid: string) {
  const [prof, roles, iu, ass, sol] = await Promise.all([
    pg.query("SELECT count(*)::int c FROM profiles WHERE user_id=$1", [uid]),
    pg.query("SELECT count(*)::int c FROM user_roles WHERE user_id=$1", [uid]),
    pg.query("SELECT count(*)::int c FROM instituicao_usuarios WHERE user_id=$1", [uid]),
    pg.query("SELECT count(*)::int c FROM assistidos WHERE user_id=$1", [uid]),
    pg.query("SELECT count(*)::int c FROM cadastro_solicitacoes WHERE user_id=$1", [uid]),
  ]);
  const { data } = await admin.auth.admin.getUserById(uid);
  return {
    auth_users: data?.user ? 1 : 0,
    profiles: prof.rows[0].c,
    user_roles: roles.rows[0].c,
    instituicao_usuarios: iu.rows[0].c,
    "assistidos.user_id": ass.rows[0].c,
    cadastro_solicitacoes: sol.rows[0].c,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertAllowlistOnly(args);

  const runId = randomUUID();
  console.log(`[STAB10-R-B1] modo=${args.modo} run_id=${runId}`);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const pg = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    const snaps: Snapshot[] = [];
    for (const uid of Object.keys(ALLOWLIST)) {
      const s = await snapshot(pg, admin, uid);
      snaps.push(s);
      console.log(`\n[${s.rotulo}] ${uid}`);
      console.log(JSON.stringify(s, null, 2));
    }

    // Se retry-auth, pular precondições públicas (já removidas) e ir direto ao delete auth
    if (args.retryAuth) {
      if (args.modo !== "execute") throw new Error("--retry-auth requer --execute");
      for (const s of snaps) {
        if (s.profileExiste || s.roles.length > 0 || s.solicitacoes.length > 0) {
          throw new Error(`[${s.rotulo}] retry-auth: ainda há resíduos públicos, aborte.`);
        }
        console.log(`\n[${s.rotulo}] retry deleteUser Auth…`);
        const desan = await desanexarAuditoria(admin, s.uid);
        console.log(`[${s.rotulo}] audit_logs desanexados=${desan}`);
        const r = await deletarAuth(admin, s.uid);
        console.log(`[${s.rotulo}] auth removido (alreadyGone=${r.alreadyGone})`);
      }
    } else {
      if (args.modo === "dry-run") {
        for (const s of snaps) {
          const erros = validarPrecondicoes(s);
          if (erros.length > 0) {
            console.error(`[${s.rotulo}] PRECONDIÇÕES DIVERGENTES:`, erros);
            throw new Error(`Precondições falharam para ${s.rotulo}`);
          }
          console.log(`[${s.rotulo}] precondições OK`);
        }
        console.log("\n[dry-run] nenhuma escrita executada.");
        return;
      }

      // execute: cada UID pode estar íntegro (fluxo completo) ou parcialmente removido (retomar)
      for (const s of snaps) {
        const publicoIntacto = s.profileExiste && s.roles.length > 0 && s.solicitacoes.length > 0;
        const publicoLimpo = !s.profileExiste && s.roles.length === 0 && s.solicitacoes.length === 0;
        if (!publicoIntacto && !publicoLimpo) {
          throw new Error(`[${s.rotulo}] estado público parcial inconsistente; investigar manualmente`);
        }

        if (publicoIntacto) {
          const erros = validarPrecondicoes(s);
          if (erros.length > 0) {
            console.error(`[${s.rotulo}] PRECONDIÇÕES DIVERGENTES:`, erros);
            throw new Error(`Precondições falharam para ${s.rotulo}`);
          }
          console.log(`[${s.rotulo}] precondições OK — removendo objetos públicos…`);
          const del = await removerPublico(pg, admin, s.uid, runId);
          console.log(`[${s.rotulo}] público removido`, del);
        } else {
          console.log(`[${s.rotulo}] público já removido — retomando delete Auth`);
        }

        try {
          const desan = await desanexarAuditoria(admin, s.uid);
          console.log(`[${s.rotulo}] audit_logs desanexados=${desan}`);
          const r = await deletarAuth(admin, s.uid);
          console.log(`[${s.rotulo}] auth removido (alreadyGone=${r.alreadyGone})`);
        } catch (e) {
          console.error(
            `[${s.rotulo}] FALHA AO REMOVER AUTH: ${(e as Error).message}. ` +
              `Público já foi excluído e conta permanece fail-closed. Rode novamente com --execute.`,
          );
          throw e;
        }
      }
    }

    console.log("\n[verificação final]");
    for (const uid of Object.keys(ALLOWLIST)) {
      const r = await verificarResiduos(pg, admin, uid);
      console.log(`  ${ALLOWLIST[uid].rotulo} (${uid}) →`, r);
      const total = Object.values(r).reduce((a, b) => a + b, 0);
      if (args.modo === "execute" && total !== 0) throw new Error(`Resíduos remanescentes em ${uid}`);
    }
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error("[STAB10-R-B1] ERRO:", e);
  process.exit(1);
});
