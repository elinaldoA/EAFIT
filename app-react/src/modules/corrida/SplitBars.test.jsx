// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SplitBars from './SplitBars';

afterEach(cleanup);

describe('SplitBars', () => {
  it('sem subida mostra só o ritmo', () => {
    const { container } = render(<SplitBars splits={[330, 320]} />);
    expect(container.querySelector('.run-splits__elev')).toBeNull();
    expect(container.querySelector('.run-splits--elev')).toBeNull();
  });

  it('com subida mostra subida e descida de cada km', () => {
    render(<SplitBars splits={[330, 320, 310]} elev={[[12, 3], [0, 8]]} />);
    expect(screen.getByText('↗12 ↘3')).toBeTruthy();
    expect(screen.getByText('↗0 ↘8')).toBeTruthy();
    // km sem par na lista (corrida antiga): a linha existe, vazia.
    expect(document.querySelectorAll('.run-splits__elev')).toHaveLength(3);
    expect(screen.getByLabelText('Subida 12 m, descida 3 m')).toBeTruthy();
  });
});
