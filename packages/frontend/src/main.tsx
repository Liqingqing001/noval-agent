import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { IS_DEMO } from './lib/runtime'

async function start() {
  if (IS_DEMO) await (await import('./demo/bootstrap')).initializeDemo();
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
}
void start();
