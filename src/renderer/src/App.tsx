import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { LoginDialog } from './components/LoginDialog'
import { BatchDialog } from './components/BatchDialog'
import { DisclaimerDialog } from './components/DisclaimerDialog'
import { SearchPage } from './pages/SearchPage'
import { CloudPage } from './pages/CloudPage'
import { TasksPage } from './pages/TasksPage'
import { SettingsPage } from './pages/SettingsPage'
import { useAppStore } from './store/app-store'
import { unwrap } from './lib/api'

const PAGES = {
  search: SearchPage,
  cloud: CloudPage,
  tasks: TasksPage,
  settings: SettingsPage
}

export function App() {
  const page = useAppStore(state => state.page)
  const setAuth = useAppStore(state => state.setAuth)
  const setDisclaimerOpen = useAppStore(state => state.setDisclaimerOpen)
  const Page = PAGES[page]

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => unwrap(window.neteasehub.settings.get())
  })

  useEffect(() => {
    void unwrap(window.neteasehub.auth.getState()).then(setAuth).catch(() => undefined)
    const dispose = window.neteasehub.auth.onChanged(setAuth)
    return dispose
  }, [setAuth])

  useEffect(() => {
    if (settings && !settings.disclaimerAccepted) setDisclaimerOpen(true)
  }, [settings, setDisclaimerOpen])

  return (
    <>
      <div className="app-shell">
        <Sidebar />
        <div className="main-area">
          <Topbar />
          <main className="page-scroll">
            <Page />
          </main>
        </div>
      </div>
      <LoginDialog />
      <BatchDialog />
      <DisclaimerDialog />
    </>
  )
}
