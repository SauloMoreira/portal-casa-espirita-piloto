import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { HelpCircle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArticleView } from "@/components/help/ArticleView";
import { useHelp } from "@/hooks/useHelp";
import { ROUTES } from "@/constants/routes";

interface HelpButtonProps {
  /** Route to pull contextual help for. Defaults to the current location. */
  route?: string;
  /** Visual label. */
  label?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "icon";
}

/**
 * Contextual help button. Opens a side panel with the FAQ/help articles that
 * are specific to the current screen AND compatible with the user's role.
 */
export function HelpButton({ route, label = "Ajuda", variant = "outline", size = "sm" }: HelpButtonProps) {
  const location = useLocation();
  const { forRoute } = useHelp();
  const [open, setOpen] = useState(false);

  const targetRoute = route ?? location.pathname;
  const articles = forRoute(targetRoute);

  // Nothing relevant/permitted for this screen → don't render the button.
  if (articles.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={variant} size={size} className="gap-1.5" aria-label="Abrir ajuda da tela">
          <HelpCircle className="h-4 w-4" />
          {size !== "icon" && label}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-display">Ajuda desta tela</SheetTitle>
          <SheetDescription>
            Orientações rápidas e compatíveis com seu acesso.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 -mx-6 px-6 mt-2">
          <div className="space-y-6 pb-6">
            {articles.map((a, i) => (
              <div key={a.id} className="space-y-6">
                {i > 0 && <Separator />}
                <ArticleView article={a} />
              </div>
            ))}
          </div>
        </ScrollArea>
        <Separator />
        <Button asChild variant="ghost" size="sm" className="justify-start gap-2" onClick={() => setOpen(false)}>
          <Link to={ROUTES.ajuda}>
            <BookOpen className="h-4 w-4" />
            Abrir a Central de Ajuda
          </Link>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
