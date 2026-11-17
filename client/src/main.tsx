import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { GroupsPage } from './pages/Groups';
import { GroupDetailPage } from './pages/GroupDetail';
import { FriendDetailPage, FriendsPage } from './pages/Friends';
import { ActivityPage } from './pages/Activity';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-extrabold text-mint-500">404</p>
      <p className="mt-2 text-ink-soft">That page does not exist.</p>
      <Link to="/" className="mt-4 inline-block font-semibold text-mint-600 hover:underline">
        Back to the dashboard
      </Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="groups/:id" element={<GroupDetailPage />} />
            <Route path="friends" element={<FriendsPage />} />
            <Route path="friends/:id" element={<FriendDetailPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
