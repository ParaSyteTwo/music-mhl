import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const updateState = vi.hoisted(() => ({
  status: 'safetyPeriod',
  remoteBuild: {
    versionName: '1.3.6',
    digest: `sha256:${'a'.repeat(64)}`,
  },
  decision: {
    status: 'safetyPeriod',
    remainingDays: 4,
  },
  dismissedDigest: null,
  dismissCurrentBuild: vi.fn(),
}));

vi.mock('@/store/appUpdateStore', () => ({
  useAppUpdateStore: (selector: (state: typeof updateState) => unknown) => selector(updateState),
}));

vi.mock('@/lib/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      key === 'appUpdateSafetyNotice'
        ? `MHL Music ${vars?.version} estará disponible en ${vars?.days} día(s).`
        : key,
  }),
}));

import { AppUpdateNotice } from './AppUpdateNotice';

describe('AppUpdateNotice', () => {
  it('shows safety information without download or install actions', () => {
    render(
      <MemoryRouter>
        <AppUpdateNotice />
      </MemoryRouter>,
    );

    expect(screen.getByText(/estará disponible en 4/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /descargar|download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /instalar|install/i })).not.toBeInTheDocument();
  });
});
