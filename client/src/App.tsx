import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WorkshopProvider } from './context/WorkshopContext';
import { UserProvider } from './context/UserContext';
import { WorkflowProvider } from './context/WorkflowContext';
import { WorkshopDemoLanding } from './pages/WorkshopDemoLanding';
import { TraceDataViewerDemo } from './pages/TraceDataViewerDemo';
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
                <Route path="/" element={<WorkshopDemoLanding />} />
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
