import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { App } from './App'
import { PreviewProvider } from './components/PreviewPlayer'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PreviewProvider>
        <App />
        <Toaster
          position="top-right"
          theme="dark"
          richColors
          closeButton
          toastOptions={{ style: { background: '#18181d', border: '1px solid rgba(255,255,255,.1)' } }}
        />
      </PreviewProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
