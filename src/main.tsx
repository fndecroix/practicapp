import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { SessionsProvider } from './SessionsContext';
import { SyncProvider } from './SyncContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <SessionsProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </SessionsProvider>
    </HashRouter>
  </StrictMode>,
);
