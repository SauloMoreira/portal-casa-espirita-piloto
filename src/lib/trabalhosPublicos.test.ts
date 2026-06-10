import { describe, it, expect } from "vitest";
import {
  computePublicWorksAnalytics,
  buildPeriodSeries,
  participantKey,
  resolveFaixa,
  publicFaixaFromRaw,
} from "./trabalhosPublicos";
import type { PublicCheckinRecord, PublicWorksFilters } from "@/types/trabalhosPublicos";

function rec(p: Partial<PublicCheckinRecord> & { id: string; dataSessao: string }): PublicCheckinRecord {
  return {
    sessaoId: p.sessaoId ?? "s1",
    tratamentoId: p.tratamentoId ?? "t1",
    tratamentoNome: p.tratamentoNome ?? "Passe Público",
    modoCheckin: p.modoCheckin ?? "qr",
    cadastroRapido: p.cadastroRapido ?? false,
    faixaRaw: p.faixaRaw ?? null,
    assistidoId: p.assistidoId ?? null,
    dataNascimento: p.dataNascimento ?? null,
    nome: p.nome ?? null,
    celular: p.celular ?? null,
    ...p,
  };
}

const FILTERS: PublicWorksFilters = {
  dataInicio: "2026-06-01",
  dataFim: "2026-06-30",
  tratamentoId: "todos",
  faixa: "todos",
  tipoParticipante: "todos",
  modoCheckin: "todos",
};

describe("participantKey", () => {
  it("prefers assistido, then phone, then name", () => {
    expect(participantKey(rec({ id: "1", dataSessao: "2026-06-10", assistidoId: "a1" }))).toBe("a:a1");
    expect(participantKey(rec({ id: "2", dataSessao: "2026-06-10", celular: "(11) 91234-5678" }))).toBe("c:11912345678");
    expect(participantKey(rec({ id: "3", dataSessao: "2026-06-10", nome: "José Silva" }))).toBe("n:jose silva");
    expect(participantKey(rec({ id: "4", dataSessao: "2026-06-10" }))).toBe("x:4");
  });
});

describe("resolveFaixa", () => {
  it("uses exact age when birthdate present", () => {
    expect(resolveFaixa(rec({ id: "1", dataSessao: "2026-06-10", assistidoId: "a1", dataNascimento: "2000-01-01" }))).toBe("30–44");
  });
  it("falls back to raw quick-registration faixa", () => {
    expect(publicFaixaFromRaw("60_mais")).toBe("60+");
    expect(resolveFaixa(rec({ id: "1", dataSessao: "2026-06-10", faixaRaw: "18_29" }))).toBe("18–29");
  });
});

describe("computePublicWorksAnalytics", () => {
  const records: PublicCheckinRecord[] = [
    // recurrent participant: has history BEFORE the period
    rec({ id: "h1", dataSessao: "2026-05-01", celular: "11900000001" }),
    rec({ id: "c1", dataSessao: "2026-06-05", celular: "11900000001", sessaoId: "s1" }),
    rec({ id: "c2", dataSessao: "2026-06-12", celular: "11900000001", sessaoId: "s2" }),
    // new participant in period
    rec({ id: "c3", dataSessao: "2026-06-05", celular: "11900000002", sessaoId: "s1" }),
    // new participant, other public work, manual checkin, faixa 60+
    rec({ id: "c4", dataSessao: "2026-06-20", nome: "Ana", sessaoId: "s3", tratamentoId: "t2", tratamentoNome: "Palestra Pública", modoCheckin: "manual", faixaRaw: "60_mais" }),
  ];

  it("computes totals over real period records", () => {
    const a = computePublicWorksAnalytics(records, FILTERS);
    expect(a.totalPresencas).toBe(4); // 4 check-ins inside June
    expect(a.totalParticipantes).toBe(3);
    expect(a.totalSessoes).toBe(3);
  });

  it("classifies new vs recurrent using full history", () => {
    const a = computePublicWorksAnalytics(records, FILTERS);
    expect(a.recorrentes).toBe(1); // 11900000001 had a May check-in
    expect(a.novos).toBe(2);
    expect(a.percentualNovos).toBe(67);
  });

  it("ranks public works by attendance", () => {
    const a = computePublicWorksAnalytics(records, FILTERS);
    expect(a.topTrabalho?.tratamentoId).toBe("t1");
    expect(a.topTrabalho?.presencas).toBe(3);
    expect(a.bottomTrabalho?.tratamentoId).toBe("t2");
  });

  it("respects the modo_checkin filter", () => {
    const a = computePublicWorksAnalytics(records, { ...FILTERS, modoCheckin: "manual" });
    expect(a.totalPresencas).toBe(1);
    expect(a.porTrabalho[0].tratamentoId).toBe("t2");
  });

  it("respects the tipoParticipante filter", () => {
    const a = computePublicWorksAnalytics(records, { ...FILTERS, tipoParticipante: "recorrente" });
    expect(a.totalParticipantes).toBe(1);
    expect(a.totalPresencas).toBe(2);
  });
});

describe("buildPeriodSeries", () => {
  it("groups by month", () => {
    const a = computePublicWorksAnalytics(
      [
        rec({ id: "c1", dataSessao: "2026-06-05", celular: "1" }),
        rec({ id: "c2", dataSessao: "2026-06-20", celular: "2" }),
      ],
      FILTERS,
    );
    const series = buildPeriodSeries(a.filtered, "mes");
    expect(series).toEqual([{ periodo: "2026-06", presencas: 2, participantes: 2 }]);
  });
});
