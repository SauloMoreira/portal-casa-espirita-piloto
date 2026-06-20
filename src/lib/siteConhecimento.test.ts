import { describe, it, expect } from "vitest";
import {
  normalizarSite,
  indicaConhecimentoPublico,
  categoriasAlvo,
  selecionarDocumentos,
  montarContextoSite,
  type SiteDocumento,
} from "./siteConhecimento";

const doc = (over: Partial<SiteDocumento>): SiteDocumento => ({
  id: over.id ?? crypto.randomUUID(),
  url: over.url ?? "https://www.fermarica.com.br/x",
  titulo: over.titulo ?? "",
  resumo: over.resumo ?? "",
  corpo: over.corpo ?? "",
  categoria: over.categoria ?? "outros",
  prioridade: over.prioridade ?? "media",
  temporal: over.temporal ?? false,
  data_conteudo: over.data_conteudo ?? null,
  usar_na_ia: over.usar_na_ia ?? true,
  status: over.status ?? "ativo",
});

describe("normalizarSite", () => {
  it("remove acentos, baixa caixa e normaliza espaços", () => {
    expect(normalizarSite("  Evangélho  Terapia ")).toBe("evangelho terapia");
  });
});

describe("indicaConhecimentoPublico", () => {
  it("reconhece perguntas de conhecimento público", () => {
    expect(indicaConhecimentoPublico("o que é magnetismo?")).toBe(true);
    expect(indicaConhecimentoPublico("quais tratamentos a casa realiza?")).toBe(true);
    expect(indicaConhecimentoPublico("como funciona a FER?")).toBe(true);
  });
  it("ignora frases sem indício de conhecimento público", () => {
    expect(indicaConhecimentoPublico("preciso muito de ajuda agora")).toBe(false);
    expect(indicaConhecimentoPublico("")).toBe(false);
  });
});

describe("categoriasAlvo", () => {
  it("mapeia tratamento", () => {
    expect(categoriasAlvo("o que é desobsessão?")).toContain("tratamento");
  });
  it("mapeia institucional + contato para funcionamento da casa", () => {
    const alvos = categoriasAlvo("como funciona a casa?");
    expect(alvos).toContain("institucional");
    expect(alvos).toContain("contato");
  });
  it("usa institucional/contato como apoio em pedido_informacao genérico", () => {
    const alvos = categoriasAlvo("algo aleatório", "pedido_informacao");
    expect(alvos).toEqual(expect.arrayContaining(["institucional", "contato"]));
  });
});

describe("selecionarDocumentos — conhecimento", () => {
  const docs: SiteDocumento[] = [
    doc({ titulo: "Magnetismo", resumo: "Aplicação de energia magnética para harmonização.", categoria: "tratamento", prioridade: "alta" }),
    doc({ titulo: "Desobsessão", resumo: "Tratamento espiritual de desobsessão.", categoria: "tratamento", prioridade: "alta" }),
    doc({ titulo: "Evangelhoterapia", resumo: "Estudo do evangelho aplicado à cura.", categoria: "tratamento", prioridade: "alta" }),
    doc({ titulo: "Apometria", resumo: "Técnica de desdobramento para tratamento.", categoria: "tratamento", prioridade: "alta" }),
    doc({ titulo: "Tratamentos da Casa", resumo: "A casa realiza magnetismo, desobsessão, evangelhoterapia e apometria.", categoria: "tratamento", prioridade: "alta" }),
  ];

  it("encontra magnetismo", () => {
    const r = selecionarDocumentos("o que é magnetismo?", "pedido_informacao", docs);
    expect(r[0].titulo).toBe("Magnetismo");
  });
  it("encontra desobsessão", () => {
    const r = selecionarDocumentos("o que é desobsessão?", "pedido_informacao", docs);
    expect(r[0].titulo).toBe("Desobsessão");
  });
  it("encontra evangelhoterapia", () => {
    const r = selecionarDocumentos("o que é evangelhoterapia?", "pedido_informacao", docs);
    expect(r[0].titulo).toBe("Evangelhoterapia");
  });
  it("encontra apometria", () => {
    const r = selecionarDocumentos("o que é apometria?", "pedido_informacao", docs);
    expect(r[0].titulo).toBe("Apometria");
  });
  it("responde quais tratamentos a casa realiza", () => {
    const r = selecionarDocumentos("quais tratamentos a casa realiza?", "pedido_informacao", docs);
    expect(r.length).toBeGreaterThan(0);
  });
});

describe("selecionarDocumentos — não contaminação", () => {
  const docs: SiteDocumento[] = [
    doc({ titulo: "Magnetismo", resumo: "Tratamento de magnetismo.", categoria: "tratamento", prioridade: "alta" }),
    doc({ titulo: "Doe ao magnetismo", resumo: "Ajude com doação de magnetismo.", categoria: "doacao", prioridade: "media" }),
    doc({ titulo: "Campanha do magnetismo", resumo: "Campanha sobre magnetismo.", categoria: "campanha", prioridade: "media" }),
  ];
  it("pergunta de tratamento nunca retorna doação ou campanha", () => {
    const r = selecionarDocumentos("o que é magnetismo?", "pedido_informacao", docs);
    expect(r.every((d) => d.categoria !== "doacao" && d.categoria !== "campanha")).toBe(true);
  });
});

describe("selecionarDocumentos — guarda temporal", () => {
  const docs: SiteDocumento[] = [
    doc({ titulo: "Tratamento de Apometria", resumo: "Conteúdo permanente sobre apometria.", categoria: "tratamento", prioridade: "alta", temporal: false }),
    doc({ titulo: "Mutirão de Apometria desta semana", resumo: "Evento temporal de apometria.", categoria: "evento", prioridade: "media", temporal: true }),
  ];
  it("documento temporal não entra como apoio padrão", () => {
    const r = selecionarDocumentos("o que é apometria?", "pedido_informacao", docs);
    expect(r.some((d) => d.temporal)).toBe(false);
  });
});

describe("selecionarDocumentos — governança", () => {
  it("ignora rascunhos e documentos sem usar_na_ia", () => {
    const docs: SiteDocumento[] = [
      doc({ titulo: "Magnetismo", resumo: "x magnetismo", categoria: "tratamento", status: "rascunho", usar_na_ia: true }),
      doc({ titulo: "Magnetismo 2", resumo: "x magnetismo", categoria: "tratamento", status: "ativo", usar_na_ia: false }),
    ];
    const r = selecionarDocumentos("magnetismo", "pedido_informacao", docs);
    expect(r.length).toBe(0);
  });
  it("respeita o limite máximo de documentos", () => {
    const docs: SiteDocumento[] = Array.from({ length: 6 }, (_, i) =>
      doc({ titulo: `Magnetismo ${i}`, resumo: "magnetismo", categoria: "tratamento" }),
    );
    const r = selecionarDocumentos("magnetismo", "pedido_informacao", docs, { max: 2 });
    expect(r.length).toBe(2);
  });
});

describe("montarContextoSite", () => {
  it("monta bloco factual a partir dos documentos", () => {
    const ctx = montarContextoSite([
      doc({ titulo: "Magnetismo", resumo: "Energia para harmonização." }),
    ]);
    expect(ctx).toContain("Magnetismo");
    expect(ctx).toContain("Energia para harmonização.");
  });
  it("retorna vazio sem documentos", () => {
    expect(montarContextoSite([])).toBe("");
  });
});
