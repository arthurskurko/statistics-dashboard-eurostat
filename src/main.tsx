import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import OpenMeteoApp from './OpenMeteoApp';
import WorldBankApp from './WorldBankApp';
import WhoApp from './WhoApp';
import UnifiedDashboardApp from './UnifiedDashboardApp';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 60,
    },
  },
});

const configuredBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const pathname = window.location.pathname;
const appPath =
  configuredBasePath && configuredBasePath !== '/' && pathname.startsWith(configuredBasePath)
    ? pathname.slice(configuredBasePath.length) || '/'
    : pathname;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    {appPath.startsWith('/dashboard') ? (
      <UnifiedDashboardApp />
    ) : appPath.startsWith('/worldbank') ? (
      <WorldBankApp />
    ) : appPath.startsWith('/meteo') ? (
      <OpenMeteoApp />
    ) : appPath.startsWith('/who') ? (
      <WhoApp />
    ) : (
      <App />
    )}
  </QueryClientProvider>,
);
