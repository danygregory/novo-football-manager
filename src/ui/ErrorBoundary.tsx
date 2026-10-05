import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describeError, isBenignError } from './errors';

interface State {
  error?: unknown;
  copied: boolean;
}

/**
 * Rede de segurança: um erro de renderização, de evento ou do laço da partida mostra uma tela de recuperação em vez de uma
 * página em branco. O progresso salvo (carreira, conquistas, ranking) fica no navegador e sobrevive ao recarregamento.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { copied: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, copied: false };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Erro na interface:', error, info.componentStack);
  }

  private onWindowError = (ev: ErrorEvent) => {
    if (isBenignError(ev.message)) return;
    this.setState({ error: ev.error ?? ev.message, copied: false });
  };

  private onRejection = (ev: PromiseRejectionEvent) => {
    const msg = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
    if (isBenignError(msg)) return;
    this.setState({ error: ev.reason, copied: false });
  };

  componentDidMount(): void {
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onRejection);
  }

  componentWillUnmount(): void {
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onRejection);
  }

  private copy = async () => {
    try {
      await navigator.clipboard.writeText(describeError(this.state.error));
      this.setState({ copied: true });
    } catch {
      /* sem permissão: o texto aparece na tela para copiar à mão */
    }
  };

  render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    const text = describeError(this.state.error);
    return (
      <div className="app" role="alert">
        <div className="panel" style={{ maxWidth: 720, margin: '60px auto' }}>
          <h2>Algo deu errado</h2>
          <p className="muted">
            O jogo encontrou um erro inesperado. Sua carreira, suas conquistas e seu ranking ficam salvos neste navegador; recarregar volta ao início.
          </p>
          <pre className="share" style={{ userSelect: 'text' }}>{text}</pre>
          <div className="row">
            <button className="primary" onClick={() => window.location.reload()}>Recarregar o jogo</button>
            <button onClick={() => void this.copy()}>{this.state.copied ? 'Copiado!' : 'Copiar detalhes'}</button>
            <button className="ghost" onClick={() => this.setState({ error: undefined })}>Tentar continuar</button>
          </div>
        </div>
      </div>
    );
  }
}
