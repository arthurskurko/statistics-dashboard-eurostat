import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import WorldBankApp from './WorldBankApp';
import WhoApp from './WhoApp';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    {window.location.pathname.startsWith('/worldbank') ? (
      <WorldBankApp />
    ) : window.location.pathname.startsWith('/who') ? (
      <WhoApp />
    ) : (
      <App />
    )}
  </QueryClientProvider>,
);
