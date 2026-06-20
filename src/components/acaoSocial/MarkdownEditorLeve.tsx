import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, Heading, Link as LinkIcon } from "lucide-react";
import { MENSAGEM_INSTITUCIONAL_MAX } from "@/lib/markdownInstitucional";

/**
 * Editor de texto rico LEVE baseado em Markdown controlado. Mantém um textarea
 * acessível (o conteúdo é texto puro/Markdown) com uma toolbar curta que insere
 * apenas formatações permitidas: negrito, itálico, subtítulo, lista e link.
 * Não há HTML livre, cores, fontes ou tamanhos arbitrários.
 */
export function MarkdownEditorLeve({
  value,
  onChange,
  placeholder,
  rows = 6,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const aplicar = (
    transform: (sel: string) => { texto: string; selStart: number; selEnd: number },
  ) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selecionado = value.slice(start, end);
    const { texto, selStart, selEnd } = transform(selecionado);
    const next = (value.slice(0, start) + texto + value.slice(end)).slice(
      0,
      MENSAGEM_INSTITUCIONAL_MAX,
    );
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + selStart, start + selEnd);
    });
  };

  const envolver = (marca: string, vazio: string) =>
    aplicar((sel) => {
      const conteudo = sel || vazio;
      return {
        texto: `${marca}${conteudo}${marca}`,
        selStart: marca.length,
        selEnd: marca.length + conteudo.length,
      };
    });

  const prefixarLinhas = (prefixo: string) =>
    aplicar((sel) => {
      const base = sel || "Item";
      const texto = base
        .split("\n")
        .map((l) => (l.trim() ? `${prefixo}${l}` : l))
        .join("\n");
      return { texto, selStart: 0, selEnd: texto.length };
    });

  const subtitulo = () =>
    aplicar((sel) => {
      const conteudo = sel || "Subtítulo";
      const texto = `#### ${conteudo}`;
      return { texto, selStart: 5, selEnd: 5 + conteudo.length };
    });

  const link = () =>
    aplicar((sel) => {
      const rotulo = sel || "texto do link";
      const texto = `[${rotulo}](https://)`;
      return { texto, selStart: texto.length - 9, selEnd: texto.length - 1 };
    });

  const btn = "h-8 px-2";

  return (
    <div className="rounded-xl border border-border/60 focus-within:ring-1 focus-within:ring-ring">
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-muted/30 p-1.5">
        <Button type="button" variant="ghost" size="sm" className={btn} onClick={() => envolver("**", "negrito")} title="Negrito">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btn} onClick={() => envolver("*", "itálico")} title="Itálico">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btn} onClick={subtitulo} title="Subtítulo">
          <Heading className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btn} onClick={() => prefixarLinhas("- ")} title="Lista">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btn} onClick={link} title="Link">
          <LinkIcon className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MENSAGEM_INSTITUCIONAL_MAX))}
        rows={rows}
        maxLength={MENSAGEM_INSTITUCIONAL_MAX}
        placeholder={placeholder}
        className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
