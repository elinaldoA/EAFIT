import { Component } from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from '../lib/chunkReload';

// Troca a tela branca de um erro de renderização por uma tela de recuperação.
// `variant="page"` é usado em volta de cada aba: um erro numa página mantém o
// topo e a navegação funcionando.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info?.componentStack);
    if (isChunkLoadError(error)) reloadOnceForChunkError();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isPage = this.props.variant === 'page';
    return (
      <div className={`error-screen${isPage ? ' error-screen--page' : ''}`} role="alert">
        <div className="error-screen__icon" aria-hidden="true">⚠️</div>
        <h1 className="error-screen__title">Algo deu errado</h1>
        <p className="error-screen__text">
          {isPage
            ? 'Não foi possível abrir esta tela. Seus dados estão salvos — tente de novo.'
            : 'O app encontrou um erro inesperado. Seus dados estão salvos.'}
        </p>
        <div className="error-screen__actions">
          {isPage && (
            <button type="button" className="btn btn--outline" onClick={() => this.setState({ error: null })}>
              Tentar de novo
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Recarregar o app
          </button>
        </div>
      </div>
    );
  }
}
