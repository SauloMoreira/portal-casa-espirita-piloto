import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, RotateCcw, Save, Check, AlertTriangle, Info, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ColorConfig {
  key: string;
  label: string;
  group: string;
  defaultHsl: string;
}

const COLOR_CONFIGS: ColorConfig[] = [
  { key: "primary", label: "Primária", group: "Identidade", defaultHsl: "174 42% 35%" },
  { key: "primary-foreground", label: "Texto sobre Primária", group: "Identidade", defaultHsl: "0 0% 100%" },
  { key: "accent", label: "Destaque", group: "Identidade", defaultHsl: "38 60% 55%" },
  { key: "accent-foreground", label: "Texto sobre Destaque", group: "Identidade", defaultHsl: "0 0% 100%" },
  { key: "background", label: "Fundo", group: "Base", defaultHsl: "150 20% 98%" },
  { key: "foreground", label: "Texto Principal", group: "Base", defaultHsl: "200 25% 15%" },
  { key: "card", label: "Cards", group: "Base", defaultHsl: "0 0% 100%" },
  { key: "card-foreground", label: "Texto dos Cards", group: "Base", defaultHsl: "200 25% 15%" },
  { key: "muted", label: "Fundo Secundário", group: "Base", defaultHsl: "150 12% 94%" },
  { key: "muted-foreground", label: "Texto Secundário", group: "Base", defaultHsl: "200 10% 45%" },
  { key: "border", label: "Bordas", group: "Base", defaultHsl: "150 15% 88%" },
  { key: "sidebar-background", label: "Fundo do Menu", group: "Menu Lateral", defaultHsl: "174 35% 22%" },
  { key: "sidebar-foreground", label: "Texto do Menu", group: "Menu Lateral", defaultHsl: "150 20% 95%" },
  { key: "sidebar-accent", label: "Item Ativo do Menu", group: "Menu Lateral", defaultHsl: "174 30% 28%" },
  { key: "success", label: "Sucesso", group: "Status", defaultHsl: "152 55% 42%" },
  { key: "warning", label: "Atenção", group: "Status", defaultHsl: "38 92% 50%" },
  { key: "destructive", label: "Erro", group: "Status", defaultHsl: "0 72% 51%" },
  { key: "info", label: "Informação", group: "Status", defaultHsl: "200 80% 50%" },
];

function hslToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return "#000000";
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0% 0%";
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const GROUPS = ["Identidade", "Base", "Menu Lateral", "Status"];

export default function GestaoCores() {
  const [colors, setColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Initialize with defaults
  useEffect(() => {
    const defaults: Record<string, string> = {};
    COLOR_CONFIGS.forEach((c) => { defaults[c.key] = c.defaultHsl; });

    const load = async () => {
      const { data } = await supabase
        .from("configuracoes_gerais")
        .select("chave, valor")
        .like("chave", "cor_%");
      if (data) {
        data.forEach((row) => {
          const key = row.chave.replace("cor_", "");
          defaults[key] = row.valor;
        });
      }
      setColors(defaults);
    };
    load();
  }, []);

  const applyColors = useCallback((colorMap: Record<string, string>) => {
    const root = document.documentElement;
    Object.entries(colorMap).forEach(([key, hsl]) => {
      root.style.setProperty(`--${key}`, hsl);
    });
  }, []);

  // Apply live preview
  useEffect(() => {
    if (Object.keys(colors).length > 0) {
      applyColors(colors);
    }
  }, [colors, applyColors]);

  const updateColor = (key: string, hex: string) => {
    const hsl = hexToHsl(hex);
    setColors((prev) => ({ ...prev, [key]: hsl }));
  };

  const handleSave = async () => {
    setLoading(true);
    for (const [key, hsl] of Object.entries(colors)) {
      const chave = `cor_${key}`;
      const { data: existing } = await supabase.from("configuracoes_gerais").select("id").eq("chave", chave).maybeSingle();
      if (existing) {
        await supabase.from("configuracoes_gerais").update({ valor: hsl, updated_by: user?.id }).eq("chave", chave);
      } else {
        await supabase.from("configuracoes_gerais").insert({
          chave,
          valor: hsl,
          descricao: `Cor personalizada: ${key}`,
          updated_by: user?.id,
        });
      }
    }
    toast({ title: "Cores salvas com sucesso" });
    setLoading(false);
  };

  const handleReset = () => {
    const defaults: Record<string, string> = {};
    COLOR_CONFIGS.forEach((c) => { defaults[c.key] = c.defaultHsl; });
    setColors(defaults);
    toast({ title: "Cores restauradas ao padrão", description: "Clique em Salvar para confirmar" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Gestão de Cores</h1>
          <p className="text-sm text-muted-foreground mt-1">Personalize a identidade visual do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Restaurar Padrão
          </Button>
          <Button onClick={handleSave} disabled={loading} className="gap-2">
            <Save className="h-4 w-4" />
            {loading ? "Salvando..." : "Salvar Cores"}
          </Button>
        </div>
      </div>

      {/* Preview */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            Preview em Tempo Real
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button>Botão Primário</Button>
            <Button variant="outline">Botão Outline</Button>
            <Button variant="destructive">Botão Erro</Button>
            <Badge>Badge Padrão</Badge>
            <Badge variant="secondary">Badge Secundário</Badge>
            <Badge className="bg-success text-success-foreground">
              <Check className="h-3 w-3 mr-1" /> Sucesso
            </Badge>
            <Badge className="bg-warning text-warning-foreground">
              <AlertTriangle className="h-3 w-3 mr-1" /> Atenção
            </Badge>
            <Badge className="bg-destructive text-destructive-foreground">
              <X className="h-3 w-3 mr-1" /> Erro
            </Badge>
            <Badge className="bg-info text-info-foreground">
              <Info className="h-3 w-3 mr-1" /> Info
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Color groups */}
      {GROUPS.map((group) => {
        const items = COLOR_CONFIGS.filter((c) => c.group === group);
        return (
          <Card key={group} className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{group}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => {
                  const hsl = colors[item.key] || item.defaultHsl;
                  const hex = hslToHex(hsl);
                  return (
                    <div key={item.key} className="space-y-2">
                      <Label className="text-xs font-medium">{item.label}</Label>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input
                            type="color"
                            value={hex}
                            onChange={(e) => updateColor(item.key, e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div
                            className="h-9 w-9 rounded-md border border-border shadow-sm cursor-pointer"
                            style={{ backgroundColor: hex }}
                          />
                        </div>
                        <Input
                          value={hex}
                          onChange={(e) => {
                            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                              updateColor(item.key, e.target.value);
                            }
                          }}
                          className="flex-1 text-xs font-mono h-9"
                          maxLength={7}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
