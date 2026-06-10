import { describe, it, expect } from "vitest";
import {
  isValidCPF,
  isValidCNPJ,
  isValidPhone,
  isValidEmail,
  isValidCEP,
  maskCPF,
  maskPhone,
  maskCEP,
  maskCNPJ,
} from "./validators";

describe("isValidCPF", () => {
  it("accepts a valid CPF (with and without mask)", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("52998224725")).toBe(true);
  });
  it("rejects wrong length, repeated digits and bad check digits", () => {
    expect(isValidCPF("123")).toBe(false);
    expect(isValidCPF("11111111111")).toBe(false);
    expect(isValidCPF("52998224724")).toBe(false);
  });
});

describe("isValidCNPJ", () => {
  it("validates check digits", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11.222.333/0001-80")).toBe(false);
    expect(isValidCNPJ("00000000000000")).toBe(false);
  });
});

describe("isValidPhone", () => {
  it("accepts 10 and 11 digit numbers", () => {
    expect(isValidPhone("(11) 91234-5678")).toBe(true);
    expect(isValidPhone("1133334444")).toBe(true);
  });
  it("rejects short/long numbers", () => {
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("123456789012")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("validates basic email shape", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user@example")).toBe(false);
    expect(isValidEmail("invalid")).toBe(false);
  });
});

describe("isValidCEP", () => {
  it("accepts masked and raw CEP", () => {
    expect(isValidCEP("01001-000")).toBe(true);
    expect(isValidCEP("01001000")).toBe(true);
    expect(isValidCEP("123")).toBe(false);
  });
});

describe("masks", () => {
  it("formats CPF, phone and CEP", () => {
    expect(maskCPF("52998224725")).toBe("529.982.247-25");
    expect(maskPhone("11912345678")).toBe("(11) 91234-5678");
    expect(maskPhone("1133334444")).toBe("(11) 3333-4444");
    expect(maskCEP("01001000")).toBe("01001-000");
    expect(maskCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });
});
