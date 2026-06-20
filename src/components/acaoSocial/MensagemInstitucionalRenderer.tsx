import ReactMarkdown from "react-markdown";
import {
  MARKDOWN_ALLOWED_ELEMENTS,
  limparMensagemInstitucional,
  safeUrlTransform,
} from "@/lib/markdownInstitucional";

/**
 * Renderiza a mensagem institucional da Ação Social a partir de Markdown
 * controlado. Usa react-markdown (sem suporte a HTML bruto), com whitelist
 * restrita de elementos e URLs saneadas. O estilo segue tokens do design
 * system e é responsivo, sem criar blocos visualmente pesados.
 */
export function MensagemInstitucionalRenderer({ texto }: { texto?: string | null }) {
  const conteudo = limparMensagemInstitucional(texto);
  if (!conteudo) return null;

  return (
    <div
      className={[
        "text-xs leading-relaxed text-muted-foreground sm:text-sm",
        "[&_p]:mb-2 [&_p:last-child]:mb-0",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-foreground first:[&_h4]:mt-0",
        "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:mb-0.5",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:break-words",
      ].join(" ")}
    >
      <ReactMarkdown
        allowedElements={[...MARKDOWN_ALLOWED_ELEMENTS]}
        unwrapDisallowed
        urlTransform={safeUrlTransform}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
          ),
        }}
      >
        {conteudo}
      </ReactMarkdown>
    </div>
  );
}
