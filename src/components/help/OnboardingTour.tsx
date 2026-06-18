import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useHelp } from "@/hooks/useHelp";
import { ROUTES } from "@/constants/routes";

const STORAGE_PREFIX = "onboarding_done_v1:";

/**
 * Short, role-aware onboarding shown once on first access. The "seen" state is
 * stored per-user in localStorage so it never blocks returning users. It can
 * always be revisited later from the Central de Ajuda.
 */
export function OnboardingTour() {
  const { user, loading } = useAuth();
  const { onboarding } = useHelp();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const storageKey = user ? `${STORAGE_PREFIX}${user.id}` : null;

  useEffect(() => {
    if (loading || !user || !onboarding || !storageKey) return;
    try {
      if (!localStorage.getItem(storageKey)) {
        setStep(0);
        setOpen(true);
      }
    } catch {
      /* localStorage unavailable — skip silently */
    }
  }, [loading, user, onboarding, storageKey]);

  if (!onboarding) return null;

  const steps = onboarding.steps;
  const isLast = step >= steps.length - 1;

  const finish = () => {
    try {
      if (storageKey) localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const current = steps[step];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{current.title}</DialogTitle>
          <DialogDescription className="leading-relaxed pt-1">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-5 bg-primary" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            Pular
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                Voltar
              </Button>
            )}
            {isLast ? (
              <Button size="sm" asChild onClick={finish}>
                <Link to={ROUTES.ajuda}>Concluir</Link>
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Próximo
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
