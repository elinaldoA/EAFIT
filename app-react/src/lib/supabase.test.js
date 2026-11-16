import { describe, it, expect } from 'vitest';
import { db } from './supabase';

describe('cliente do Supabase', () => {
  it('não repete sozinho as leituras que falham na rede', () => {
    // Com as repetições do postgrest-js (1 s, 2 s, 4 s) abrir o app sem rede
    // levava ~15 s de carregamento antes de cair no plano guardado no aparelho.
    // O supabase-js não repassa a opção ao criar o cliente: o ajuste é feito
    // no campo interno `rest`, então este teste avisa se uma atualização o mudar.
    expect(db.rest).toBeTruthy();
    expect(db.rest.retry).toBe(false);
  });
});
