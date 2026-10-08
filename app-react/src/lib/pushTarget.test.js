import { describe, it, expect } from 'vitest';
import { pushTargetKey, kindTargetKey, NAV_TARGETS, FEEDBACK_REPLY_TITLE } from './pushTarget';

describe('pushTargetKey', () => {
  it('cada tag de push leva à tela do assunto', () => {
    const cases = {
      'water-2026-10-08-10:00': 'agua',
      'streak-risk-2026-10-08': 'treino',
      'inactivity-2026-10-08': 'treino',
      'weekly-summary-2026-10-08': 'semana',
      'weight-update-2026-10-08': 'peso',
      'discomfort-followup-12': 'recordes',
      'pr-Supino Reto': 'recordes',
      'badge-first': 'recordes',
      'appt-abc-day': 'aula',
      'appt-response-abc': 'personal_alunos',
      'trainer-reply-u1': 'personal_recados',
      'trainer-message': 'treino',
      'trainer-alerts-2026-10-08-9': 'personal_alunos',
      'trainer-weekly-2026-41': 'personal_alunos',
      'engagement-workout_today-2026-10-08': 'treino',
      'engagement-first_workout_late-2026-10-08': 'treino',
      'engagement-invite_friends-2026-10-08': 'amigos',
    };
    for (const [tag, key] of Object.entries(cases)) expect(pushTargetKey({ tag }), tag).toBe(key);
  });

  it('toda chave devolvida tem destino definido', () => {
    const keys = ['agua', 'treino', 'semana', 'peso', 'recordes', 'aula', 'personal_alunos', 'personal_recados', 'amigos', 'feedback'];
    for (const key of keys) expect(NAV_TARGETS[key]?.tab, key).toBeTruthy();
  });

  it('resposta de feedback é reconhecida pelo título', () => {
    expect(pushTargetKey({ title: FEEDBACK_REPLY_TITLE })).toBe('feedback');
  });

  it('comunicado comum, tag desconhecida ou nada: sem destino', () => {
    expect(pushTargetKey({ title: 'Novidade no app' })).toBeNull();
    expect(pushTargetKey({ tag: 'qualquer-coisa' })).toBeNull();
    expect(pushTargetKey({ tag: 'engagement-tipo_novo-2026-10-08' })).toBeNull();
    expect(pushTargetKey()).toBeNull();
  });
});

describe('kindTargetKey', () => {
  it('separa o convite de amigos dos lembretes de treino', () => {
    expect(kindTargetKey('invite_friends')).toBe('amigos');
    expect(kindTargetKey('plan_expiring')).toBe('treino');
    expect(kindTargetKey('aviso')).toBeNull();
  });
});
