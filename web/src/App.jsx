import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { ToastProvider } from './lib/toast.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Shell from './pages/app/Shell.jsx';
import Overview from './pages/app/Overview.jsx';
import Monitors from './pages/app/Monitors.jsx';
import MonitorDetail from './pages/app/MonitorDetail.jsx';
import Incidents from './pages/app/Incidents.jsx';
import DataConsole from './pages/app/DataConsole.jsx';
import Access from './pages/app/Access.jsx';
import NoAccess from './components/NoAccess.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot"><span className="boot-ring" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Gate({ perm, anyOf, children }) {
  const { can } = useAuth();
  const ok = perm ? can(perm) : anyOf.some((p) => can(p));
  return ok ? children : <NoAccess />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/app"
            element={
              <Protected>
                <Shell />
              </Protected>
            }
          >
            <Route index element={<Gate perm="monitors.view"><Overview /></Gate>} />
            <Route path="monitors" element={<Gate perm="monitors.view"><Monitors /></Gate>} />
            <Route path="monitors/:id" element={<Gate perm="monitors.view"><MonitorDetail /></Gate>} />
            <Route path="incidents" element={<Gate perm="incidents.view"><Incidents /></Gate>} />
            <Route path="incidents/:id" element={<Gate perm="incidents.view"><Incidents /></Gate>} />
            <Route path="data" element={<Gate perm="data.read"><DataConsole /></Gate>} />
            <Route path="data/:table" element={<Gate perm="data.read"><DataConsole /></Gate>} />
            <Route path="access" element={<Gate anyOf={['users.view', 'roles.manage', 'audit.view']}><Access /></Gate>} />
            <Route path="access/:tab" element={<Gate anyOf={['users.view', 'roles.manage', 'audit.view']}><Access /></Gate>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
