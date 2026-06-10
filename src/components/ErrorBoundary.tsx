import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Optional label used in the fallback heading (e.g. the page name). */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors in a subtree and shows an elegant, recoverable
 * fallback instead of letting the whole app crash silently. Use around the
 * main pages (Dashboard, Agenda, Fazer Entrevista, etc.).
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Structured, low-noise log for support/investigation.
    console.error(
      JSON.stringify({
        scope: "ui-error-boundary",
        label: this.props.label ?? "app",
        message: error.message,
        stack: info.componentStack,
      }),
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Algo deu errado{this.props.label ? ` em ${this.props.label}` : ""}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Ocorreu um erro inesperado nesta área. Você pode tentar novamente
              ou recarregar a página.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleReset}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
            <Button onClick={() => window.location.reload()}>Recarregar página</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/** Convenience wrapper to guard a page element with the boundary. */
export function withErrorBoundary(node: ReactNode, label: string) {
  return <ErrorBoundary label={label}>{node}</ErrorBoundary>;
}
