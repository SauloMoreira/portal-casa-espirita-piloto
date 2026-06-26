import { describe, it, expect } from "vitest";
import {
  validarCadastroMinimoVoluntario,
  voluntarioCadastroCompleto,
  pendenciasCadastroVoluntario,
  rotuloStatusCadastroVoluntario,
  podeGerarTermo,
  mapearPessoaParaPrefill,
  encontrarVoluntarioDuplicado,
  type PessoaCandidata,
} from "./voluntarioCadastro";

describe("validarCadastroMinimoVoluntario", () => {
  it("aceita nome + celular + um tipo", () => {
    const r = validarCadastroMinimoVoluntario({
      nome_completo: "Maria Silva",
      celular: "(11) 98888-7777",
      tipos_voluntario: ["Médium"],
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual({});
  });

  it("exige nome, celular e tipo", () => {
    const r = validarCadastroMinimoVoluntario({ nome_completo: " ", celular: "", tipos_voluntario: [] });
    expect(r.errors.nome_completo).toBeDefined();
    expect(r.errors.celular).toBeDefined();
    expect(r.errors.tipos_voluntario).toBeDefined();
  });

  it("rejeita celular inválido", () => {
    const r = validarCadastroMinimoVoluntario({ nome_completo: "M", celular: "123", tipos_voluntario: ["Médium"] });
    expect(r.errors.celular).toBe("Celular inválido");
  });

  it("NÃO exige CPF, e-mail nem endereço no mínimo", () => {
    const r = validarCadastroMinimoVoluntario({ nome_completo: "M", celular: "11988887777", tipos_voluntario: ["Tarefeiro"] });
    expect(r.errors.cpf).toBeUndefined();
    expect(r.errors.email).toBeUndefined();
  });

  it("valida CPF e e-mail apenas quando informados", () => {
    expect(validarCadastroMinimoVoluntario({ nome_completo: "M", celular: "11988887777", tipos_voluntario: ["x"], cpf: "111" }).errors.cpf).toBe("CPF inválido");
    expect(validarCadastroMinimoVoluntario({ nome_completo: "M", celular: "11988887777", tipos_voluntario: ["x"], email: "a@b" }).errors.email).toBe("E-mail inválido");
  });
});

const completo = {
  nome_completo: "Maria",
  celular: "11988887777",
  cpf: "52998224725",
  email: "m@y.com",
  data_nascimento: "1990-01-01",
  cep: "01001000",
  logradouro: "Rua A",
  numero: "10",
  bairro: "Centro",
  cidade: "SP",
  estado: "SP",
};

describe("voluntarioCadastroCompleto / pendencias", () => {
  it("completo quando todos os campos presentes", () => {
    expect(voluntarioCadastroCompleto(completo)).toBe(true);
    expect(pendenciasCadastroVoluntario(completo)).toEqual([]);
  });
  it("lista pendências específicas", () => {
    const pend = pendenciasCadastroVoluntario({ ...completo, cpf: "", estado: "" });
    expect(pend).toContain("CPF");
    expect(pend).toContain("Estado");
    expect(pend).not.toContain("Cidade");
  });
  it("cadastro mínimo é incompleto", () => {
    expect(voluntarioCadastroCompleto({ nome_completo: "Maria", celular: "11988887777" })).toBe(false);
  });
});

describe("rotuloStatusCadastroVoluntario", () => {
  it("mapeia tom", () => {
    expect(rotuloStatusCadastroVoluntario(true).tom).toBe("ok");
    expect(rotuloStatusCadastroVoluntario(false).tom).toBe("pendente");
  });
});

describe("podeGerarTermo (gating)", () => {
  it("permite quando completo", () => {
    expect(podeGerarTermo(completo)).toEqual({ permitido: true, pendencias: [] });
  });
  it("bloqueia e lista pendências quando incompleto", () => {
    const r = podeGerarTermo({ ...completo, cpf: "", email: "" });
    expect(r.permitido).toBe(false);
    expect(r.pendencias).toEqual(expect.arrayContaining(["CPF", "E-mail"]));
  });
});

describe("mapearPessoaParaPrefill", () => {
  it("mapeia assistido para dados-base + rastreabilidade", () => {
    const p: PessoaCandidata = {
      origem: "assistido",
      origem_id: "ass-1",
      user_id: "u-1",
      nome: "João",
      cpf: "529.982.247-25",
      celular: "(11) 90000-0000",
      email: "j@x.com",
      data_nascimento: "1980-05-05",
      cidade: "SP",
    };
    const r = mapearPessoaParaPrefill(p);
    expect(r.nome_completo).toBe("João");
    expect(r.origem_cadastro).toBe("reaproveitado_assistido");
    expect(r.origem_assistido_id).toBe("ass-1");
    expect(r.origem_user_id).toBe("u-1");
  });
  it("mapeia usuário (sem assistido_id)", () => {
    const r = mapearPessoaParaPrefill({ origem: "usuario", origem_id: "p-1", user_id: "u-2", nome: "Ana" });
    expect(r.origem_cadastro).toBe("reaproveitado_usuario");
    expect(r.origem_assistido_id).toBeNull();
    expect(r.origem_user_id).toBe("u-2");
  });
});

describe("encontrarVoluntarioDuplicado", () => {
  const lista = [
    { id: "a", cpf: "52998224725", celular: "11988887777", status: "ativo" },
    { id: "b", cpf: "", celular: "21977776666", status: "desligado" },
  ];
  it("encontra por CPF", () => {
    expect(encontrarVoluntarioDuplicado({ cpf: "529.982.247-25" }, lista)).toBe("a");
  });
  it("encontra por celular", () => {
    expect(encontrarVoluntarioDuplicado({ celular: "(11) 98888-7777" }, lista)).toBe("a");
  });
  it("ignora voluntários desligados", () => {
    expect(encontrarVoluntarioDuplicado({ celular: "21977776666" }, lista)).toBeNull();
  });
  it("ignora o próprio id em edição", () => {
    expect(encontrarVoluntarioDuplicado({ cpf: "52998224725" }, lista, "a")).toBeNull();
  });
  it("retorna null quando não há colisão", () => {
    expect(encontrarVoluntarioDuplicado({ cpf: "11144477735", celular: "11900000000" }, lista)).toBeNull();
  });
});
