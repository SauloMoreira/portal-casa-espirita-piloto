import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getDay } from "date-fns";
import { validarCadastroMinimo, encontrarDuplicadoPorCelular, CELULAR_DUPLICADO_MSG } from "@/lib/cadastroMinimo";
import {
  DIAS_SEMANA,
  EMPTY_ASSISTIDO_FORM,
  ENTREVISTA_MESSAGES,
} from "@/constants/fazerEntrevista";
import {
  fetchInitialData,
  fetchEntrevistaContext,
  isCpfCadastrado,
  insertAssistido,
  submitEntrevista,
  validateDatasIniciais,
} from "@/services/entrevistas/fazerEntrevista";
import type {
  EntrevistaAssistido,
  EntrevistaTipoTratamento,
  EntrevistaAssistidoForm,
  TipoEntrevista,
} from "@/types/fazerEntrevista";
import type {
  SpeechRecognitionLike,
  SpeechRecognitionConstructor,
  SpeechRecognitionEventLike,
  SpeechRecognitionErrorEventLike,
} from "@/types/speech";
import type {
  IaSugestaoEstruturada,
  IaTratamentoAtribuido,
  IaTratamentoSugerido,
} from "@/types/ia";
import { recordDecisaoFinal } from "@/services/ia/sugestoes";
import { isTratamentoHolistico, validarHorarioHolistico } from "@/lib/agendaRules";



const todayStr = () => new Date().toISOString().split("T")[0];

export function useFazerEntrevista() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [assistidos, setAssistidos] = useState<EntrevistaAssistido[]>([]);
  const [selectedAssistido, setSelectedAssistido] = useState<EntrevistaAssistido | null>(null);
  const [tratamentos, setTratamentos] = useState<EntrevistaTipoTratamento[]>([]);
  const [minPalestras, setMinPalestras] = useState(3);
  const [permitirLivre, setPermitirLivre] = useState(true);

  const [dataEntrevista, setDataEntrevista] = useState(todayStr());
  const [tipoEntrevista, setTipoEntrevista] = useState<TipoEntrevista>("regular");
  const [observacoes, setObservacoes] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [datasIniciais, setDatasIniciais] = useState<Record<string, string>>({});
  const [horarios, setHorarios] = useState<Record<string, string>>({});

  const [novoAssistidoOpen, setNovoAssistidoOpen] = useState(false);
  const [assistidoForm, setAssistidoForm] = useState<EntrevistaAssistidoForm>(EMPTY_ASSISTIDO_FORM);
  const [assistidoErrors, setAssistidoErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savingAssistido, setSavingAssistido] = useState(false);
  const [cartaOpen, setCartaOpen] = useState(false);
  const [cartaAssistidoId, setCartaAssistidoId] = useState("");
  const [cartaEntrevistaId, setCartaEntrevistaId] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSugestao, setAiSugestao] = useState("");
  const [aiSugestaoId, setAiSugestaoId] = useState<string | null>(null);
  const [aiEstruturada, setAiEstruturada] = useState<IaSugestaoEstruturada | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [agendaEntrevistaId, setAgendaEntrevistaId] = useState<string | null>(null);

  const isRecordingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptBaseRef = useRef("");

  useEffect(() => {
    const load = async () => {
      const data = await fetchInitialData();
      setAssistidos(data.assistidos);
      setTratamentos(data.tratamentos);
      setMinPalestras(data.minPalestras);
      setPermitirLivre(data.permitirLivre);

      const paramAssistidoId = searchParams.get("assistido_id");
      const paramEntrevistaId = searchParams.get("entrevista_id");
      const paramTipo = searchParams.get("tipo_entrevista");

      if (paramAssistidoId) {
        const found = data.assistidos.find((a) => a.id === paramAssistidoId);
        if (found) {
          setSelectedAssistido(found);
          setSearchTerm("");
        }
      }
      if (paramEntrevistaId) {
        setAgendaEntrevistaId(paramEntrevistaId);
        const entrevista = await fetchEntrevistaContext(paramEntrevistaId);
        if (entrevista) {
          const d = new Date(entrevista.data);
          setDataEntrevista(d.toISOString().split("T")[0]);
          if (entrevista.tipo_entrevista === "livre" || entrevista.tipo_entrevista === "regular") {
            setTipoEntrevista(entrevista.tipo_entrevista as TipoEntrevista);
          }
          if (entrevista.observacoes) {
            setObservacoes(entrevista.observacoes);
            transcriptBaseRef.current = entrevista.observacoes;
          }
        }
      }
      if (paramTipo === "livre" || paramTipo === "regular") {
        setTipoEntrevista(paramTipo);
      }
      if (paramAssistidoId || paramEntrevistaId) {
        setSearchParams({}, { replace: true });
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredAssistidos = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const s = searchTerm.toLowerCase();
    const cleanSearch = searchTerm.replace(/\D/g, "");
    return assistidos
      .filter(
        (a) =>
          a.nome.toLowerCase().includes(s) ||
          (a.cpf && cleanSearch && a.cpf.includes(cleanSearch)) ||
          (a.celular && cleanSearch && a.celular.includes(cleanSearch))
      )
      .slice(0, 10);
  }, [searchTerm, assistidos]);

  const isApto = useMemo(
    () =>
      selectedAssistido
        ? tipoEntrevista === "livre" || selectedAssistido.quantidade_palestras >= minPalestras
        : false,
    [selectedAssistido, tipoEntrevista, minPalestras]
  );

  const tratamentoMap = useMemo(
    () => Object.fromEntries(tratamentos.map((t) => [t.id, t])),
    [tratamentos]
  );

  const totalAssigned = Object.keys(quantidades).length;

  const selectAssistido = useCallback((a: EntrevistaAssistido) => {
    setSelectedAssistido(a);
    setSearchTerm("");
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedAssistido(null);
    setQuantidades({});
    setDatasIniciais({});
    setHorarios({});
    setObservacoes("");
    setTipoEntrevista("regular");
    setDataEntrevista(todayStr());
    setAiSugestao("");
    setAiSugestaoId(null);
    setAiEstruturada(null);
  }, []);

  const setQtd = useCallback((tratId: string, val: string) => {
    setQuantidades((prev) => ({ ...prev, [tratId]: val }));
  }, []);

  const setHorario = useCallback((tratId: string, val: string) => {
    setHorarios((prev) => ({ ...prev, [tratId]: val }));
  }, []);

  const toggleTratamento = useCallback(
    (tratId: string) => {
      setQuantidades((prev) => {
        if (tratId in prev) {
          const next = { ...prev };
          delete next[tratId];
          return next;
        }
        return { ...prev, [tratId]: "" };
      });
      // Pré-preenche o horário do holístico com o padrão sugerido do tipo.
      setHorarios((prev) => {
        if (tratId in prev) return prev;
        const padrao = tratamentoMap[tratId]?.horario;
        if (!padrao) return prev;
        return { ...prev, [tratId]: padrao.slice(0, 5) };
      });
    },
    [tratamentoMap],
  );

  const clearQtd = useCallback((tratId: string) => {
    setQuantidades((prev) => {
      const next = { ...prev };
      delete next[tratId];
      return next;
    });
    setHorarios((prev) => {
      const next = { ...prev };
      delete next[tratId];
      return next;
    });
  }, []);

  const setDataInicial = useCallback((tratId: string, val: string) => {
    setDatasIniciais((prev) => ({ ...prev, [tratId]: val }));
  }, []);


  const openNovoAssistido = useCallback(() => {
    setNovoAssistidoOpen(true);
    setAssistidoForm(EMPTY_ASSISTIDO_FORM);
    setAssistidoErrors({});
  }, []);

  const validateAssistidoForm = (form: EntrevistaAssistidoForm) => {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Nome obrigatório";
    if (!form.cpf.trim()) e.cpf = "CPF obrigatório";
    else if (!isValidCPF(form.cpf)) e.cpf = "CPF inválido";
    if (!form.celular.trim()) e.celular = "Celular obrigatório";
    else if (!isValidPhone(form.celular)) e.celular = "Celular inválido";
    if (form.email && !isValidEmail(form.email)) e.email = "E-mail inválido";
    return e;
  };

  const handleSaveNovoAssistido = useCallback(async () => {
    const errs = validateAssistidoForm(assistidoForm);
    setAssistidoErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSavingAssistido(true);

    const cpfClean = assistidoForm.cpf.replace(/\D/g, "");
    if (await isCpfCadastrado(cpfClean)) {
      setAssistidoErrors({ cpf: ENTREVISTA_MESSAGES.cpfJaCadastrado });
      setSavingAssistido(false);
      return;
    }

    const payload = {
      nome: assistidoForm.nome.trim(),
      cpf: cpfClean,
      celular: assistidoForm.celular.replace(/\D/g, ""),
      telefone: assistidoForm.celular.replace(/\D/g, ""),
      email: assistidoForm.email.trim() || null,
      data_nascimento: assistidoForm.data_nascimento || null,
      cep: assistidoForm.cep.replace(/\D/g, "") || null,
      logradouro: assistidoForm.logradouro.trim() || null,
      numero: assistidoForm.numero.trim() || null,
      complemento: assistidoForm.complemento.trim() || null,
      bairro: assistidoForm.bairro.trim() || null,
      cidade: assistidoForm.cidade.trim() || null,
      estado: assistidoForm.estado.trim().toUpperCase() || null,
      foto_url: assistidoForm.foto_url || null,
      observacoes: assistidoForm.observacoes || null,
      status: "ativo",
      created_by: user!.id,
    };

    const { data: newAssist, error } = await insertAssistido(payload);
    if (error) {
      const msg = error.message.includes("violates")
        ? "Não foi possível cadastrar o assistido. Verifique os dados e tente novamente."
        : error.message;
      toast({ title: "Erro ao cadastrar", description: msg, variant: "destructive" });
    } else if (newAssist) {
      setAssistidos((prev) => [...prev, newAssist].sort((a, b) => a.nome.localeCompare(b.nome)));
      setSelectedAssistido(newAssist);
      setNovoAssistidoOpen(false);
      setAssistidoForm(EMPTY_ASSISTIDO_FORM);
      toast({ title: "Assistido cadastrado" });
    }
    setSavingAssistido(false);
  }, [assistidoForm, user, toast]);

  const handleSalvar = useCallback(async () => {
    if (!selectedAssistido) {
      toast({ title: ENTREVISTA_MESSAGES.selecioneAssistido, variant: "destructive" });
      return;
    }
    if (!isApto) {
      toast({ title: ENTREVISTA_MESSAGES.naoApto, variant: "destructive" });
      return;
    }
    if (!dataEntrevista) {
      toast({ title: ENTREVISTA_MESSAGES.informeData, variant: "destructive" });
      return;
    }

    const dateCheck = validateDatasIniciais(quantidades, datasIniciais, tratamentoMap, DIAS_SEMANA);
    if (dateCheck.ok === false) {
      toast({
        title: "Data incompatível",
        description: `A data informada para "${dateCheck.tratamento}" não é ${dateCheck.dia}`,
        variant: "destructive",
      });
      return;
    }

    // Holístico exige horário da consulta (validação UI; backend revalida).
    for (const tratId of Object.keys(quantidades)) {
      const trat = tratamentoMap[tratId];
      if (!trat) continue;
      if (
        isTratamentoHolistico(trat.tipo) &&
        !validarHorarioHolistico({ holistico: true, horario: horarios[tratId] }).valido
      ) {
        toast({
          title: "Horário obrigatório",
          description: `Informe o horário da consulta para "${trat.nome}".`,
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const result = await submitEntrevista({
        selectedAssistido,
        userId: user!.id,
        dataEntrevista,
        tipoEntrevista,
        observacoes,
        quantidades,
        datasIniciais,
        horarios,
        tratamentoMap,
        agendaEntrevistaId,
      });


      toast({
        title: "Entrevista salva com sucesso!",
        description: `${result.validDesignacoesCount} tratamento(s) designado(s)`,
      });

      if (result.validDesignacoesCount > 0) {
        setCartaAssistidoId(selectedAssistido.id);
        setCartaEntrevistaId(result.entrevistaId);
        setCartaOpen(true);
      }

      // Fecha o ciclo supervisionado da IA: registra a decisão final humana
      // (comparação sugestão x atribuição) quando houve sugestão da IA.
      if (aiSugestaoId && aiEstruturada) {
        try {
          const atribuidos: IaTratamentoAtribuido[] = Object.entries(quantidades)
            .filter(([, q]) => Number(q) > 0)
            .map(([tratId, q]) => ({
              tratamento_id: tratId,
              nome: tratamentoMap[tratId]?.nome ?? tratId,
              quantidade: Number(q),
            }));
          await recordDecisaoFinal({
            sugestaoId: aiSugestaoId,
            avaliadorId: user!.id,
            sugeridos: aiEstruturada.tratamentos_sugeridos as IaTratamentoSugerido[],
            atribuidos,
          });
        } catch (fbErr) {
          console.error("Erro ao registrar feedback da IA:", fbErr);
        }
      }

      clearSelection();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar entrevista";
      toast({ title: "Erro ao salvar entrevista", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [
    selectedAssistido,
    isApto,
    dataEntrevista,
    quantidades,
    datasIniciais,
    horarios,
    tratamentoMap,
    user,
    tipoEntrevista,
    observacoes,
    agendaEntrevistaId,
    aiSugestaoId,
    aiEstruturada,
    toast,
    clearSelection,
  ]);

  const handleAiAssistant = useCallback(async () => {
    if (!observacoes.trim()) {
      toast({ title: ENTREVISTA_MESSAGES.preenchaObservacoes, variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiSugestao("");
    setAiSugestaoId(null);
    setAiEstruturada(null);
    setAiOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("assistente-entrevista", {
        body: {
          observacoes,
          assistido_nome: selectedAssistido?.nome || "",
          assistido_id: selectedAssistido?.id || null,
          entrevista_id: agendaEntrevistaId,
          tratamentos_disponiveis: tratamentos.map((t) => ({
            id: t.id,
            nome: t.nome,
            tipo: t.tipo,
            quantidade_padrao_sessoes: t.quantidade_padrao_sessoes,
          })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAiSugestao(data.sugestao || "Sem resposta.");
      setAiSugestaoId(data.sugestao_id ?? null);
      setAiEstruturada(data.estruturada ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao consultar assistente";
      setAiSugestao(`❌ ${msg}`);
      toast({ title: "Erro no assistente IA", description: msg, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }, [observacoes, selectedAssistido, agendaEntrevistaId, tratamentos, toast]);

  /**
   * Aplica os tratamentos sugeridos pela IA ao formulário (pré-preenchimento).
   * Nunca atribui automaticamente: apenas preenche os campos para o
   * entrevistador revisar, ajustar ou remover antes de salvar.
   */
  const applySugestaoIA = useCallback(() => {
    if (!aiEstruturada) return;
    const validos = aiEstruturada.tratamentos_sugeridos.filter(
      (t) => t.tratamento_id && tratamentoMap[t.tratamento_id],
    );
    if (validos.length === 0) {
      toast({ title: "Nenhum tratamento sugerido pôde ser aplicado", variant: "destructive" });
      return;
    }
    setQuantidades((prev) => {
      const next = { ...prev };
      for (const t of validos) {
        const q = Number(t.quantidade) > 0 ? String(t.quantidade) : "";
        next[t.tratamento_id as string] = q;
      }
      return next;
    });
    setAiOpen(false);
    toast({ title: `${validos.length} tratamento(s) pré-preenchido(s)`, description: "Revise e ajuste antes de salvar." });
  }, [aiEstruturada, tratamentoMap, toast]);

  const setObservacoesManual = useCallback((value: string) => {
    transcriptBaseRef.current = value;
    setObservacoes(value);
  }, []);

  const toggleRecording = useCallback(async () => {
    const SpeechRecognitionImpl =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      toast({
        title: ENTREVISTA_MESSAGES.navegadorSemVoz,
        description: "Use o Google Chrome para essa funcionalidade.",
        variant: "destructive",
      });
      return;
    }

    if (isRecording) {
      isRecordingRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      return;
    }

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch {
      toast({
        title: "Microfone bloqueado",
        description: "Permita o acesso ao microfone nas configurações do navegador.",
        variant: "destructive",
      });
      return;
    }

    transcriptBaseRef.current = observacoes.trim();

    const startRecognition = () => {
      const recognition = new SpeechRecognitionImpl();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = String(event.results[i][0]?.transcript || "").trim();
          if (!transcript) continue;
          if (event.results[i].isFinal) {
            transcriptBaseRef.current = [transcriptBaseRef.current, transcript]
              .filter(Boolean)
              .join(" ")
              .trim();
          } else {
            interimTranscript = [interimTranscript, transcript].filter(Boolean).join(" ").trim();
          }
        }
        const combined = [transcriptBaseRef.current, interimTranscript]
          .filter(Boolean)
          .join(" ")
          .trim();
        setObservacoes(combined);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        console.error("Speech recognition error:", event.error);
        if (["not-allowed", "service-not-allowed"].includes(event.error)) {
          isRecordingRef.current = false;
          recognitionRef.current = null;
          setIsRecording(false);
          toast({
            title: "Microfone bloqueado",
            description: "Permita o acesso ao microfone nas configurações do navegador.",
            variant: "destructive",
          });
          return;
        }
        if (event.error === "audio-capture") {
          isRecordingRef.current = false;
          recognitionRef.current = null;
          setIsRecording(false);
          toast({
            title: "Microfone não encontrado",
            description: "Verifique se há um microfone disponível e ativo no dispositivo.",
            variant: "destructive",
          });
          return;
        }
        if (event.error === "aborted" && !isRecordingRef.current) return;
        if (event.error !== "no-speech" && event.error !== "aborted") {
          isRecordingRef.current = false;
          recognitionRef.current = null;
          setIsRecording(false);
          toast({
            title: "Erro no reconhecimento de voz",
            description: event.error,
            variant: "destructive",
          });
        }
      };

      recognition.onend = () => {
        if (!isRecordingRef.current) {
          recognitionRef.current = null;
          setIsRecording(false);
          return;
        }
        window.setTimeout(() => {
          if (isRecordingRef.current) startRecognition();
        }, 250);
      };

      recognition.start();
    };

    isRecordingRef.current = true;
    setIsRecording(true);
    startRecognition();
    toast({
      title: "🎙️ Gravando...",
      description: "Fale normalmente. O texto será transcrito automaticamente.",
    });
  }, [isRecording, observacoes, toast]);

  return {
    // state
    searchTerm,
    setSearchTerm,
    assistidos,
    selectedAssistido,
    tratamentos,
    minPalestras,
    permitirLivre,
    dataEntrevista,
    setDataEntrevista,
    tipoEntrevista,
    setTipoEntrevista,
    observacoes,
    setObservacoesManual,
    quantidades,
    datasIniciais,
    horarios,
    novoAssistidoOpen,
    setNovoAssistidoOpen,
    assistidoForm,
    setAssistidoForm,
    assistidoErrors,
    saving,
    savingAssistido,
    cartaOpen,
    setCartaOpen,
    cartaAssistidoId,
    cartaEntrevistaId,
    aiOpen,
    setAiOpen,
    aiLoading,
    aiSugestao,
    aiEstruturada,
    aiSugestaoId,
    isRecording,
    // derived
    filteredAssistidos,
    isApto,
    totalAssigned,
    // actions
    selectAssistido,
    clearSelection,
    setQtd,
    setHorario,
    toggleTratamento,
    clearQtd,
    setDataInicial,
    openNovoAssistido,
    handleSaveNovoAssistido,
    handleSalvar,
    handleAiAssistant,
    applySugestaoIA,
    toggleRecording,
  };
}

export type UseFazerEntrevistaReturn = ReturnType<typeof useFazerEntrevista>;
