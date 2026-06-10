/**
 * Data-access layer.
 *
 * Services centralize Supabase queries per domain so components/hooks don't
 * embed raw queries. This keeps data logic in one place and makes a future
 * migration to RPCs/views/edge functions a localized change.
 *
 * Convention: each service file exports plain async functions that return
 * typed data and throw on error (callers handle UI state). Re-export new
 * services here.
 */
export * as sessoesPublicasService from "./sessoesPublicas";
export * as voluntariosService from "./voluntarios";
export * as agendaService from "./agenda";
export * as presencasService from "./presencas";
