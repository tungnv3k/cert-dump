import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (import.meta.env.VITE_ENABLE_DEVTOOLS === 'true') {
  import('eruda').then(({ default: eruda }) =>
    eruda.init({ defaults: { displaySize: 50 } }),
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
