// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('./RankingCard', () => ({ default: () => <div>ranking</div> }));
vi.mock('../components/AmbassadorPanel', () => ({ AmbassadorResults: () => <div>numeros</div> }));

import ResultsPage from './ResultsPage';

const AMB = { name: 'Ana', code: 'anafit', active: true, total: 7 };

afterEach(cleanup);

describe('ResultsPage', () => {
  it('mostra o total, a próxima meta e os selos batidos', () => {
    render(<ResultsPage labels={{}} amb={AMB} />);
    expect(screen.getByText('Próxima meta: 10 cadastros')).toBeTruthy();
    expect(screen.getByText('faltam 3')).toBeTruthy();
    expect(screen.getByRole('progressbar').firstChild.style.width).toBe('40%');
    expect(screen.getByTitle('Meta de 5 batida')).toBeTruthy();
    expect(screen.getByTitle('Meta de 10')).toBeTruthy();
  });

  it('todas as metas batidas', () => {
    render(<ResultsPage labels={{}} amb={{ ...AMB, total: 1200 }} />);
    expect(screen.getByText(/bateu todas as metas/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('link pausado avisa', () => {
    render(<ResultsPage labels={{}} amb={{ ...AMB, active: false }} />);
    expect(screen.getByText(/Seu link está pausado/)).toBeTruthy();
  });
});
