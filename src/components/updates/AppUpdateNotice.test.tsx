import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const updateState = vi.hoisted(() => ({
  status: 'available',
  remoteBuild: {
    versionName: '1.3.6',
    digest: `sha256:${'a'.repeat(64)}`,
  },
  decision: { status: 'available' },
  dismissedDigest: null,
  dismissCurrentBuild: vi.fn(),
}));

vi.mock('@/store/appUpdateStore', () => ({
  useAppUpdateStore: (selector: (state: typeof updateState) => unknown) => selector(updateState),
}));

vi.mock('@/lib/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      key === 'appUpdateAvailableNotice'
        ? `MHL Music ${vars?.version} ya está disponible.`
        : key,
  }),
}));

import { AppUpdateNotice } from './AppUpdateNotice';

describe('AppUpdateNotice', () => {
  it('shows an available update without downloading automatically', () => {
    render(
      <MemoryRouter>
        <AppUpdateNotice />
      </MemoryRouter>,
    );

    expect(screen.getByText(/ya está disponible/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /descargar|download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /instalar|install/i })).not.toBeInTheDocument();
  });
});
