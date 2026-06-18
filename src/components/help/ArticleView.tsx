import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { KIND_LABELS, MODULE_LABELS, type HelpArticle } from "@/lib/help/types";

function BlockBody({ article }: { article: HelpArticle }) {
  return (
    <div className="space-y-4">
      {article.body.map((block, i) => (
        <div key={i} className="space-y-1.5">
          {block.heading && (
            <h4 className="text-sm font-semibold text-foreground">{block.heading}</h4>
          )}
          {block.text && <p className="text-sm text-muted-foreground leading-relaxed">{block.text}</p>}
          {block.bullets && (
            <ul className="list-disc pl-5 space-y-1">
              {block.bullets.map((b, j) => (
                <li key={j} className="text-sm text-muted-foreground leading-relaxed">{b}</li>
              ))}
            </ul>
          )}
          {block.steps && (
            <ol className="list-decimal pl-5 space-y-1">
              {block.steps.map((s, j) => (
                <li key={j} className="text-sm text-muted-foreground leading-relaxed">{s}</li>
              ))}
            </ol>
          )}
          {block.note && (
            <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <p className="text-sm text-foreground/80 leading-relaxed">{block.note}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Renders a single help article fully expanded (used in drawers). */
export function ArticleView({ article }: { article: HelpArticle }) {
  return (
    <article className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">{KIND_LABELS[article.kind]}</Badge>
        <Badge variant="outline" className="text-[10px]">{MODULE_LABELS[article.module]}</Badge>
      </div>
      <h3 className="text-base font-display font-semibold text-foreground">{article.title}</h3>
      <BlockBody article={article} />
    </article>
  );
}

/** Renders a list of articles inside an accordion (used in the central page). */
export function ArticleAccordion({ articles }: { articles: HelpArticle[] }) {
  if (articles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Nenhum conteúdo encontrado para os filtros selecionados.
      </p>
    );
  }
  return (
    <Accordion type="single" collapsible className="w-full">
      {articles.map((a) => (
        <AccordionItem key={a.id} value={a.id}>
          <AccordionTrigger className="text-left">
            <div className="flex flex-col gap-1 pr-2">
              <span className="text-sm font-medium">{a.title}</span>
              <span className="text-xs text-muted-foreground font-normal">{a.summary}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant="secondary" className="text-[10px]">{KIND_LABELS[a.kind]}</Badge>
              <Badge variant="outline" className="text-[10px]">{MODULE_LABELS[a.module]}</Badge>
            </div>
            <BlockBody article={a} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
