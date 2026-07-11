import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { useToast } from "@/hooks/use-toast";
import { getDay } from "date-fns";
import { validarCadastroMinimo, encontrarDuplicadoPorCelular, CELULAR_DUPLICADO_MSG } from "@/lib/cadastroMinimo";
import { toFriendlyError, TENANT_AUSENTE_ERROR } from "@/lib/supabaseFriendlyErrors";
import { showFriendlyErrorToast } from "@/lib/toastChamadoTecnico";
import {
  DIAS_SEMANA,
  EMPTY_ASSISTIDO_FORM,
  ENTREVISTA_MESSAGES,
  MODO_AGENDAMENTO,
} from "@/constants/fazerEntrevista";
import {
  fetchInitialData,
  fetchEntrevistaContext,
  submitEntrevista,
  validateDatasIniciais,
} from "@/services/entrevistas/fazerEntrevista";
import {
  criarAssistidoTenant,
  fetchAssistidoRecemCriado,
} from "@/services/assistidos/criarAssistidoTenant";
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
import { computeDiferencas } from "@/lib/iaAssertividade";
import { isTratamentoHolistico, validarHorarioHolistico } from "@/lib/agendaRules";



const todayStr = () => new Date().toISOString().split("T")[0];

export function useFazerEntrevista() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { selectedInstituicaoId } = useInstituicaoAtiva();
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
  const [aiMotivoAjuste, setAiMotivoAjuste] = useState("");
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

  // Divergência entre a sugestão da IA e a decisão atual do entrevistador.
  // Só é relevante quando existe uma sugestão da IA carregada. Usada apenas
  // para exibir, de forma opcional, o campo de motivo de ajuste/rejeição.
  const aiHasDivergencia = useMemo(() => {
    if (!aiSugestaoId || !aiEstruturada) return false;
    const atribuidos: IaTratamentoAtribuido[] = Object.entries(quantidades)
      .filter(([, q]) => Number(q) > 0)
      .map(([tratId, q]) => ({
        tratamento_id: tratId,
        nome: tratamentoMap[tratId]?.nome ?? tratId,
        quantidade: Number(q),
      }));
    const diff = computeDiferencas(
      aiEstruturada.tratamentos_sugeridos as IaTratamentoSugerido[],
      atribuidos,
    );
    return (
      diff.adicionados.length > 0 ||
      diff.removidos.length > 0 ||
      diff.alterados.length > 0
    );
  }, [aiSugestaoId, aiEstruturada, quantidades, tratamentoMap]);

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
    setAiMotivoAjuste("");
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

  const validateAssistidoForm = (form: EntrevistaAssistidoForm) =>
    validarCadastroMinimo(form).errors;

  const handleSaveNovoAssistido = useCallback(async () => {
    const errs = validateAssistidoForm(assistidoForm);
    setAssistidoErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast({ title: "Preencha os campos obrigatórios antes de continuar.", variant: "destructive" });
      return;
    }

    // SAAS-06-C1-FIX18 — tenant obrigatório (fail-closed). Sem instituição ativa não persiste.
    if (!selectedInstituicaoId) {
      toast({ title: TENANT_AUSENTE_ERROR.message, variant: "destructive" });
      return;
    }

    setSavingAssistido(true);

    const cpfClean = assistidoForm.cpf.replace(/\D/g, "");
    // Deduplicação por celular (fonte de verdade no backend; aqui é otimista).
    const celClean = assistidoForm.celular.replace(/\D/g, "");
    if (encontrarDuplicadoPorCelular(celClean, assistidos)) {
      setAssistidoErrors({ celular: CELULAR_DUPLICADO_MSG });
      setSavingAssistido(false);
      return;
    }


    const payload = {
      nome: assistidoForm.nome.trim(),
      cpf: cpfClean || null,
      celular: celClean,
      telefone: celClean,
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
    };

    // SAAS-06-C1-STAB02 — mesma camada do cadastro principal (FIX08).
    const { error } = await criarAssistidoTenant({
      payload: payload as any,
      instituicaoId: selectedInstituicaoId,
      userId: user!.id,
    });
    if (error) {
      const isDupCelular =
        error.message.includes("uq_assistidos_celular") ||
        error.message.includes("este celular");
      if (isDupCelular) {
        setAssistidoErrors({ celular: CELULAR_DUPLICADO_MSG });
        setSavingAssistido(false);
        return;
      }
      const friendly = toFriendlyError(error, {
        operacao: "cadastro_rapido_assistido",
        entidade: "assistidos",
        codePrefix: "ASSISTIDO_RAPIDO_ENTREVISTA_CREATE",
        acao: "INSERT",
        instituicaoId: selectedInstituicaoId,
      });
      console.error("[entrevista:novo-assistido]", friendly.code, friendly.raw);
      showFriendlyErrorToast({
        toast,
        origem: "Realizar Entrevista",
        friendly,
        instituicaoId: selectedInstituicaoId,
        userId: user?.id ?? null,
      });
      setSavingAssistido(false);
      return;
    }

    // Busca o recém-criado (SELECT separado, não depende do retorno do INSERT).
    const { data: newAssist } = await fetchAssistidoRecemCriado(
      selectedInstituicaoId,
      celClean
    );
    if (newAssist) {
      setAssistidos((prev) =>
        [...prev, newAssist as EntrevistaAssistido].sort((a, b) => a.nome.localeCompare(b.nome))
      );
      setSelectedAssistido(newAssist as EntrevistaAssistido);
      setNovoAssistidoOpen(false);
      setAssistidoForm(EMPTY_ASSISTIDO_FORM);
      toast({ title: "Assistido cadastrado com sucesso" });
    } else {
      toast({
        title: "Assistido cadastrado, mas não foi possível carregá-lo automaticamente. Selecione-o na lista.",
      });
      setNovoAssistidoOpen(false);
    }
    setSavingAssistido(false);
  }, [assistidoForm, assistidos, user, toast, selectedInstituicaoId]);

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

    // Regra FIX15: horário só é obrigatório quando o entrevistador informa data.
    // Tratamentos agendados pelo coordenador (modo agendado_por_data_inicial)
    // sem data vão para lista de espera do coordenador — sem exigir horário.
    // Para tratamentos holísticos NÃO agendados por data inicial, mantém-se
    // a exigência de horário (execução em dia/hora fixos).
    for (const tratId of Object.keys(quantidades)) {
      const trat = tratamentoMap[tratId];
      if (!trat) continue;
      const isAgendadoCoordenador =
        trat.modo_agendamento === MODO_AGENDAMENTO.agendadoPorDataInicial;
      const temData = !!datasIniciais[tratId];
      const horarioInformado = !!horarios[tratId]?.trim();

      if (isAgendadoCoordenador) {
        // Sem data → lista de espera, horário opcional.
        if (!temData) continue;
        // Com data → horário obrigatório.
        if (!horarioInformado) {
          toast({
            title: "Horário obrigatório",
            description: `Informe o horário da consulta para "${trat.nome}" ou remova a data para deixar o agendamento com o coordenador.`,
            variant: "destructive",
          });
          return;
        }
        continue;
      }

      // Holístico fora do modo coordenador → mantém regra antiga.
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
            // Motivo opcional de ajuste/rejeição informado pelo entrevistador.
            // A classificação continua sendo determinada por diff (não é
            // sobrescrita); apenas anexamos o motivo quando houver.
            motivo: aiMotivoAjuste.trim() || null,
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
    aiMotivoAjuste,
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
    aiMotivoAjuste,
    setAiMotivoAjuste,
    isRecording,
    // derived
    aiHasDivergencia,
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
