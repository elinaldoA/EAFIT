// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(cleanup);
import ErrorBoundary from './ErrorBoundary';

function Boom() {
  throw new Error('quebrou');
}

describe('ErrorBoundary', () => {
  it('mostra o erro em vez de deixar a tela em branco', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('quebrou')).toBeTruthy();
    expect(screen.getByText('Recarregar a página')).toBeTruthy();
  });

  it('renderiza normalmente quando não há erro', () => {
    render(<ErrorBoundary><p>ok</p></ErrorBoundary>);
    expect(screen.getByText('ok')).toBeTruthy();
  });
});
