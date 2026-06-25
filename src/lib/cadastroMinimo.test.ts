import { describe, it, expect } from "vitest";
import {
  validarCadastroMinimo,
  cadastroEstaCompleto,
  encontrarDuplicadoPorCelular,
  rotuloStatusCadastro,
} from "./cadastroMinimo";

describe("validarCadastroMinimo", () => {
  it("aceita apenas nome + celular válido", () => {
    const r = validarCadastroMinimo({ nome: "Maria Silva", celular: "(11) 98888-7777" });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual({});
  });

  it("exige nome", () => {
    const r = validarCadastroMinimo({ nome: "  ", celular: "11988887777" });
    expect(r.valid).toBe(false);
    expect(r.errors.nome).toBeDefined();
  });

  it("exige celular", () => {
    const r = validarCadastroMinimo({ nome: "Maria", celular: "" });
    expect(r.valid).toBe(false);
    expect(r.errors.celular).toBeDefined();
  });

  it("rejeita celular com formato inválido", () => {
    const r = validarCadastroMinimo({ nome: "Maria", celular: "123" });
    expect(r.errors.celular).toBe("Celular inválido");
  });

  it("NÃO exige CPF, e-mail, nascimento nem endereço no mínimo", () => {
    const r = validarCadastroMinimo({ nome: "Maria", celular: "11988887777" });
    expect(r.errors.cpf).toBeUndefined();
    expect(r.errors.email).toBeUndefined();
  });

  it("valida CPF apenas quando informado", () => {
    expect(validarCadastroMinimo({ nome: "M", celular: "11988887777", cpf: "111" }).errors.cpf).toBe("CPF inválido");
    expect(validarCadastroMinimo({ nome: "M", celular: "11988887777", cpf: "529.982.247-25" }).errors.cpf).toBeUndefined();
  });

  it("valida e-mail apenas quando informado", () => {
    expect(validarCadastroMinimo({ nome: "M", celular: "11988887777", email: "x@y" }).errors.email).toBe("E-mail inválido");
    expect(validarCadastroMinimo({ nome: "M", celular: "11988887777", email: "x@y.com" }).errors.email).toBeUndefined();
  });
});

describe("cadastroEstaCompleto", () => {
  const completo = {
    nome: "Maria",
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
  it("retorna true quando todos os campos estão presentes", () => {
    expect(cadastroEstaCompleto(completo)).toBe(true);
  });
  it("retorna false quando falta um campo complementar", () => {
    expect(cadastroEstaCompleto({ ...completo, cpf: "" })).toBe(false);
    expect(cadastroEstaCompleto({ ...completo, email: "" })).toBe(false);
    expect(cadastroEstaCompleto({ ...completo, estado: "" })).toBe(false);
  });
  it("cadastro mínimo (só nome+celular) é incompleto", () => {
    expect(cadastroEstaCompleto({ nome: "Maria", celular: "11988887777" })).toBe(false);
  });
});

describe("rotuloStatusCadastro", () => {
  it("mapeia completo/incompleto", () => {
    expect(rotuloStatusCadastro(true).tom).toBe("ok");
    expect(rotuloStatusCadastro(false).tom).toBe("pendente");
  });
});

describe("encontrarDuplicadoPorCelular", () => {
  const lista = [
    { id: "a", celular: "11988887777" },
    { id: "b", telefone: "(21) 97777-6666" },
  ];
  it("encontra duplicado ignorando máscara", () => {
    expect(encontrarDuplicadoPorCelular("(11) 98888-7777", lista)).toBe("a");
    expect(encontrarDuplicadoPorCelular("21977776666", lista)).toBe("b");
  });
  it("ignora o próprio id em edição", () => {
    expect(encontrarDuplicadoPorCelular("11988887777", lista, "a")).toBeNull();
  });
  it("retorna null quando não há duplicado", () => {
    expect(encontrarDuplicadoPorCelular("11900000000", lista)).toBeNull();
  });
  it("retorna null para celular vazio", () => {
    expect(encontrarDuplicadoPorCelular("", lista)).toBeNull();
  });
});
