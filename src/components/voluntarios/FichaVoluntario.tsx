import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, User } from "lucide-react";
import { maskCPF, maskPhone } from "@/lib/validators";

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

interface FichaVoluntarioProps {
  open: boolean;
  onClose: () => void;
  voluntario: any;
  funcoesNomes?: string[];
}

export function FichaVoluntario({ open, onClose, voluntario, funcoesNomes }: FichaVoluntarioProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html><head>
        <title>Ficha do Voluntário</title>
        <style>
          @media print { @page { margin: 2cm; } }
          body { font-family: 'Inter', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #222; max-width: 700px; margin: 0 auto; padding: 40px 20px; }
          .ficha-header { text-align: center; border-bottom: 2px solid #2a7a6d; padding-bottom: 16px; margin-bottom: 24px; }
          .ficha-header h1 { font-size: 16pt; color: #2a7a6d; margin: 0; }
          .foto { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin: 0 auto 12px; display: block; border: 3px solid #2a7a6d; }
          .foto-placeholder { width: 100px; height: 100px; border-radius: 50%; background: #e0f0ed; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; border: 3px solid #2a7a6d; font-size: 32pt; color: #2a7a6d; }
          .section-title { font-size: 12pt; font-weight: 600; color: #2a7a6d; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 20px 0 10px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
          .field label { font-size: 9pt; color: #888; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 1px; }
          .field p { margin: 0; font-size: 11pt; }
          .badges { display: flex; gap: 6px; flex-wrap: wrap; }
          .badge { background: #e0f0ed; color: #2a7a6d; padding: 2px 10px; border-radius: 12px; font-size: 9pt; font-weight: 600; }
        </style>
      </head><body>${content}</body></html>
    `);
    win.document.close();
    win.print();
  };

  const v = voluntario;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Ficha do Voluntário</span>
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
          <div style={{ textAlign: "center", borderBottom: "2px solid hsl(174 42% 35%)", paddingBottom: 16, marginBottom: 20 }}>
            {v.foto_url ? (
              <img src={v.foto_url} alt="" style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover", margin: "0 auto 10px", display: "block", border: "3px solid hsl(174 42% 35%)" }} />
            ) : (
              <div style={{ width: 90, height: 90, borderRadius: "50%", background: "hsl(150 20% 93%)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", border: "3px solid hsl(174 42% 35%)", fontSize: 28, color: "hsl(174 42% 35%)" }}>
                {v.nome_completo.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
              </div>
            )}
            <h1 style={{ fontSize: "15pt", color: "hsl(174 42% 35%)", margin: 0 }}>{v.nome_completo}</h1>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
              {(v.tipos_voluntario || []).map((t: string) => (
                <span key={t} style={{ background: "hsl(150 20% 93%)", color: "hsl(174 42% 35%)", padding: "2px 10px", borderRadius: 12, fontSize: "9pt", fontWeight: 600 }}>{t}</span>
              ))}
              <span style={{ background: v.status === "ativo" ? "#dcfce7" : "#f3f4f6", color: v.status === "ativo" ? "#166534" : "#374151", padding: "2px 10px", borderRadius: 12, fontSize: "9pt", fontWeight: 600 }}>
                {STATUS_LABELS[v.status] || v.status}
              </span>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground mb-3">
            Tipo de voluntário não equivale a acesso ao sistema. Gerencie permissões em Acesso e
            Segurança → Permissões de Acesso.
          </div>



          <div>
            <div style={{ fontSize: "11pt", fontWeight: 600, color: "hsl(174 42% 35%)", borderBottom: "1px solid #ddd", paddingBottom: 4, margin: "16px 0 8px" }}>Dados Pessoais</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
              <div><label style={{ fontSize: "8pt", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>CPF</label><p style={{ margin: 0 }}>{maskCPF(v.cpf)}</p></div>
              {v.rg && <div><label style={{ fontSize: "8pt", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>RG</label><p style={{ margin: 0 }}>{v.rg}</p></div>}
              <div><label style={{ fontSize: "8pt", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Celular</label><p style={{ margin: 0 }}>{maskPhone(v.celular)}</p></div>
              <div><label style={{ fontSize: "8pt", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>E-mail</label><p style={{ margin: 0 }}>{v.email}</p></div>
              <div><label style={{ fontSize: "8pt", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Data de Nascimento</label><p style={{ margin: 0 }}>{v.data_nascimento ? new Date(v.data_nascimento + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
            </div>

            <div style={{ fontSize: "11pt", fontWeight: 600, color: "hsl(174 42% 35%)", borderBottom: "1px solid #ddd", paddingBottom: 4, margin: "16px 0 8px" }}>Endereço</div>
            <p style={{ margin: 0 }}>
              {[v.logradouro, v.numero, v.complemento].filter(Boolean).join(", ")}
              <br />
              {[v.bairro, v.cidade, v.estado].filter(Boolean).join(" — ")}
              {v.cep ? ` — CEP: ${v.cep}` : ""}
            </p>

            <div style={{ fontSize: "11pt", fontWeight: 600, color: "hsl(174 42% 35%)", borderBottom: "1px solid #ddd", paddingBottom: 4, margin: "16px 0 8px" }}>Voluntariado</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
              <div><label style={{ fontSize: "8pt", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Ingresso no Sistema</label><p style={{ margin: 0 }}>{v.data_ingresso_sistema ? new Date(v.data_ingresso_sistema + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
              {v.data_adesao_voluntariado && <div><label style={{ fontSize: "8pt", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Adesão ao Voluntariado</label><p style={{ margin: 0 }}>{new Date(v.data_adesao_voluntariado + "T12:00:00").toLocaleDateString("pt-BR")}</p></div>}
              {(funcoesNomes && funcoesNomes.length > 0) && <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: "8pt", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Funções</label><p style={{ margin: 0 }}>{funcoesNomes.join(", ")}</p></div>}
              {v.atuacao_detalhada && <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: "8pt", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Observações da Atuação</label><p style={{ margin: 0 }}>{v.atuacao_detalhada}</p></div>}
            </div>

            {v.observacoes && (
              <>
                <div style={{ fontSize: "11pt", fontWeight: 600, color: "hsl(174 42% 35%)", borderBottom: "1px solid #ddd", paddingBottom: 4, margin: "16px 0 8px" }}>Observações</div>
                <p style={{ margin: 0 }}>{v.observacoes}</p>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
