import { test as base, expect } from '@playwright/test';
import { FakeSupabase, SESSION_KEY, makeSession } from './fakeSupabase.js';

export const USER = {
  id: 'user-e2e',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@eafit.test',
  app_metadata: { provider: 'email' },
  // Conta já cadastrada: com peso preenchido o app pula o cadastro inicial, e com
  // o aceite dos termos gravado ele não pede a leitura de novo, e o questionário
  // de saúde conta como pulado hoje.
  user_metadata: { peso: 80, altura: 180, idade: 30, sexo: 'M', objetivo: 'Ganho de massa', nivel: 'Intermediário', termsAcceptedAt: '2026-06-01T12:00:00Z', parqSkippedAt: new Date().toISOString() },
  created_at: '2026-01-01T00:00:00Z',
};

export const EXERCISES = [
  { nome: 'Supino Reto', series: '3', reps: '8-10', descanso: '60s' },
];

// `app`: página já logada, com o Supabase falso ligado e um plano ativo.
export const test = base.extend({
  // (o 2º argumento é o `use` do Playwright; com esse nome o lint o confunde com um hook do React)
  fake: async ({ context }, provide) => {
    const fake = new FakeSupabase({ user: USER });
    fake.seedPlan({ exercises: EXERCISES });
    await fake.install(context);
    // A sessão fica no localStorage do app, como depois de um login de verdade.
    await context.addInitScript(([key, session, userId]) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session));
        // Sem o convite para instalar o app e sem o tutorial de boas-vindas na frente.
        sessionStorage.setItem('eafit_install_skipped', '1');
        localStorage.setItem(`eafit_tutorial_done:aluno:${userId}`, '1');
        // E sem o check-in do dia na frente (conta como pulado hoje).
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        localStorage.setItem(`eafit_checkin_skip:${userId}`, today);
      } catch { /* sem storage */ }
    }, [SESSION_KEY, makeSession(USER), USER.id]);
    await provide(fake);
  },
});

export { expect };
