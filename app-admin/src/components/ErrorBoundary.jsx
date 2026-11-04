import { Component } from 'react';

// Uma tela que quebra não pode deixar o painel inteiro em branco: mostra o erro
// no lugar do conteúdo (o menu continua) e oferece tentar de novo/recarregar.
// Layout usa key={pathname}, então trocar de tela já zera o erro.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Tela com erro:', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="card" role="alert">
        <h2 className="section-title">Não foi possível abrir esta tela</h2>
        <p className="form-msg form-msg--error">{String(error?.message || error)}</p>
        <p className="card-note">
          Se acabou de sair uma atualização do painel, recarregar a página resolve.
        </p>
        <div className="actions-row">
          <button className="btn btn--small" onClick={() => this.setState({ error: null })}>Tentar de novo</button>
          <button className="btn btn--primary btn--small" onClick={() => window.location.reload()}>Recarregar a página</button>
        </div>
      </div>
    );
  }
}
