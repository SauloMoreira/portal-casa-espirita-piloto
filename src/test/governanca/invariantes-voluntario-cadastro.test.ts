import { describe, it, expect } from "vitest";
import {
  voluntarioCadastroCompleto,
  pendenciasCadastroVoluntario,
  podeGerarTermo,
  mapearPessoaParaPrefill,
  encontrarVoluntarioDuplicado,
  type PessoaCandidata,
} from "@/lib/voluntarioCadastro";

/**
 * INV-VOL-001 — Coerência da frente "Voluntário: busca + reaproveitamento +
 * cadastro mínimo + termo só com cadastro completo".
 *
 * Estes testes protegem as invariantes de domínio que o backend também garante:
 * - cadastro mínimo não bloqueia operação;
 * - termo só é liberado com cadastro completo (pendências explícitas);
 * - reaproveitamento mapeia apenas DADOS-BASE + rastreabilidade de origem;
 * - prevenção de voluntário duplicado por CPF/celular normalizado.
 */
describe("INV-VOL-001 — governança do cadastro de voluntário", () => {
  const base = {
    nome_completo: "Maria Silva",
    celular: "(11) 98888-7777",
    cpf: "529.982.247-25",
    email: "maria@x.com",
    data_nascimento: "1990-01-01",
    cep: "01001-000",
    logradouro: "Rua A",
    numero: "10",
    bairro: "Centro",
    cidade: "São Paulo",
    estado: "SP",
  };

  it("cadastro mínimo (só nome+celular) NÃO é completo, mas lista pendências exatas", () => {
    const minimo = { nome_completo: "João", celular: "(11) 97777-6666" };
    expect(voluntarioCadastroCompleto(minimo)).toBe(false);
    const pend = pendenciasCadastroVoluntario(minimo);
    expect(pend).toEqual([
      "CPF",
      "E-mail",
      "Data de nascimento",
      "CEP",
      "Logradouro",
      "Número",
      "Bairro",
      "Cidade",
      "Estado",
    ]);
  });

  it("cadastro completo libera o termo sem pendências", () => {
    expect(voluntarioCadastroCompleto(base)).toBe(true);
    const g = podeGerarTermo(base);
    expect(g.permitido).toBe(true);
    expect(g.pendencias).toHaveLength(0);
  });

  it("gating do termo devolve pendências explícitas quando incompleto", () => {
    const g = podeGerarTermo({ ...base, cpf: "", cidade: "" });
    expect(g.permitido).toBe(false);
    expect(g.pendencias).toContain("CPF");
    expect(g.pendencias).toContain("Cidade");
  });

  it("reaproveitamento mapeia DADOS-BASE e rastreabilidade conforme a origem", () => {
    const assistido: PessoaCandidata = {
      origem: "assistido",
      origem_id: "a-1",
      user_id: null,
      nome: "Ana",
      cpf: "111",
      celular: "(11) 90000-0000",
    };
    const pre = mapearPessoaParaPrefill(assistido);
    expect(pre.nome_completo).toBe("Ana");
    expect(pre.origem_cadastro).toBe("reaproveitado_assistido");
    expect(pre.origem_assistido_id).toBe("a-1");
    expect(pre.origem_user_id).toBeNull();

    const usuario: PessoaCandidata = {
      origem: "usuario",
      origem_id: "u-1",
      user_id: "u-1",
      nome: "Beto",
    };
    const preU = mapearPessoaParaPrefill(usuario);
    expect(preU.origem_cadastro).toBe("reaproveitado_usuario");
    expect(preU.origem_user_id).toBe("u-1");
    expect(preU.origem_assistido_id).toBeNull();
  });

  it("previne voluntário duplicado por CPF/celular normalizado, ignorando desligados e o próprio id", () => {
    const existentes = [
      { id: "v1", cpf: "529.982.247-25", celular: "(11) 98888-7777", status: "ativo" },
      { id: "v2", cpf: "111.111.111-11", celular: "(11) 90000-0000", status: "desligado" },
    ];
    expect(encontrarVoluntarioDuplicado({ cpf: "52998224725" }, existentes)).toBe("v1");
    expect(encontrarVoluntarioDuplicado({ celular: "11988887777" }, existentes)).toBe("v1");
    // desligado não bloqueia
    expect(encontrarVoluntarioDuplicado({ cpf: "11111111111" }, existentes)).toBeNull();
    // editar o próprio voluntário não acusa duplicidade
    expect(encontrarVoluntarioDuplicado({ cpf: "52998224725" }, existentes, "v1")).toBeNull();
  });
});
