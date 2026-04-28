import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { WorkshopProvider } from './context/WorkshopContext';
import { UserProvider } from './context/UserContext';
import { WorkflowProvider } from './context/WorkflowContext';
import { TraceDataViewerDemo } from './pages/TraceDataViewerDemo';
import { UserShell } from './pages/shell/UserShell';
import { WorkshopShell } from './pages/shell/WorkshopShell';
import { WorkflowShell } from './pages/shell/WorkflowShell';
import { SprintWorkspacePage } from './pages/workspace/SprintWorkspacePage';
import { ErrorBoundary, RootErrorFallback } from './components/ErrorBoundary';
import { useWorkshopContext } from './context/WorkshopContext';
import { useUser } from './context/UserContext';
import { useWorkshopMeta } from './hooks/useWorkshopApi';
import { ChevronRight } from 'lucide-react';
import { Toaster } from 'sonner';

function AppShellPathBar() {
  const { user } = useUser();
  const { workshopId, setWorkshopId } = useWorkshopContext();
  const { data: workshopMeta } = useWorkshopMeta(workshopId || '');
  const location = useLocation();
  const navigate = useNavigate();

  if (!user || location.pathname === '/trace-viewer-demo') {
    return null;
  }

  const hasWorkshop = !!workshopId && !workshopId.startsWith('temp-');
  const workshopLabel = hasWorkshop ? (workshopMeta?.name || 'Workshop') : 'Workshop selection';

  const handleWorkshopClick = () => {
    if (!hasWorkshop) return;
    setWorkshopId(null);
    navigate('/');
  };

  return (
    <div className="border-b px-6 py-3 bg-background">
      <nav aria-label="App shell path" className="text-xs text-muted-foreground flex items-center gap-2">
        <span className="font-semibold text-foreground">
          Me ({user.name || user.email || 'User'})
        </span>
        <ChevronRight className="h-3 w-3" />
        {hasWorkshop ? (
          <button
            type="button"
            className="font-semibold text-foreground hover:underline"
            onClick={handleWorkshopClick}
          >
            {workshopLabel}
          </button>
        ) : (
          <span className="font-semibold text-foreground">{workshopLabel}</span>
        )}
      </nav>
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      <AppShellPathBar />
      <Routes>
        <Route element={<UserShell />}>
          <Route element={<WorkshopShell />}>
            <Route element={<WorkflowShell />}>
              <Route index element={<SprintWorkspacePage />} />
              <Route path="/workshop/:workshopId" element={<SprintWorkspacePage />} />
              <Route path="/workshop/:workshopId/:phase" element={<SprintWorkspacePage />} />
            </Route>
          </Route>
        </Route>
        <Route path="/trace-viewer-demo" element={<TraceDataViewerDemo />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary fallback={(props) => <RootErrorFallback {...props} />}>
      <UserProvider>
        <WorkshopProvider>
          <WorkflowProvider>
            <Router>
              <AppRoutes />
            </Router>
            <Toaster
              position="top-right"
              expand={true}
              richColors={true}
              closeButton={true}
            />
          </WorkflowProvider>
        </WorkshopProvider>
      </UserProvider>
    </ErrorBoundary>
  );
}

export default App;
