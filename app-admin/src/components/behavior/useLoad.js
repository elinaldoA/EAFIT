import { useEffect, useState } from 'react';

// Cada bloco carrega sozinho: se uma consulta falhar (ex.: migration ainda não
// aplicada), só aquele card mostra o erro e o resto da página continua.
// `load` é uma função fixa do módulo (recebe o período), pra dependência do
// efeito ser só o período.
export function useLoad(load, days) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let active = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    load(days)
      .then(data => { if (active) setState({ loading: false, data, error: '' }); })
      .catch(err => { if (active) setState({ loading: false, data: null, error: err.message || 'Falha ao carregar.' }); });
    return () => { active = false; };
  }, [load, days]);
  return state;
}
