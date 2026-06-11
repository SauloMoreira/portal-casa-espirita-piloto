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
  isCpfDuplicado,
  replaceVoluntarioFuncoes,
  saveVoluntario,
} from "@/services/voluntarios/voluntariosService";
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
  const [allFuncoes, setAllFuncoes] = useState<FuncaoVoluntariado[]>([]);
  const [voluntarioFuncoesMap, setVoluntarioFuncoesMap] = useState<VoluntarioFuncoesMap>({});
  const [instData, setInstData] = useState<Record<string, unknown> | null>(null);

  const [filters, setFilters] = useState<VoluntarioFilterState>({
    search: "",
    status: FILTER_TODOS,
    tipo: FILTER_TODOS,
    funcao: FILTER_TODOS,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VoluntarioFormState>(emptyVoluntarioForm);
  const [errors, setErrors] = useState<VoluntarioFormErrors>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [termoOpen, setTermoOpen] = useState(false);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [selectedVoluntario, setSelectedVoluntario] = useState<VoluntarioListItem | null>(null);

  const reloadVoluntarios = useCallback(async () => {
    setVoluntarios(await fetchVoluntarios());
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

  const validate = useCallback((): boolean => {
    const e: VoluntarioFormErrors = {};
    const m = VOLUNTARIO_MESSAGES;
    if (!form.nome_completo.trim()) e.nome_completo = m.required;
    if (!form.celular.trim()) e.celular = m.required;
    else if (!isValidPhone(form.celular)) e.celular = m.invalidPhone;
    if (!form.cpf.trim()) e.cpf = m.required;
    else if (!isValidCPF(form.cpf)) e.cpf = m.invalidCpf;
    if (!form.email.trim()) e.email = m.required;
    else if (!isValidEmail(form.email)) e.email = m.invalidEmail;
    if (!form.data_nascimento) e.data_nascimento = m.required;
    if (!form.data_ingresso_sistema) e.data_ingresso_sistema = m.required;
    if (!form.cep.trim()) e.cep = m.required;
    if (!form.logradouro.trim()) e.logradouro = m.required;
    if (!form.numero.trim()) e.numero = m.required;
    if (!form.bairro.trim()) e.bairro = m.required;
    if (!form.cidade.trim()) e.cidade = m.required;
    if (!form.estado.trim()) e.estado = m.required;
    if (form.tipos_voluntario.length === 0) e.tipos_voluntario = m.selectTipo;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  const handleSave = useCallback(async () => {
    if (!validate() || !user) return;
    setLoading(true);
    const cpfClean = form.cpf.replace(/\D/g, "");

    try {
      if (await isCpfDuplicado(cpfClean, editId)) {
        setErrors({ cpf: VOLUNTARIO_MESSAGES.cpfDuplicado });
        setLoading(false);
        return;
      }

      const payload = {
        nome_completo: form.nome_completo.trim(),
        celular: form.celular.replace(/\D/g, ""),
        cpf: cpfClean,
        email: form.email.trim().toLowerCase(),
        rg: form.rg.trim() || null,
        data_nascimento: form.data_nascimento,
        cep: form.cep.replace(/\D/g, ""),
        logradouro: form.logradouro.trim(),
        numero: form.numero.trim(),
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim(),
        cidade: form.cidade.trim(),
        estado: form.estado.trim().toUpperCase(),
        foto_url: form.foto_url,
        data_ingresso_sistema: form.data_ingresso_sistema,
        data_adesao_voluntariado: form.data_adesao_voluntariado || null,
        tipos_voluntario: form.tipos_voluntario,
        atuacao_detalhada: form.atuacao_detalhada.trim() || null,
        status: form.status,
        data_desligamento: form.data_desligamento || null,
        observacoes: form.observacoes.trim() || null,
      };

      const savedId = await saveVoluntario(payload, editId, user.id);
      await replaceVoluntarioFuncoes(savedId, form.funcoes_ids);

      toast({ title: editId ? VOLUNTARIO_MESSAGES.updated : VOLUNTARIO_MESSAGES.created });
      setOpen(false);
      setForm(emptyVoluntarioForm);
      setEditId(null);
      await reloadVoluntarios();
      await reloadFuncoesMap();
    } catch (error) {
      toast({
        title: VOLUNTARIO_MESSAGES.saveError,
        description: (error as Error).message,
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
      celular: maskPhone(v.celular),
      cpf: maskCPF(v.cpf),
      email: v.email,
      rg: v.rg || "",
      data_nascimento: v.data_nascimento,
      cep: v.cep,
      logradouro: v.logradouro,
      numero: v.numero,
      complemento: v.complemento || "",
      bairro: v.bairro,
      cidade: v.cidade,
      estado: v.estado,
      foto_url: v.foto_url,
      data_ingresso_sistema: v.data_ingresso_sistema,
      data_adesao_voluntariado: v.data_adesao_voluntariado || "",
      tipos_voluntario: v.tipos_voluntario || [],
      funcoes_ids: funcIds,
      atuacao_detalhada: v.atuacao_detalhada || "",
      status: v.status,
      data_desligamento: v.data_desligamento || "",
      observacoes: v.observacoes || "",
    });
    setErrors({});
    setOpen(true);
  }, []);

  const openNew = useCallback(() => {
    setEditId(null);
    setForm(emptyVoluntarioForm);
    setErrors({});
    setOpen(true);
  }, []);

  const openFicha = useCallback((v: VoluntarioListItem) => {
    setSelectedVoluntario(v);
    setFichaOpen(true);
  }, []);

  const openTermo = useCallback((v: VoluntarioListItem) => {
    setSelectedVoluntario(v);
    setTermoOpen(true);
  }, []);

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
        v.cpf.includes(digits) ||
        v.celular.includes(digits) ||
        v.email.toLowerCase().includes(searchLower);
      const matchesStatus = filters.status === FILTER_TODOS || v.status === filters.status;
      const matchesTipo =
        filters.tipo === FILTER_TODOS ||
        (v.tipos_voluntario && v.tipos_voluntario.includes(filters.tipo));
      const matchesFuncao =
        filters.funcao === FILTER_TODOS ||
        (voluntarioFuncoesMap[v.id] || []).includes(filters.funcao);
      return matchesSearch && matchesStatus && matchesTipo && matchesFuncao;
    });
  }, [voluntarios, filters, voluntarioFuncoesMap]);

  // Paginação (sobre o conjunto já filtrado, preservando o filtro por função).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.status, filters.tipo, filters.funcao, pageSize]);

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

  return {
    // data
    allFuncoes,
    instData,
    filtered,
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
    // termo / ficha
    termoOpen,
    setTermoOpen,
    fichaOpen,
    setFichaOpen,
    selectedVoluntario,
    openFicha,
    openTermo,
  };
}
