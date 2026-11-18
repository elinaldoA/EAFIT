import { createContext, useContext } from 'react';

// confirm({ title, message, confirmLabel, danger, requireText, reauth, fields })
// ou confirm('texto')  -> Promise<boolean>. Com `fields` ([{ name, label,
// defaultValue, multiline, required, readOnly, placeholder }]) o diálogo pede
// texto e resolve com { [name]: valor } (ou false se cancelar); ver usePrompt. Sem provider (testes de páginas
// soltas) cai no window.confirm, então telas migradas continuam funcionando sozinhas.
export const ConfirmContext = createContext(null);

// Texto solto vira { message }; ações que apagam/removem ganham botão vermelho.
export function normalizeConfirm(opts) {
  if (typeof opts !== 'string') return opts || {};
  return { message: opts, danger: /^(excluir|apagar|remover|desfazer|desconectar|bloquear|cancelar)/i.test(opts) };
}

// prompt({ title, message, label, defaultValue, multiline, required, confirmLabel })
// -> Promise<string | null>: no lugar do window.prompt (null = cancelou).
export function usePrompt() {
  const ask = useContext(ConfirmContext);
  return async ({ label, defaultValue = '', multiline, required = true, placeholder, ...rest }) => {
    if (!ask) {
      const text = [rest.title, rest.message, label].filter(Boolean).join('\n\n');
      return window.prompt(text, defaultValue);
    }
    const res = await ask({
      confirmLabel: 'Salvar',
      ...rest,
      fields: [{ name: 'value', label, defaultValue, multiline, required, placeholder }],
    });
    return res ? res.value.trim() : null;
  };
}

export function useConfirm() {
  const ask = useContext(ConfirmContext);
  if (ask) return ask;
  return async opts => {
    const { title, message, fields } = normalizeConfirm(opts);
    if (fields) {
      const out = {};
      for (const f of fields) {
        const v = window.prompt([title, message, f.label].filter(Boolean).join('\n\n'), f.defaultValue || '');
        if (v === null) return false;
        out[f.name] = v;
      }
      return out;
    }
    return window.confirm([title, message].filter(Boolean).join('\n\n'));
  };
}
