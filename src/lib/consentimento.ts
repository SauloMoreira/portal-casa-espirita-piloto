/**
 * Lógica pura de consentimento de comunicação por WhatsApp (LGPD).
 *
 * Mantida sem efeitos colaterais para ser testada de forma isolada do banco.
 * Define a versão vigente do termo, o estado derivado do consentimento e as
 * regras que determinam se a casa pode enviar comunicação ao assistido.
 */

/** Versão atual do termo de consentimento. Incrementar ao mudar o texto. */
export const VERSAO_TERMO_CONSENTIMENTO = "1.0";

export const TEXTO_TERMO_CONSENTIMENTO =
  "Autorizo a casa a me enviar comunicações por WhatsApp (lembretes de " +
  "entrevistas e sessões, avisos institucionais, campanhas e eventos). " +
  "Posso revogar este consentimento a qualquer momento, por aqui ou " +
  "respondendo \"PARAR\" no WhatsApp. As mensagens são em volume controlado " +
  "e nunca configuram spam.";

export type ConsentimentoStatus = "pendente" | "concedido" | "revogado";

export type ConsentimentoOrigem = "app" | "whatsapp" | "equipe" | "importacao";

export type ConsentimentoAcao = "concedido" | "revogado";

export interface ConsentimentoSnapshot {
  consentimento_status: string | null;
  consentimento_at: string | null;
  consentimento_versao: string | null;
}

/** Normaliza qualquer valor para um status conhecido (default: pendente). */
export function normalizarStatus(status: string | null | undefined): ConsentimentoStatus {
  if (status === "concedido" || status === "revogado") return status;
  return "pendente";
}

/** True quando há consentimento ativo e na versão vigente do termo. */
export function consentimentoAtivo(
  snap: ConsentimentoSnapshot | null,
  versaoVigente: string = VERSAO_TERMO_CONSENTIMENTO,
): boolean {
  if (!snap) return false;
  if (normalizarStatus(snap.consentimento_status) !== "concedido") return false;
  // Consentimento dado em versão anterior do termo precisa ser renovado.
  return (snap.consentimento_versao ?? null) === versaoVigente;
}

/**
 * True quando o termo precisa ser (re)apresentado: nunca consentido, revogado,
 * ou consentido em uma versão antiga do termo.
 */
export function precisaRenovarConsentimento(
  snap: ConsentimentoSnapshot | null,
  versaoVigente: string = VERSAO_TERMO_CONSENTIMENTO,
): boolean {
  return !consentimentoAtivo(snap, versaoVigente);
}

/** Rótulo amigável para exibição do status. */
export function rotuloStatus(status: string | null | undefined): string {
  switch (normalizarStatus(status)) {
    case "concedido":
      return "Consentimento concedido";
    case "revogado":
      return "Consentimento revogado";
    default:
      return "Consentimento pendente";
  }
}

/** Deriva os campos de snapshot a partir de uma ação de consentimento. */
export function snapshotDaAcao(
  acao: ConsentimentoAcao,
  versao: string = VERSAO_TERMO_CONSENTIMENTO,
  agora: Date = new Date(),
): { consentimento_status: ConsentimentoStatus; consentimento_at: string; consentimento_versao: string } {
  return {
    consentimento_status: acao === "concedido" ? "concedido" : "revogado",
    consentimento_at: agora.toISOString(),
    consentimento_versao: versao,
  };
}
