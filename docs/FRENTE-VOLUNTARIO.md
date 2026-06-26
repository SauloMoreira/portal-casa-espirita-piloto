# Frente Voluntário — Busca + Reaproveitamento + Cadastro Mínimo + Termo só com cadastro completo

Status: ✅ implementado (migração + lib + UI + testes + memória)
GitHub/CI: permanece pausado. Fora de escopo: entidade única de pessoa.

---

## 1. Modelagem final adotada

### Colunas em `public.voluntarios`
| Campo | Tipo | Papel |
|---|---|---|
| `cadastro_completo` | boolean | Selo de completude (derivado por função/trigger) |
| `origem_cadastro` | text | Rastreabilidade: `manual` / `reaproveitado_assistido` / `reaproveitado_usuario` |
| `origem_assistido_id` | uuid FK assistidos (ON DELETE SET NULL) | Vínculo de origem |
| `origem_user_id` | uuid FK auth.users (ON DELETE SET NULL) | Vínculo de origem |

Campos pessoais/endereço tiveram `NOT NULL` relaxado para permitir cadastro mínimo.

### Classificação dos campos (reaproveitar, não copiar cegamente)
- **DADOS-BASE da pessoa** (pré-preenchidos a partir de assistido/usuário e **persistidos** como cópia editável no voluntário): `nome_completo`, `cpf`, `celular`, `email`, `data_nascimento`, endereço (`cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `estado`), `foto_url`.
  - *Por que persistidos:* voluntário é entidade própria; os dados precisam existir mesmo se a origem mudar/sumir. A origem fica registrada para rastreabilidade.
- **CONTEXTO de voluntário** (nunca vem da origem; definido no cadastro): `tipos_voluntario`, `funcoes`, `data_ingresso_sistema`, `data_adesao_voluntariado`, `status`, termo.
- **Apenas pré-preenchidos** (editáveis antes de salvar): todos os DADOS-BASE acima — vêm preenchidos do candidato, mas o operador confirma/ajusta.
- **Rastreabilidade** (persistida, não editável no formulário): `origem_cadastro`, `origem_assistido_id`, `origem_user_id`.

### Tipo de voluntário
Modelado como **múltipla seleção** em `tipos_voluntario text[]` (já existente no schema), com funções relacionais por tipo. Escolha escalável: aceita novos tipos sem migração de enum e suporta múltiplos vínculos por voluntário. Invariante "pelo menos um tipo" garantida no trigger de backend e na validação mínima do frontend.

---

## 2. Regra de precedência / deduplicação na busca

`fn_buscar_pessoa_para_voluntario(p_termo)` (SECURITY DEFINER, com checagem de permissão; `RAISE EXCEPTION 'Sem permissão'`):
- Une candidatos de **assistidos** e **usuários/profiles** (`UNION ALL`) por nome, CPF ou celular normalizado.
- **Deduplicação:** `SELECT DISTINCT ON (dedupe_key)` ordenando por `dedupe_key, prio`, onde `dedupe_key` é o CPF normalizado (ou celular normalizado quando sem CPF).
- **Precedência:** `prio` faz **Assistido > Usuário** prevalecer quando a mesma pessoa existe nas duas origens → resultado único, sem duplicidade na lista.
- Cada candidato traz `ja_voluntario` (já existe vínculo ativo por `origem_assistido_id`/`origem_user_id`), exibido como aviso e botão desabilitado na UI.

---

## 3. Prevenção de voluntário duplicado (backend = verdade)

`trg_voluntario_cadastro()` (BEFORE INSERT/UPDATE) bloqueia, quando `status <> 'desligado'`:
- `origem_assistido_id` igual a voluntário ativo existente, **ou**
- `origem_user_id` igual, **ou**
- fallback por CPF / celular normalizado.
- → `RAISE EXCEPTION 'Já existe um voluntário ativo vinculado a esta pessoa (CPF, celular ou origem).'`

Reforço de UX no frontend: `encontrarVoluntarioDuplicado()` (ignora desligados e o próprio id em edição) + `ja_voluntario` na busca. O backend continua sendo a garantia final.

---

## 4. Gating do termo com pendências explícitas

- `fn_voluntario_pendencias_cadastro` / `gerenciar_termo_voluntario` bloqueiam gerar/assinar quando incompleto.
- Frontend `podeGerarTermo()` espelha as regras: `TermoVoluntarioDialog` mostra **"Complete o cadastro para gerar o termo"** + lista exata dos campos pendentes, e desabilita "Gerar/baixar termo" e "Enviar termo assinado".

---

## 5. Camadas implementadas
- **Migração:** colunas de origem, NOT NULL relaxado, `fn_voluntario_cadastro_completo`, `fn_voluntario_pendencias_cadastro`, `trg_voluntario_cadastro`, `fn_buscar_pessoa_para_voluntario`, `gerenciar_termo_voluntario` (gating), revoke público.
- **Lib pura:** `src/lib/voluntarioCadastro.ts` (validação mínima, completude, pendências, gating, prefill, dedup).
- **UI:** `VoluntarioBuscaPessoaStep` (busca antes do cadastro), `VoluntarioCadastroBadge` (selo), `VoluntarioFormDialog` (passo de busca → formulário com aviso de cadastro mínimo), `TermoVoluntarioDialog` (gating com pendências). Hook `useVoluntarios` com estado de busca/reaproveitamento.
- **Service:** `buscarPessoaParaVoluntario(termo)`.

---

## 6. Testes executados
- `src/lib/voluntarioCadastro.test.ts` — **18/18 ✅**
- `src/test/governanca/invariantes-voluntario-cadastro.test.ts` (INV-VOL-001, novo) — **5/5 ✅** (cadastro mínimo, completude, gating com pendências, reaproveitamento por origem, prevenção de duplicado).
- `tsgo --noEmit` (typecheck total) — **sem erros**.

## 7. Ausência de regressão
Confirmada: typecheck do projeto limpo; suites de voluntário verdes; nenhuma alteração em regras de negócio fora do escopo da frente. Warnings pré-existentes do linter de banco permanecem inalterados e não relacionados.
