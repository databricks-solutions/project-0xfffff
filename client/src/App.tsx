import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WorkshopProvider } from './context/WorkshopContext';
import { UserProvider } from './context/UserContext';
import { WorkflowProvider } from './context/WorkflowContext';
import { TraceDataViewerDemo } from './pages/TraceDataViewerDemo';
import { UserShell } from './pages/shell/UserShell';
import { WorkshopShell } from './pages/shell/WorkshopShell';
import { WorkflowShell } from './pages/shell/WorkflowShell';
import { SprintWorkspacePage } from './pages/workspace/SprintWorkspacePage';
import { ErrorBoundary, RootErrorFallback } from './components/ErrorBoundary';
import { Toaster } from 'sonner';

function App() {
  return (
    <ErrorBoundary fallback={(props) => <RootErrorFallback {...props} />}>
      <UserProvider>
        <WorkshopProvider>
          <WorkflowProvider>
            <Router>
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
