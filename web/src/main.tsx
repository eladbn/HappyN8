import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './styles-v2.css';
import './styles-v3.css';
import './styles-v4.css';
import { request, setUnauthorizedHandler } from './api/client';
import { CatalogProvider } from './lib/catalog';
import { Spinner, ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { AgentsPage } from './pages/AgentsPage';
import { CredentialsPage } from './pages/CredentialsPage';
import { EditorPage } from './editor/EditorPage';
import { ActivityPage } from './pages/ActivityPage';
import { UsersPage } from './pages/UsersPage';
import { ConnectionPage } from './pages/ConnectionPage';
import { DataTablesPage } from './pages/DataTablesPage';
import { TablePage } from './pages/datatables/TablePage';
import { VariablesPage } from './pages/VariablesPage';
import { SessionProvider } from './lib/session';
import { hideSplash } from './lib/splash';
import type { AppUser } from './api/types';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 5000 } },
});

function App() {
  const [state, setState] = useState<{ user: AppUser | null } | null>(null);
  const load = () => request<{ authed: boolean; user: AppUser | null }>('GET', '/api/session')
    .then((s) => setState({ user: s.authed ? s.user : null }))
    .catch(() => setState({ user: null }));

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ user: null }));
    load();
  }, []);
  useEffect(() => { if (state !== null) hideSplash(); }, [state]);

  if (state === null) return <div className="center" style={{ minHeight: '100vh' }}><Spinner /></div>;
  if (!state.user) return <LoginPage onDone={() => { queryClient.clear(); load(); }} />;

  const signOut = () => request('POST', '/api/logout').finally(() => { queryClient.clear(); setState({ user: null }); });
  return (
    <SessionProvider value={{ user: state.user, setUser: (user) => setState({ user }), signOut }}>
      <CatalogProvider>
        <Routes>
          <Route path="/workflows/:id" element={<EditorPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/workflows" replace />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/executions" element={<ExecutionsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/credentials" element={<CredentialsPage />} />
            <Route path="/data-tables" element={<DataTablesPage />} />
            <Route path="/data-tables/:id" element={<TablePage />} />
            <Route path="/variables" element={<VariablesPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/users" element={state.user.role === 'admin' ? <UsersPage /> : <Navigate to="/workflows" replace />} />
            <Route path="/n8n-connection" element={state.user.role === 'admin' ? <ConnectionPage /> : <Navigate to="/workflows" replace />} />
            <Route path="*" element={<Navigate to="/workflows" replace />} />
          </Route>
        </Routes>
      </CatalogProvider>
    </SessionProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
