import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import ClientDashboard from './pages/ClientDashboard';
import FreelancerDashboard from './pages/FreelancerDashboard';
import ProfilePage from './pages/ProfilePage';
import { TaskProvider } from './context/TaskContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import { Navigate } from 'react-router-dom';
import './index.css';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading session...</div>;
  
  if (!user) {
    return <Navigate to="/auth" />;
  }

  if (requiredRole && user.user_metadata?.role !== requiredRole) {
    return <Navigate to="/" />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <TaskProvider>
          <Router>
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
              </Routes>
            </div>
          </Router>
        </TaskProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
