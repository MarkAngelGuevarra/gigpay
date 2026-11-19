import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import MobileBottomNav from './components/MobileBottomNav';
import LandingPage from './pages/LandingPage';
import ClientDashboard from './pages/ClientDashboard';
import FreelancerDashboard from './pages/FreelancerDashboard';
import ProfilePage from './pages/ProfilePage';
import AuthPage from './pages/AuthPage';
import ErrorBoundary from './components/ErrorBoundary';
import PilotGuideWidget from './components/PilotGuideWidget';
import PilotIntakeBanner from './components/PilotIntakeBanner';
import { TaskProvider } from './context/TaskContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Analytics } from '@vercel/analytics/react';
import { captureInviteFromUrl } from './lib/invite';
import { isLocalhostHostname, isOfflineDemoEnabled, isPilotToolsEnabled, isProdMode } from './lib/env';
import './index.css';

export const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, isLoading, activeRole, isSimulationMode } = useAuth();
  const location = useLocation();

  if (location.search) captureInviteFromUrl(location.search);

  if (isLoading) {
    return (
      <div className="py-16 text-center text-[14px] text-[var(--text-muted)]">
        Loading session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" />;
  }

  if (requiredRole && !isSimulationMode) {
    if (activeRole !== 'client' && activeRole !== 'freelancer') {
      return <Navigate to="/" replace />;
    }
    if (activeRole !== requiredRole) {
      return <Navigate to={activeRole === 'freelancer' ? '/freelancer' : '/client'} replace />;
    }
  }

  return children;
};

const AppShell = ({ pilotToolsEnabled }) => {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  return (
    <div className={isLanding ? 'min-h-screen' : 'min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]'}>
      {pilotToolsEnabled && <PilotIntakeBanner />}
      {!isLanding && <Navbar />}
      {isLanding ? (
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <main className="mx-auto max-w-[1120px] px-4 pt-6 pb-24 sm:px-6 sm:pb-12">
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/client"
              element={
                <ProtectedRoute requiredRole="client">
                  <ClientDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/freelancer"
              element={
                <ProtectedRoute requiredRole="freelancer">
                  <FreelancerDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      )}
      {!isLanding && <MobileBottomNav />}
      {pilotToolsEnabled && <PilotGuideWidget />}
    </div>
  );
};

function App() {
  const pilotToolsEnabled = isPilotToolsEnabled();
  const analyticsEnabled = isProdMode() && !isOfflineDemoEnabled() && !isLocalhostHostname();

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <Router>
                <AppShell pilotToolsEnabled={pilotToolsEnabled} />
                {analyticsEnabled && <Analytics />}
              </Router>
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
