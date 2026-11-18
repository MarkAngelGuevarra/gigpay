import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

describe('Pilot tools feature flag and telemetry gating', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('hides PilotIntakeBanner, PilotGuideWidget, Navbar pill, and Analytics when VITE_ENABLE_PILOT_TOOLS is unset', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    vi.stubEnv('VITE_ENABLE_PILOT_TOOLS', undefined);
    vi.doMock('@vercel/analytics/react', () => ({
      Analytics: () => <div data-testid="vercel-analytics" />,
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network in unit test'));

    const { default: App } = await import('../App.jsx');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Smart Escrow/i })).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Pilot Program Intake Banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tester Feedback Form/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Testnet Guide/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('vercel-analytics')).not.toBeInTheDocument();
    expect(localStorage.getItem('gigpay_guide_state_v1')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('toggles dashboard pilot feedback cards on ClientDashboard and FreelancerDashboard via VITE_ENABLE_PILOT_TOOLS', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');

    const renderDashboards = async () => {
      vi.resetModules();
      localStorage.clear();
      const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
      const { ToastProvider } = await import('../context/ToastContext.jsx');
      const { TaskProvider } = await import('../context/TaskContext.jsx');
      const { default: ClientDashboard } = await import('../pages/ClientDashboard.jsx');
      const { default: FreelancerDashboard } = await import('../pages/FreelancerDashboard.jsx');
      const { useEffect } = await import('react');

      const SimBoot = ({ role, children }) => {
        const { user, loginSimulationMode } = useAuth();
        useEffect(() => {
          if (!user) loginSimulationMode(role);
        }, [user, loginSimulationMode, role]);
        return user ? children : null;
      };

      const clientView = render(
        <MemoryRouter>
          <AuthProvider>
            <ToastProvider>
              <TaskProvider>
                <SimBoot role="client">
                  <ClientDashboard />
                </SimBoot>
              </TaskProvider>
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Lock Funds in Escrow/i })).toBeInTheDocument();
      });
      const clientHasFeedback = Boolean(screen.queryByText(/Submit 60s Pilot Feedback/i));
      clientView.unmount();

      localStorage.clear();
      const freelancerView = render(
        <MemoryRouter>
          <AuthProvider>
            <ToastProvider>
              <TaskProvider>
                <SimBoot role="freelancer">
                  <FreelancerDashboard />
                </SimBoot>
              </TaskProvider>
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Available Funded Tasks/i)).toBeInTheDocument();
      });
      const freelancerHasFeedback = Boolean(screen.queryByText(/Early Tester Feedback/i));
      freelancerView.unmount();

      return { clientHasFeedback, freelancerHasFeedback };
    };

    vi.stubEnv('VITE_ENABLE_PILOT_TOOLS', 'false');
    expect(await renderDashboards()).toEqual({
      clientHasFeedback: false,
      freelancerHasFeedback: false,
    });

    vi.stubEnv('VITE_ENABLE_PILOT_TOOLS', 'true');
    expect(await renderDashboards()).toEqual({
      clientHasFeedback: true,
      freelancerHasFeedback: true,
    });
  });

  it('renders PilotIntakeBanner, PilotGuideWidget, and Navbar pill when VITE_ENABLE_PILOT_TOOLS=true', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    vi.stubEnv('VITE_ENABLE_PILOT_TOOLS', 'true');
    vi.doMock('@vercel/analytics/react', () => ({
      Analytics: () => <div data-testid="vercel-analytics" />,
    }));

    const { default: App } = await import('../App.jsx');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Pilot Program Intake Banner')).toBeInTheDocument();
    });
    expect(screen.getByText(/Tester Feedback Form/i)).toBeInTheDocument();
    expect(screen.getByText(/Testnet Guide/i)).toBeInTheDocument();
  });

  it('requires VITE_ENABLE_PILOT_TOOLS=true, non-empty webhook URL, and offline-false for Google Sheets sync', async () => {
    const sent = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      sent.push({ url, body: init?.body });
      return new Response('{}');
    });

    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    vi.stubEnv('VITE_ENABLE_PILOT_TOOLS', 'false');
    vi.stubEnv('VITE_GOOGLE_SHEETS_WEBHOOK_URL', 'https://example.invalid/webhook');

    const sheets = await import('../lib/sheetsSync.js');
    expect(sheets.isGoogleSheetsSyncEnabled()).toBe(false);

    vi.stubEnv('VITE_ENABLE_PILOT_TOOLS', 'true');
    vi.stubEnv('VITE_GOOGLE_SHEETS_WEBHOOK_URL', '');
    expect(sheets.isGoogleSheetsSyncEnabled()).toBe(false);

    vi.stubEnv('VITE_GOOGLE_SHEETS_WEBHOOK_URL', 'https://example.invalid/webhook');
    expect(sheets.isGoogleSheetsSyncEnabled()).toBe(true);
    await sheets.recordStudentToGoogleSheet({
      emailForSourceDetection: 'student@umak.edu.ph',
      programSection: 'Client',
      walletAddress: 'GTEST',
    });
    expect(sent).toHaveLength(1);
    expect(String(sent[0].body)).not.toContain('student@umak.edu.ph');

    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    expect(sheets.isGoogleSheetsSyncEnabled()).toBe(false);
    await sheets.recordStudentToGoogleSheet({
      emailForSourceDetection: 'student@umak.edu.ph',
      programSection: 'Client',
      walletAddress: 'GTEST',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
