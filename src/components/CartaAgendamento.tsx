import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

interface CartaAgendamentoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistidoId: string;
  entrevistaId?: string;
  /** Specific assistido_tratamento IDs to show (e.g. after coordinator scheduling) */
  assistidoTratamentoIds?: string[];
}

interface InstituicaoData {
  nome_fantasia: string;
  razao_social: string;
  logo_url: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  telefone: string | null;
  email_institucional: string | null;
}

interface AssistidoData {
  nome: string;
  cpf: string | null;
  celular: string | null;
}

interface TratamentoAgendado {
  tratamento_nome: string;
  tratamento_tipo: string;
  quantidade_total: number;
  frequencia_valor: number | null;
  frequencia_unidade: string | null;
  dia_semana: number | null;
  horario: string | null;
  sessoes: { data_sessao: string; horario: string | null }[];
}

export function CartaAgendamento({ open, onOpenChange, assistidoId, entrevistaId, assistidoTratamentoIds }: CartaAgendamentoProps) {
  const [instituicao, setInstituicao] = useState<InstituicaoData | null>(null);
  const [assistido, setAssistido] = useState<AssistidoData | null>(null);
  const [tratamentos, setTratamentos] = useState<TratamentoAgendado[]>([]);
  const [dataEntrevista, setDataEntrevista] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fetch = async () => {
      setLoading(true);

      // Fetch institution, assistido, and entrevista data in parallel
      const [instRes, assistRes] = await Promise.all([
        supabase.from("instituicao_config").select("*").limit(1).single(),
        supabase.from("assistidos").select("nome, cpf, celular").eq("id", assistidoId).single(),
      ]);

      const instData = instRes.data;
      const assistData = assistRes.data;

      let entData: any = null;
      if (entrevistaId) {
        const { data } = await supabase.from("entrevistas_fraternas").select("data").eq("id", entrevistaId).single();
        entData = data;
      }

      if (instData) setInstituicao(instData);
      if (assistData) setAssistido(assistData);
      if (entData) setDataEntrevista(entData.data);

      // Get vinculos for this assistido
      let vinculoQuery = supabase
        .from("assistido_tratamentos")
        .select("id, tratamento_id, quantidade_total")
        .eq("assistido_id", assistidoId);

      if (assistidoTratamentoIds && assistidoTratamentoIds.length > 0) {
        vinculoQuery = vinculoQuery.in("id", assistidoTratamentoIds);
      } else if (entrevistaId) {
        vinculoQuery = vinculoQuery.eq("entrevista_id", entrevistaId);
      }

      const { data: vinculos } = await vinculoQuery;
      if (!vinculos || vinculos.length === 0) { setLoading(false); return; }

      // Get treatment details
      const tratIds = [...new Set(vinculos.map((v: any) => v.tratamento_id))];
      const { data: tiposTrat } = await supabase
        .from("tipos_tratamento")
        .select("id, nome, tipo, dia_semana, horario, frequencia_valor, frequencia_unidade")
        .in("id", tratIds);

      const tratMap = Object.fromEntries((tiposTrat || []).map((t: any) => [t.id, t]));

      // Get agenda sessions for each vinculo
      const vinculoIds = vinculos.map((v: any) => v.id);
      const { data: agendaSessoes } = await supabase
        .from("agenda_tratamentos_assistido")
        .select("assistido_tratamento_id, data_sessao, horario")
        .in("assistido_tratamento_id", vinculoIds)
        .order("data_sessao", { ascending: true });

      // Group sessions by vinculo
      const sessoesByVinculo: Record<string, { data_sessao: string; horario: string | null }[]> = {};
      for (const s of agendaSessoes || []) {
        if (!sessoesByVinculo[s.assistido_tratamento_id]) sessoesByVinculo[s.assistido_tratamento_id] = [];
        sessoesByVinculo[s.assistido_tratamento_id].push({ data_sessao: s.data_sessao, horario: s.horario });
      }

      const result: TratamentoAgendado[] = vinculos.map((v: any) => {
        const trat = tratMap[v.tratamento_id] || {};
        return {
          tratamento_nome: trat.nome || "—",
          tratamento_tipo: trat.tipo || "—",
          quantidade_total: v.quantidade_total,
          frequencia_valor: trat.frequencia_valor,
          frequencia_unidade: trat.frequencia_unidade,
          dia_semana: trat.dia_semana,
          horario: trat.horario,
          sessoes: sessoesByVinculo[v.id] || [],
        };
      });

      setTratamentos(result);
      setLoading(false);
    };
    fetch();
  }, [open, assistidoId, entrevistaId, assistidoTratamentoIds]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
      <head>
        <title>Carta de Agendamento</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #1a1a1a; padding: 24px; font-size: 12px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
          .header img { max-height: 60px; margin-bottom: 8px; }
          .header h1 { font-size: 16px; margin-bottom: 2px; }
          .header p { font-size: 11px; color: #555; }
          .section { margin-bottom: 14px; }
          .section-title { font-size: 13px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
          .info-row { display: flex; gap: 24px; margin-bottom: 4px; }
          .info-label { font-weight: bold; min-width: 100px; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-size: 11px; }
          th { background: #f0f0f0; font-weight: bold; }
          .treatment-block { margin-bottom: 16px; page-break-inside: avoid; }
          .treatment-header { background: #e8e8e8; padding: 6px 10px; font-weight: bold; font-size: 12px; border-radius: 4px 4px 0 0; }
          .footer { margin-top: 24px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 10px; color: #666; text-align: center; }
          .signature { margin-top: 40px; display: flex; justify-content: space-around; }
          .signature-line { text-align: center; width: 200px; }
          .signature-line hr { border: none; border-top: 1px solid #333; margin-bottom: 4px; }
          ul.recomendacoes { list-style: disc; padding-left: 20px; margin: 0; }
          ul.recomendacoes li { margin-bottom: 6px; line-height: 1.5; }
          @media print { body { padding: 16px; } }
        </style>
      </head>
      <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  const formatFrequencia = (valor: number | null, unidade: string | null) => {
    if (!valor || !unidade) return "—";
    if (valor === 1) {
      if (unidade === "semanas") return "Semanal";
      if (unidade === "meses") return "Mensal";
      return "Diário";
    }
    return `A cada ${valor} ${unidade}`;
  };

  const formatCpf = (cpf: string) => {
    const c = cpf.replace(/\D/g, "");
    if (c.length !== 11) return cpf;
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  };

  const formatPhone = (phone: string) => {
    const p = phone.replace(/\D/g, "");
    if (p.length === 11) return `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`;
    if (p.length === 10) return `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`;
    return phone;
  };

  const buildAddress = (inst: InstituicaoData) => {
    const parts = [
      inst.logradouro,
      inst.numero ? `nº ${inst.numero}` : null,
      inst.bairro,
      inst.cidade,
      inst.estado,
    ].filter(Boolean);
    return parts.join(", ");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Carta de Agendamento</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePrint} className="gap-1" disabled={loading}>
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">Carregando...</p>
          </div>
        ) : (
          <div ref={printRef}>
            {/* Header */}
            <div className="header">
              {instituicao?.logo_url && (
                <img src={instituicao.logo_url} alt="Logo" style={{ maxHeight: 60, margin: "0 auto 8px" }} />
              )}
              <h1>{instituicao?.nome_fantasia || "Instituição"}</h1>
              {instituicao && <p>{buildAddress(instituicao)}</p>}
              {instituicao?.telefone && <p>Tel: {formatPhone(instituicao.telefone)}</p>}
            </div>

            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 14, fontWeight: "bold" }}>CARTA DE AGENDAMENTO DE TRATAMENTOS</h2>
            </div>

            {/* Assistido info */}
            <div className="section" style={{ marginBottom: 14 }}>
              <div className="section-title" style={{ fontSize: 13, fontWeight: "bold", borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 8 }}>
                Dados do Assistido
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: "bold" }}>Nome: </span>{assistido?.nome || "—"}
              </div>
              {assistido?.cpf && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: "bold" }}>CPF: </span>{formatCpf(assistido.cpf)}
                </div>
              )}
              {assistido?.celular && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: "bold" }}>Telefone: </span>{formatPhone(assistido.celular)}
                </div>
              )}
              {dataEntrevista && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: "bold" }}>Data da Entrevista: </span>
                  {format(new Date(dataEntrevista), "dd/MM/yyyy")}
                </div>
              )}
            </div>

            {/* Treatments + sessions */}
            {tratamentos.map((trat, idx) => (
              <div key={idx} className="treatment-block" style={{ marginBottom: 16, pageBreakInside: "avoid" }}>
                <div className="treatment-header" style={{ background: "#e8e8e8", padding: "6px 10px", fontWeight: "bold", fontSize: 12, borderRadius: "4px 4px 0 0" }}>
                  {trat.tratamento_nome} ({trat.tratamento_tipo === "espiritual" ? "Espiritual" : "Holístico"})
                </div>
                <div style={{ padding: "6px 10px", fontSize: 11, borderLeft: "1px solid #ccc", borderRight: "1px solid #ccc" }}>
                  <span style={{ marginRight: 16 }}>
                    <strong>Sessões:</strong> {trat.quantidade_total}
                  </span>
                  <span style={{ marginRight: 16 }}>
                    <strong>Frequência:</strong> {formatFrequencia(trat.frequencia_valor, trat.frequencia_unidade)}
                  </span>
                  {trat.dia_semana !== null && (
                    <span style={{ marginRight: 16 }}>
                      <strong>Dia:</strong> {DIAS_SEMANA[trat.dia_semana]}
                    </span>
                  )}
                  {trat.horario && (
                    <span>
                      <strong>Horário:</strong> {trat.horario.slice(0, 5)}
                    </span>
                  )}
                </div>
                {trat.sessoes.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ border: "1px solid #ccc", padding: "5px 8px", background: "#f0f0f0", width: 50, textAlign: "center" }}>Nº</th>
                        <th style={{ border: "1px solid #ccc", padding: "5px 8px", background: "#f0f0f0" }}>Data</th>
                        <th style={{ border: "1px solid #ccc", padding: "5px 8px", background: "#f0f0f0" }}>Dia da Semana</th>
                        <th style={{ border: "1px solid #ccc", padding: "5px 8px", background: "#f0f0f0", width: 80 }}>Horário</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trat.sessoes.map((s, sIdx) => {
                        const d = new Date(s.data_sessao + "T12:00:00");
                        return (
                          <tr key={sIdx}>
                            <td style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "center" }}>{sIdx + 1}</td>
                            <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{format(d, "dd/MM/yyyy")}</td>
                            <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{DIAS_SEMANA[d.getDay()]}</td>
                            <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{s.horario ? s.horario.slice(0, 5) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: "8px 10px", fontSize: 11, border: "1px solid #ccc", borderTop: 0, fontStyle: "italic", color: "#666" }}>
                    Sessões ainda não agendadas (aguardando definição de data inicial)
                  </div>
                )}
              </div>
            ))}

            {/* Recomendações */}
            <div style={{ marginTop: 20, pageBreakInside: "avoid" }}>
              <div style={{ fontSize: 13, fontWeight: "bold", borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 8 }}>
                Recomendações
              </div>
              <ul className="recomendacoes" style={{ fontSize: 11, listStyle: "disc", paddingLeft: 20, margin: 0, color: "#333" }}>
                <li style={{ marginBottom: 6 }}>Não comer carne de nenhuma espécie nos dias dos tratamentos (bovina, suína, frango, peixes, frutos do mar em geral, enlatados e embutidos).</li>
                <li style={{ marginBottom: 6 }}>É permitida a ingestão de ovos, leite e derivados, frutas, legumes, vegetais e cereais.</li>
                <li style={{ marginBottom: 6 }}>Não é necessário vir de branco, mas são recomendáveis roupas leves, confortáveis e, se possível, de cor clara.</li>
                <li style={{ marginBottom: 6 }}>Evitar decotes, shorts curtos, saias curtas; não será permitido o uso de roupas de praia.</li>
                <li style={{ marginBottom: 6 }}>Ficar atento à agenda dos trabalhos holísticos.</li>
                <li style={{ marginBottom: 0 }}>Nos trabalhos de Acupuntura, Apoio Psicológico e Homeopatia, o responsável pelo tratamento entrará em contato para agendar o dia e o horário.</li>
              </ul>
            </div>

            {/* Orientação sobre o app */}
            <div style={{ marginTop: 14, padding: "8px 12px", background: "#f0f7ff", border: "1px solid #cce0f5", borderRadius: 4, fontSize: 11, color: "#1a1a1a", lineHeight: 1.5, pageBreakInside: "avoid" }}>
              <strong>📱 Acompanhe pelo celular:</strong> Para sua comodidade, você também pode acompanhar pelo celular, no app disponibilizado para você, seus tratamentos, agendamentos e próximas sessões.
            </div>

            {/* Footer */}
            <div style={{ marginTop: 20, fontSize: 11, color: "#555", textAlign: "center" }}>
              <p>Pedimos que compareça pontualmente nos dias e horários indicados.</p>
              <p>Em caso de impossibilidade, entre em contato com antecedência.</p>
            </div>

            <div className="signature" style={{ marginTop: 40, display: "flex", justifyContent: "space-around" }}>
              <div style={{ textAlign: "center", width: 200 }}>
                <hr style={{ border: "none", borderTop: "1px solid #333", marginBottom: 4 }} />
                <span style={{ fontSize: 10 }}>Assistido</span>
              </div>
              <div style={{ textAlign: "center", width: 200 }}>
                <hr style={{ border: "none", borderTop: "1px solid #333", marginBottom: 4 }} />
                <span style={{ fontSize: 10 }}>Entrevistador</span>
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 10, color: "#888", textAlign: "right" }}>
              Emitido em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
