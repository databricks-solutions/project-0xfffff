import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkshopProvider, useWorkshopContext } from './context/WorkshopContext';
import { UserProvider, useUser } from './context/UserContext';
import { WorkflowProvider } from './context/WorkflowContext';
import { WorkshopDemoLanding } from './pages/WorkshopDemoLanding';
import { TraceDataViewerDemo } from './pages/TraceDataViewerDemo';
import { Toaster } from 'sonner';

// Create a client
const queryClient = new QueryClient();

function AuthSync() {
  const { user } = useUser();
  const { workshopId, setWorkshopId } = useWorkshopContext();

  React.useEffect(() => {
    if (user?.workshop_id && user.workshop_id !== workshopId) {
      setWorkshopId(user.workshop_id);
    }
  }, [user, workshopId, setWorkshopId]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <WorkshopProvider>
          <AuthSync />
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
    </QueryClientProvider>
  );
}

export default App;
