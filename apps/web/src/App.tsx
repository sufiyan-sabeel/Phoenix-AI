import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import ChatWorkspace from './pages/ChatWorkspace';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ChatWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat/:sessionId"
        element={
          <ProtectedRoute>
            <ChatWorkspace />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
