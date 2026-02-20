import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { Toaster } from "@/components/ui/toaster"
import UserNotRegisteredError from '@/components/UserNotRegisteredError'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import NavigationTracker from '@/lib/NavigationTracker'
import PushNotificationsManager from '@/lib/PushNotificationsManager'
import { queryClientInstance } from '@/lib/query-client'
import { SocketProvider } from '@/lib/SocketContext'
import VisualEditAgent from '@/lib/VisualEditAgent'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Route, BrowserRouter as Router, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import AppFooter from './components/navigation/AppFooter'
import PageNotFound from './lib/PageNotFound'
import { pagesConfig } from './pages.config'
import FindingParticipants from './pages/FindingParticipants'
import Global from './pages/Global'
import GlobalLobby from './pages/GlobalLobby'

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;
  const p = pathname?.toLowerCase?.() || pathname;
  const isPublicPage = (
    p === '/' ||
    p === '/about' ||
    p === '/contact' ||
    p === '/terms' ||
    p === '/privacy' ||
    p === '/login' ||
    p === '/register' ||
    p === '/organiser' ||
    p === '/judgepanel'
  );

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      if (!isPublicPage) {
        navigateToLogin();
        return null;
      }
      // allow public pages without redirect
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={isAuthenticated ? 'Dashboard' : mainPageKey}>
          {isAuthenticated ? <pagesConfig.Pages.Dashboard /> : <MainPage />}
        </LayoutWrapper>
      } />
      <Route
        path="/global"
        element={
          <LayoutWrapper currentPageName="Global">
            <Global />
          </LayoutWrapper>
        }
      />
      <Route
        path="/finding"
        element={
          <LayoutWrapper currentPageName="Global">
            <FindingParticipants />
          </LayoutWrapper>
        }
      />
      <Route
        path="/lobby/:roomId"
        element={
          <LayoutWrapper currentPageName="Global">
            <GlobalLobby />
          </LayoutWrapper>
        }
      />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


// Component to handle service worker messages for navigation
const ServiceWorkerNavigator = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'NAVIGATE') {
        const url = event.data.url;
        if (url) {
          // Extract path from URL (remove origin if present)
          const path = url.startsWith('http') 
            ? new URL(url).pathname + new URL(url).search
            : url;
          navigate(path);
        }
      }
    };

    // Listen for messages from service worker
    navigator.serviceWorker?.addEventListener('message', handleMessage);
    
    // Also handle if service worker is already controlling
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.addEventListener('message', handleMessage);
    }

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.removeEventListener('message', handleMessage);
      }
    };
  }, [navigate]);

  return null;
};

function App() {

  return (
    <AuthProvider>
      <SocketProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ServiceWorkerNavigator />
            <NavigationTracker />
            <PushNotificationsManager />
            <AuthenticatedApp />
            <AppFooter />
          </Router>
          <Toaster />
          <SonnerToaster />
          <VisualEditAgent />
        </QueryClientProvider>
      </SocketProvider>
    </AuthProvider>
  )
}

export default App
