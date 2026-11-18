import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import ClientDashboard from './pages/ClientDashboard';
import FreelancerDashboard from './pages/FreelancerDashboard';
import ProfilePage from './pages/ProfilePage';
import { TaskProvider } from './context/TaskContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import ErrorBoundary from './components/ErrorBoundary';
import PilotGuideWidget from './components/PilotGuideWidget';
import PilotIntakeBanner from './components/PilotIntakeBanner';
import { Analytics } from '@vercel/analytics/react';
import { isLocalhostHostname, isOfflineDemoEnabled, isPilotToolsEnabled, isProdMode } from './lib/env';
import './index.css';

export const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, isLoading, activeRole, isSimulationMode } = useAuth();
  
  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading session...</div>;
  
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

function App() {
  const pilotToolsEnabled = isPilotToolsEnabled();
  const analyticsEnabled = isProdMode() && !isOfflineDemoEnabled() && !isLocalhostHostname();

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <TaskProvider>
            <Router>
              {pilotToolsEnabled && <PilotIntakeBanner />}
              <div className="container">
                <Navbar />
                <Routes>
                  <Route path="/" element={<LandingPage />} />
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
                  {/* Unknown or mistyped URLs (e.g. /ledger) go home instead of rendering a blank page. */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
              {pilotToolsEnabled && <PilotGuideWidget />}
              {analyticsEnabled && <Analytics />}
            </Router>
          </TaskProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
