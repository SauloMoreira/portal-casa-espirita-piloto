import { useEffect, useState } from "react";
import { Loader2, UserPlus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * SAAS-06-B0.6 — Administrador inicial / Usuários da instituição.
 *
 * Renderizado no diálogo de edição da Central de Assinaturas para permitir que
 * o platform_admin vincule usuários existentes (por e-mail) a uma instituição,
 * definindo papel local e status. Somente platform_admin pode conceder o papel
 * `admin_instituicao` — a RPC valida isso no backend.
 */

const PAPEIS_LOCAIS = [
  { key: "admin_instituicao", label: "Administrador da instituição" },
  { key: "coordenador", label: "Coordenador" },
  { key: "entrevistador", label: "Entrevistador" },
  { key: "tarefeiro", label: "Tarefeiro" },
  { key: "assistido", label: "Assistido" },
  { key: "leitor", label: "Leitor" },
] as const;

type Vinculo = {
  vinculo_id: string;
  user_id: string;
  email: string | null;
  nome_completo: string | null;
  papel_local: string;
  status: string;
  created_at: string;
  updated_at: string;
};

interface Props {
  instituicaoId: string;
  nomeInstituicao: string;
}

export function VinculosInstituicaoSection({ instituicaoId, nomeInstituicao }: Props) {
  const [loading, setLoading] = useState(true);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<string>("admin_instituicao");
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "fn_listar_vinculos_instituicao" as never,
      { p_instituicao_id: instituicaoId } as never,
    );
    if (error) {
      toast({
        title: "Falha ao carregar usuários vinculados",
        description: error.message,
        variant: "destructive",
      });
      setVinculos([]);
    } else {
      setVinculos((data ?? []) as Vinculo[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instituicaoId]);

  const vincular = async () => {
    const emailLimpo = email.trim().toLowerCase();
    if (!emailLimpo || !emailLimpo.includes("@")) {
      toast({
        title: "E-mail inválido",
        description: "Informe um e-mail válido.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc(
      "fn_vincular_usuario_instituicao" as never,
      {
        p_instituicao_id: instituicaoId,
        p_email: emailLimpo,
        p_papel_local: papel,
        p_status: "ativo",
      } as never,
    );
    setSaving(false);
    if (error) {
      toast({
        title: "Falha ao vincular usuário",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    const result = data as { status: string; message?: string } | null;
    if (result?.status === "nao_encontrado") {
      toast({
        title: "Usuário não encontrado",
        description:
          result.message ??
          "Peça para o usuário se cadastrar em /cadastro antes de vincular.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Usuário vinculado",
      description: `${emailLimpo} vinculado a ${nomeInstituicao}.`,
    });
    setEmail("");
    void carregar();
  };

  const alternarStatus = async (v: Vinculo) => {
    const novo = v.status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase.rpc(
      "fn_definir_status_vinculo_instituicao" as never,
      { p_vinculo_id: v.vinculo_id, p_status: novo } as never,
    );
    if (error) {
      toast({
        title: "Falha ao alterar status",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: `Vínculo ${novo}` });
    void carregar();
  };

  return (
    <div className="mt-6 border-t pt-4" data-testid="vinculos-instituicao-section">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">
            Administrador inicial / Usuários da instituição
          </h3>
          <p className="text-xs text-muted-foreground">
            Vincule usuários existentes (por e-mail) a esta instituição. Somente
            administradores da plataforma podem conceder o papel de administrador
            da instituição.
          </p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_220px_auto] items-end">
        <div>
          <Label>E-mail do usuário</Label>
          <Input
            type="email"
            placeholder="usuario@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="vinculo-email-input"
          />
        </div>
        <div>
          <Label>Papel local</Label>
          <Select value={papel} onValueChange={setPapel}>
            <SelectTrigger data-testid="vinculo-papel-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPEIS_LOCAIS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={vincular}
          disabled={saving}
          data-testid="btn-vincular-usuario"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4 mr-2" />
          )}
          Vincular
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : vinculos.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Nenhum usuário vinculado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="vinculos-tabela">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Usuário</th>
                  <th className="py-2 pr-3">Papel</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {vinculos.map((v) => {
                  const papelLabel =
                    PAPEIS_LOCAIS.find((p) => p.key === v.papel_local)?.label ??
                    v.papel_local;
                  return (
                    <tr key={v.vinculo_id} className="border-t">
                      <td className="py-2 pr-3">
                        <div className="font-medium">
                          {v.nome_completo ?? v.email ?? v.user_id}
                        </div>
                        {v.email && (
                          <div className="text-xs text-muted-foreground">
                            {v.email}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{papelLabel}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant={v.status === "ativo" ? "default" : "outline"}
                        >
                          {v.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => alternarStatus(v)}
                        >
                          {v.status === "ativo" ? "Inativar" : "Ativar"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
