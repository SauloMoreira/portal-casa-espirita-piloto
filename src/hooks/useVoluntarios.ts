/**
 * Domain hook for the Voluntários page. Concentrates list loading, filters,
 * search, selection, create/edit form state, submission and dialog control.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRange, DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  isValidCPF,
  isValidEmail,
  isValidPhone,
  maskCPF,
  maskPhone,
} from "@/lib/validators";
import {
  emptyVoluntarioForm,
  FILTER_TODOS,
  VOLUNTARIO_MESSAGES,
} from "@/constants/voluntarios";
import {
  fetchFuncoesAtivas,
  fetchFuncoesIdsByVoluntario,
  fetchInstituicaoConfig,
  fetchVoluntarioFuncoesMap,
  fetchVoluntarios,
  fetchVoluntariosComAcessoOperacional,
  isCpfDuplicado,
  replaceVoluntarioFuncoes,
  saveVoluntario,
  inactivateVoluntario,
  reactivateVoluntario,
  marcarTermoGerado,
  buscarPessoaParaVoluntario,
} from "@/services/voluntarios/voluntariosService";
import {
  mapearPessoaParaPrefill,
  type PessoaCandidata,
} from "@/lib/voluntarioCadastro";
import { friendlyVoluntarioError } from "@/lib/voluntarioErrors";

import type {
  FuncaoVoluntariado,
  VoluntarioFilterState,
  VoluntarioFormErrors,
  VoluntarioFormState,
  VoluntarioFuncoesMap,
  VoluntarioListItem,
} from "@/types/voluntarios";

export function useVoluntarios() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [voluntarios, setVoluntarios] = useState<VoluntarioListItem[]>([]);
  const [acessoOperacionalIds, setAcessoOperacionalIds] = useState<Set<string>>(new Set());
  const [allFuncoes, setAllFuncoes] = useState<FuncaoVoluntariado[]>([]);
  const [voluntarioFuncoesMap, setVoluntarioFuncoesMap] = useState<VoluntarioFuncoesMap>({});
  const [instData, setInstData] = useState<Record<string, unknown> | null>(null);

  // FIX05 — orientação pós-cadastro (atuação × acesso).
  const [posCadastroOpen, setPosCadastroOpen] = useState(false);
  const [posCadastroNome, setPosCadastroNome] = useState("");

  const [filters, setFilters] = useState<VoluntarioFilterState>({
    search: "",
    status: FILTER_TODOS,
    tipo: FILTER_TODOS,
    funcao: FILTER_TODOS,
    termo: FILTER_TODOS,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VoluntarioFormState>(emptyVoluntarioForm);
  const [errors, setErrors] = useState<VoluntarioFormErrors>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Busca de pessoa existente (passo inicial do novo cadastro).
  const [buscaAtiva, setBuscaAtiva] = useState(false);
  const [buscaTermo, setBuscaTermo] = useState("");
  const [buscaResultados, setBuscaResultados] = useState<PessoaCandidata[]>([]);
  const [buscaLoading, setBuscaLoading] = useState(false);

  const [termoOpen, setTermoOpen] = useState(false);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [selectedVoluntario, setSelectedVoluntario] = useState<VoluntarioListItem | null>(null);

  const [termoFlowOpen, setTermoFlowOpen] = useState(false);
  const [termoFlowVoluntario, setTermoFlowVoluntario] = useState<VoluntarioListItem | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VoluntarioListItem | null>(null);

  const reloadVoluntarios = useCallback(async () => {
    const lista = await fetchVoluntarios();
    setVoluntarios(lista);
    try {
      setAcessoOperacionalIds(await fetchVoluntariosComAcessoOperacional(lista));
    } catch {
      setAcessoOperacionalIds(new Set());
    }
  }, []);

  const reloadFuncoesMap = useCallback(async () => {
    setVoluntarioFuncoesMap(await fetchVoluntarioFuncoesMap());
  }, []);

  useEffect(() => {
    reloadVoluntarios();
    fetchInstituicaoConfig().then(setInstData);
    fetchFuncoesAtivas().then(setAllFuncoes);
    reloadFuncoesMap();
  }, [reloadVoluntarios, reloadFuncoesMap]);

  const setFilter = useCallback(
    <K extends keyof VoluntarioFilterState>(key: K, value: VoluntarioFilterState[K]) =>
      setFilters((prev) => ({ ...prev, [key]: value })),
    [],
  );

  // Keep the open termo-flow dialog in sync with refreshed data.
  useEffect(() => {
    setTermoFlowVoluntario((prev) =>
      prev ? voluntarios.find((v) => v.id === prev.id) ?? prev : prev,
    );
  }, [voluntarios]);

  // Cadastro MÍNIMO: só Nome, Celular válido e ao menos um tipo são exigidos.
  // Demais campos validam formato apenas quando preenchidos (completar depois).
  const validate = useCallback((): boolean => {
    const e: VoluntarioFormErrors = {};
    const m = VOLUNTARIO_MESSAGES;
    if (!form.nome_completo.trim()) e.nome_completo = m.required;
    if (!form.celular.trim()) e.celular = m.required;
    else if (!isValidPhone(form.celular)) e.celular = m.invalidPhone;
    if (form.tipos_voluntario.length === 0) e.tipos_voluntario = m.selectTipo;
    if (!form.data_ingresso_sistema) e.data_ingresso_sistema = m.required;
    // Opcionais: validam formato só quando informados.
    if (form.cpf.trim() && !isValidCPF(form.cpf)) e.cpf = m.invalidCpf;
    if (form.email.trim() && !isValidEmail(form.email)) e.email = m.invalidEmail;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);


  const handleSave = useCallback(async () => {
    if (!validate() || !user) return;
    setLoading(true);
    const cpfClean = form.cpf.replace(/\D/g, "");

    try {
      if (cpfClean && (await isCpfDuplicado(cpfClean, editId))) {
        setErrors({ cpf: VOLUNTARIO_MESSAGES.cpfDuplicado });
        setLoading(false);
        return;
      }

      // Mínimo persiste só o essencial; complementares ficam null até completar.
      const orNull = (v: string) => (v.trim() ? v.trim() : null);
      const payload = {
        nome_completo: form.nome_completo.trim(),
        celular: form.celular.replace(/\D/g, ""),
        cpf: cpfClean || null,
        email: form.email.trim() ? form.email.trim().toLowerCase() : null,
        rg: orNull(form.rg),
        data_nascimento: form.data_nascimento || null,
        cep: form.cep.replace(/\D/g, "") || null,
        logradouro: orNull(form.logradouro),
        numero: orNull(form.numero),
        complemento: orNull(form.complemento),
        bairro: orNull(form.bairro),
        cidade: orNull(form.cidade),
        estado: form.estado.trim() ? form.estado.trim().toUpperCase() : null,
        foto_url: form.foto_url,
        data_ingresso_sistema: form.data_ingresso_sistema,
        data_adesao_voluntariado: form.data_adesao_voluntariado || null,
        tipos_voluntario: form.tipos_voluntario,
        atuacao_detalhada: orNull(form.atuacao_detalhada),
        status: form.status,
        data_desligamento: form.data_desligamento || null,
        observacoes: orNull(form.observacoes),
        origem_cadastro: form.origem_cadastro,
        origem_assistido_id: form.origem_assistido_id,
        origem_user_id: form.origem_user_id,
      };



      const savedId = await saveVoluntario(payload, editId, user.id);
      await replaceVoluntarioFuncoes(savedId, form.funcoes_ids);

      const wasCreate = !editId;
      const nomeSalvo = form.nome_completo.trim();
      toast({ title: editId ? VOLUNTARIO_MESSAGES.updated : VOLUNTARIO_MESSAGES.created });
      if (wasCreate) {
        setPosCadastroNome(nomeSalvo);
        setPosCadastroOpen(true);
      }
      setOpen(false);
      setForm(emptyVoluntarioForm);
      setEditId(null);
      await reloadVoluntarios();
      await reloadFuncoesMap();
    } catch (error) {
      toast({
        title: VOLUNTARIO_MESSAGES.saveError,
        description: friendlyVoluntarioError(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }

  }, [validate, user, form, editId, toast, reloadVoluntarios, reloadFuncoesMap]);

  const openEdit = useCallback(async (v: VoluntarioListItem) => {
    setEditId(v.id);
    const funcIds = await fetchFuncoesIdsByVoluntario(v.id);
    setForm({
      nome_completo: v.nome_completo,
      celular: maskPhone(v.celular || ""),
      cpf: maskCPF(v.cpf || ""),
      email: v.email || "",
      rg: v.rg || "",
      data_nascimento: v.data_nascimento || "",
      cep: v.cep || "",
      logradouro: v.logradouro || "",
      numero: v.numero || "",
      complemento: v.complemento || "",
      bairro: v.bairro || "",
      cidade: v.cidade || "",
      estado: v.estado || "",
      foto_url: v.foto_url,
      data_ingresso_sistema: v.data_ingresso_sistema,
      data_adesao_voluntariado: v.data_adesao_voluntariado || "",
      tipos_voluntario: v.tipos_voluntario || [],
      funcoes_ids: funcIds,
      atuacao_detalhada: v.atuacao_detalhada || "",
      status: v.status,
      data_desligamento: v.data_desligamento || "",
      observacoes: v.observacoes || "",
      origem_cadastro: v.origem_cadastro ?? null,
      origem_assistido_id: v.origem_assistido_id ?? null,
      origem_user_id: v.origem_user_id ?? null,
    });
    setErrors({});
    setBuscaAtiva(false);
    setOpen(true);
  }, []);

  const openNew = useCallback(() => {
    setEditId(null);
    setForm(emptyVoluntarioForm);
    setErrors({});
    setBuscaAtiva(true); // novo cadastro começa pela busca de pessoa existente
    setOpen(true);
  }, []);

  // Aplica os DADOS-BASE de uma pessoa existente ao formulário (reaproveitamento).
  const aplicarPessoa = useCallback((pessoa: PessoaCandidata) => {
    const pre = mapearPessoaParaPrefill(pessoa);
    setEditId(null);
    setForm({
      ...emptyVoluntarioForm,
      nome_completo: pre.nome_completo,
      celular: maskPhone(pre.celular),
      cpf: maskCPF(pre.cpf),
      email: pre.email,
      data_nascimento: pre.data_nascimento,
      cep: pre.cep,
      logradouro: pre.logradouro,
      numero: pre.numero,
      complemento: pre.complemento,
      bairro: pre.bairro,
      cidade: pre.cidade,
      estado: pre.estado,
      foto_url: pre.foto_url,
      origem_cadastro: pre.origem_cadastro,
      origem_assistido_id: pre.origem_assistido_id,
      origem_user_id: pre.origem_user_id,
    });
    setErrors({});
    setBuscaAtiva(false);
  }, []);

  // Segue para cadastro do zero (ignora a busca).
  const cadastrarDoZero = useCallback(() => {
    setForm(emptyVoluntarioForm);
    setBuscaAtiva(false);
  }, []);


  const openFicha = useCallback((v: VoluntarioListItem) => {
    setSelectedVoluntario(v);
    setFichaOpen(true);
  }, []);

  const openTermo = useCallback((v: VoluntarioListItem) => {
    setSelectedVoluntario(v);
    setTermoOpen(true);
  }, []);

  // Opens the full termo-flow dialog (status, upload, validate/reject, view).
  const openTermoFlow = useCallback((v: VoluntarioListItem) => {
    setTermoFlowVoluntario(v);
    setTermoFlowOpen(true);
  }, []);

  // From inside the flow: open the printable filled termo and mark it generated.
  const openTermoPrint = useCallback(async () => {
    if (!termoFlowVoluntario) return;
    setSelectedVoluntario(termoFlowVoluntario);
    setTermoOpen(true);
    try {
      const res = await marcarTermoGerado(termoFlowVoluntario.id);
      if (!res?.error) await reloadVoluntarios();
    } catch {
      /* generation marking is best-effort; printing still works */
    }
  }, [termoFlowVoluntario, reloadVoluntarios]);

  const onTermoChanged = useCallback(async () => {
    await reloadVoluntarios();
  }, [reloadVoluntarios]);

  const handleInactivate = useCallback(
    async (v: VoluntarioListItem, motivo?: string | null) => {
      try {
        const res = await inactivateVoluntario(v.id, motivo);
        if (res?.error) throw new Error(res.error);
        toast({ title: "Voluntário inativado", description: res?.message });
        await reloadVoluntarios();
      } catch (error) {
        toast({ title: "Erro ao inativar", description: (error as Error).message, variant: "destructive" });
      }
    },
    [toast, reloadVoluntarios],
  );

  const handleReactivate = useCallback(
    async (v: VoluntarioListItem) => {
      try {
        const res = await reactivateVoluntario(v.id);
        if (res?.error) throw new Error(res.error);
        toast({ title: "Voluntário reativado", description: res?.message });
        await reloadVoluntarios();
      } catch (error) {
        toast({ title: "Erro ao reativar", description: (error as Error).message, variant: "destructive" });
      }
    },
    [toast, reloadVoluntarios],
  );

  const openDelete = useCallback((v: VoluntarioListItem) => {
    setDeleteTarget(v);
    setDeleteOpen(true);
  }, []);

  const onDeleted = useCallback(async () => {
    await reloadVoluntarios();
    await reloadFuncoesMap();
  }, [reloadVoluntarios, reloadFuncoesMap]);

  const getFuncaoNames = useCallback(
    (volId: string) => {
      const ids = voluntarioFuncoesMap[volId] || [];
      return allFuncoes.filter((f) => ids.includes(f.id)).map((f) => f.nome_funcao);
    },
    [voluntarioFuncoesMap, allFuncoes],
  );

  const availableFuncoes = useMemo(
    () => allFuncoes.filter((f) => form.tipos_voluntario.includes(f.tipo_voluntario)),
    [allFuncoes, form.tipos_voluntario],
  );

  const filtered = useMemo(() => {
    const searchLower = filters.search.toLowerCase();
    const digits = filters.search.replace(/\D/g, "");
    return voluntarios.filter((v) => {
      const matchesSearch =
        !filters.search ||
        v.nome_completo.toLowerCase().includes(searchLower) ||
        (v.cpf || "").includes(digits) ||
        (v.celular || "").includes(digits) ||
        (v.email || "").toLowerCase().includes(searchLower);
      const matchesStatus = filters.status === FILTER_TODOS || v.status === filters.status;
      const matchesTipo =
        filters.tipo === FILTER_TODOS ||
        (v.tipos_voluntario && v.tipos_voluntario.includes(filters.tipo));
      const matchesFuncao =
        filters.funcao === FILTER_TODOS ||
        (voluntarioFuncoesMap[v.id] || []).includes(filters.funcao);
      const matchesTermo =
        filters.termo === FILTER_TODOS || (v.termo_status || "nao_gerado") === filters.termo;
      return matchesSearch && matchesStatus && matchesTipo && matchesFuncao && matchesTermo;
    });
  }, [voluntarios, filters, voluntarioFuncoesMap]);

  // Paginação (sobre o conjunto já filtrado, preservando o filtro por função).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.status, filters.tipo, filters.funcao, filters.termo, pageSize]);

  const total = filtered.length;
  const paginated = useMemo(() => {
    const { from, to } = getRange(page, pageSize);
    return filtered.slice(from, to + 1);
  }, [filtered, page, pageSize]);


  const toggleTipo = useCallback((tipo: string) => {
    setForm((prev) => ({
      ...prev,
      tipos_voluntario: prev.tipos_voluntario.includes(tipo)
        ? prev.tipos_voluntario.filter((t) => t !== tipo)
        : [...prev.tipos_voluntario, tipo],
    }));
  }, []);

  const toggleFuncao = useCallback((funcaoId: string) => {
    setForm((prev) => ({
      ...prev,
      funcoes_ids: prev.funcoes_ids.includes(funcaoId)
        ? prev.funcoes_ids.filter((id) => id !== funcaoId)
        : [...prev.funcoes_ids, funcaoId],
    }));
  }, []);

  const buscarPessoas = useCallback(async () => {
    const termo = buscaTermo.trim();
    if (termo.replace(/\D/g, "").length < 3 && termo.length < 3) {
      setBuscaResultados([]);
      return;
    }
    setBuscaLoading(true);
    try {
      setBuscaResultados(await buscarPessoaParaVoluntario(termo));
    } catch (error) {
      toast({ title: "Erro na busca", description: (error as Error).message, variant: "destructive" });
    } finally {
      setBuscaLoading(false);
    }
  }, [buscaTermo, toast]);


  return {
    // data
    allFuncoes,
    instData,
    filtered,
    paginated,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    availableFuncoes,
    getFuncaoNames,
    // filters
    filters,
    setFilter,
    // form / dialog
    open,
    setOpen,
    form,
    setForm,
    errors,
    editId,
    loading,
    handleSave,
    openEdit,
    openNew,
    toggleTipo,
    toggleFuncao,
    // busca / reaproveitamento
    buscaAtiva,
    setBuscaAtiva,
    buscaTermo,
    setBuscaTermo,
    buscaResultados,
    buscaLoading,
    buscarPessoas,
    aplicarPessoa,
    cadastrarDoZero,

    // termo / ficha
    termoOpen,
    setTermoOpen,
    fichaOpen,
    setFichaOpen,
    selectedVoluntario,
    openFicha,
    openTermo,
    // termo flow
    termoFlowOpen,
    setTermoFlowOpen,
    termoFlowVoluntario,
    openTermoFlow,
    openTermoPrint,
    onTermoChanged,
    // lifecycle
    handleInactivate,
    handleReactivate,
    openDelete,
    deleteOpen,
    setDeleteOpen,
    deleteTarget,
    onDeleted,
  };
}
