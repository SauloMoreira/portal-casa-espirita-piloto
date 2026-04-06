import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { maskCPF, maskPhone } from "@/lib/validators";

interface TermoAdesaoProps {
  open: boolean;
  onClose: () => void;
  voluntario: any;
  instituicao: any;
  funcoesNomes?: string[];
}

export function TermoAdesao({ open, onClose, voluntario, instituicao, funcoesNomes }: TermoAdesaoProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html><head>
        <title>Termo de Adesão ao Voluntariado</title>
        <style>
          @media print { @page { margin: 2cm; } }
          body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.6; color: #222; max-width: 700px; margin: 0 auto; padding: 40px 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2a7a6d; padding-bottom: 20px; }
          .header h1 { font-size: 16pt; margin: 0 0 4px; color: #2a7a6d; }
          .header h2 { font-size: 13pt; font-weight: normal; margin: 0; color: #555; }
          .header .logo { height: 60px; margin-bottom: 10px; }
          .title { text-align: center; font-size: 15pt; font-weight: bold; margin: 30px 0 20px; text-transform: uppercase; letter-spacing: 1px; }
          .section { margin-bottom: 20px; text-align: justify; }
          .field { margin: 6px 0; }
          .field strong { color: #333; }
          .signatures { margin-top: 60px; display: flex; flex-direction: column; gap: 50px; }
          .sig-line { text-align: center; }
          .sig-line .line { border-top: 1px solid #333; width: 300px; margin: 0 auto 4px; }
          .sig-line p { margin: 2px 0; font-size: 11pt; }
          .witnesses { margin-top: 40px; display: flex; gap: 40px; }
          .witnesses .sig-line { flex: 1; }
        </style>
      </head><body>${content}</body></html>
    `);
    win.document.close();
    win.print();
  };

  const inst = instituicao || {};
  const v = voluntario;
  const tiposLabel = (v.tipos_voluntario || []).join(" e ") || "Voluntário";
  const atuacao = v.atuacao_detalhada || tiposLabel;
  const enderecoInst = [inst.logradouro, inst.numero, inst.complemento, inst.bairro, inst.cidade, inst.estado].filter(Boolean).join(", ");
  const enderecoVol = [v.logradouro, v.numero, v.complemento, v.bairro, v.cidade, v.estado].filter(Boolean).join(", ");
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const cidadeInst = inst.cidade || "___________";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Termo de Adesão ao Voluntariado</span>
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="font-serif text-sm leading-relaxed text-foreground">
          {/* Header */}
          <div className="header" style={{ textAlign: "center", marginBottom: 24, borderBottom: "2px solid hsl(174 42% 35%)", paddingBottom: 16 }}>
            {inst.logo_url && <img src={inst.logo_url} alt="" style={{ height: 60, margin: "0 auto 10px", display: "block" }} className="logo" />}
            <h1 style={{ fontSize: "16pt", margin: "0 0 4px", color: "hsl(174 42% 35%)" }}>{inst.nome_fantasia || "Instituição"}</h1>
            <h2 style={{ fontSize: "11pt", fontWeight: "normal", margin: 0, color: "#666" }}>
              {inst.cnpj ? `CNPJ: ${inst.cnpj}` : ""}
              {enderecoInst ? ` — ${enderecoInst}` : ""}
            </h2>
          </div>

          <div style={{ textAlign: "center", fontSize: "14pt", fontWeight: "bold", margin: "28px 0 20px", textTransform: "uppercase", letterSpacing: 1 }}>
            Termo de Adesão ao Serviço Voluntário
          </div>

          <div style={{ textAlign: "justify", marginBottom: 16 }}>
            <p>
              Pelo presente instrumento, de um lado <strong>{inst.nome_fantasia || "a Instituição"}</strong>,
              {inst.razao_social ? ` pessoa jurídica denominada ${inst.razao_social},` : ""}
              {inst.cnpj ? ` inscrita no CNPJ sob o nº ${inst.cnpj},` : ""}
              {enderecoInst ? ` com sede em ${enderecoInst},` : ""}
              {" "}doravante denominada <strong>ENTIDADE</strong>, e de outro lado:
            </p>
          </div>

          <div style={{ marginBottom: 16, paddingLeft: 16, borderLeft: "3px solid hsl(174 42% 35% / 0.3)" }}>
            <p><strong>Nome:</strong> {v.nome_completo}</p>
            {v.rg && <p><strong>RG:</strong> {v.rg}</p>}
            <p><strong>CPF:</strong> {maskCPF(v.cpf)}</p>
            <p><strong>Endereço:</strong> {enderecoVol}{v.cep ? ` — CEP: ${v.cep}` : ""}</p>
            <p><strong>Telefone:</strong> {maskPhone(v.celular)}</p>
            <p><strong>E-mail:</strong> {v.email}</p>
          </div>

          <div style={{ textAlign: "justify", marginBottom: 16 }}>
            <p>doravante denominado(a) <strong>VOLUNTÁRIO(A)</strong>, celebram o presente Termo de Adesão ao Serviço Voluntário, em conformidade com a Lei nº 9.608, de 18 de fevereiro de 1998, mediante as seguintes cláusulas e condições:</p>
          </div>

          <div style={{ textAlign: "justify", marginBottom: 12 }}>
            <p><strong>CLÁUSULA PRIMEIRA — DO OBJETO</strong></p>
            <p>O(A) VOLUNTÁRIO(A) prestará serviço voluntário à ENTIDADE, exercendo a atividade de <strong>{atuacao}</strong>, de forma espontânea, sem qualquer tipo de remuneração, comprometendo-se a desempenhar suas funções de acordo com os princípios e objetivos institucionais.</p>
          </div>

          <div style={{ textAlign: "justify", marginBottom: 12 }}>
            <p><strong>CLÁUSULA SEGUNDA — DO RESSARCIMENTO DE DESPESAS</strong></p>
            <p>O(A) VOLUNTÁRIO(A) poderá ser ressarcido(a) pelas despesas que comprovadamente realizar no desempenho das atividades voluntárias, desde que prévia e expressamente autorizadas pela ENTIDADE.</p>
          </div>

          <div style={{ textAlign: "justify", marginBottom: 12 }}>
            <p><strong>CLÁUSULA TERCEIRA — DO PRAZO</strong></p>
            <p>O presente Termo de Adesão é firmado por prazo indeterminado, podendo ser encerrado a qualquer momento por iniciativa de qualquer das partes, mediante comunicação prévia.</p>
          </div>

          <div style={{ textAlign: "justify", marginBottom: 12 }}>
            <p><strong>CLÁUSULA QUARTA — DA NATUREZA JURÍDICA</strong></p>
            <p>O serviço voluntário de que trata este Termo não gera vínculo empregatício, nem obrigação de natureza trabalhista, previdenciária ou afim, nos termos do artigo 1º da Lei nº 9.608/1998.</p>
          </div>

          <div style={{ textAlign: "center", margin: "30px 0 10px" }}>
            <p>{cidadeInst}, {hoje}.</p>
          </div>

          {/* Signatures */}
          <div style={{ marginTop: 50, display: "flex", flexDirection: "column", gap: 50 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #333", width: 300, margin: "0 auto 4px" }} />
              <p style={{ margin: "2px 0", fontSize: "11pt" }}>{v.nome_completo}</p>
              <p style={{ margin: "2px 0", fontSize: "10pt", color: "#666" }}>Voluntário(a)</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #333", width: 300, margin: "0 auto 4px" }} />
              <p style={{ margin: "2px 0", fontSize: "11pt" }}>{inst.nome_fantasia || "Representante da Entidade"}</p>
              <p style={{ margin: "2px 0", fontSize: "10pt", color: "#666" }}>Representante Legal</p>
            </div>
          </div>

          {/* Witnesses */}
          <div style={{ marginTop: 40 }}>
            <p style={{ fontSize: "10pt", color: "#666", marginBottom: 30 }}>Testemunhas:</p>
            <div style={{ display: "flex", gap: 40 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #333", width: "100%", marginBottom: 4 }} />
                <p style={{ fontSize: "10pt" }}>Nome:</p>
                <p style={{ fontSize: "10pt" }}>CPF:</p>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #333", width: "100%", marginBottom: 4 }} />
                <p style={{ fontSize: "10pt" }}>Nome:</p>
                <p style={{ fontSize: "10pt" }}>CPF:</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
