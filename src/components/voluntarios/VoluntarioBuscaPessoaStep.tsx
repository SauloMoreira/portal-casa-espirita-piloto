import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, UserPlus, UserCheck } from "lucide-react";
import { maskCPF, maskPhone } from "@/lib/validators";
import type { PessoaCandidata } from "@/lib/voluntarioCadastro";

interface Props {
  termo: string;
  resultados: PessoaCandidata[];
  loading: boolean;
  onTermoChange: (v: string) => void;
  onBuscar: () => void;
  onSelecionar: (p: PessoaCandidata) => void;
  onDoZero: () => void;
}

const ORIGEM_LABEL: Record<string, string> = {
  assistido: "Assistido",
  usuario: "Usuário do sistema",
};

export function VoluntarioBuscaPessoaStep({
  termo,
  resultados,
  loading,
  onTermoChange,
  onBuscar,
  onSelecionar,
  onDoZero,
}: Props) {
  const [tocado, setTocado] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
        Antes de cadastrar, busque a pessoa já existente (assistido ou usuário) para
        <span className="font-medium text-foreground"> reaproveitar os dados</span> e evitar duplicidade.
      </div>

      <div className="space-y-1">
        <Label>Buscar por nome, CPF ou celular</Label>
        <div className="flex gap-2">
          <Input
            value={termo}
            onChange={(e) => onTermoChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setTocado(true);
                onBuscar();
              }
            }}
            placeholder="Ex.: Maria, 529.982..., (11) 9..."
          />
          <Button onClick={() => { setTocado(true); onBuscar(); }} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
        </div>
      </div>

      <div className="space-y-2 max-h-[40vh] overflow-y-auto">
        {resultados.map((p) => (
          <div
            key={`${p.origem}-${p.origem_id}`}
            className="flex items-center justify-between gap-3 rounded-xl border p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{p.nome || "(sem nome)"}</span>
                <Badge variant="outline" className="text-[10px]">{ORIGEM_LABEL[p.origem] ?? p.origem}</Badge>
                {p.ja_voluntario && (
                  <Badge className="bg-amber-100 text-amber-800 text-[10px]">Já é voluntário</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {p.cpf ? maskCPF(p.cpf) : "sem CPF"} · {p.celular ? maskPhone(p.celular) : "sem celular"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 shrink-0"
              disabled={p.ja_voluntario}
              onClick={() => onSelecionar(p)}
            >
              <UserCheck className="h-4 w-4" />
              {p.ja_voluntario ? "Vinculado" : "Reaproveitar"}
            </Button>
          </div>
        ))}

        {tocado && !loading && resultados.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma pessoa encontrada. Você pode cadastrar do zero.
          </p>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t">
        <Button variant="ghost" className="gap-2" onClick={onDoZero}>
          <UserPlus className="h-4 w-4" /> Cadastrar do zero
        </Button>
      </div>
    </div>
  );
}
