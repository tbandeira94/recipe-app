import type { ReactNode } from 'react'
import { BookIcon, SearchIcon, SettingsIcon } from './Icons'

export type Tab = 'recipes' | 'search' | 'settings'

interface LayoutProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  children: ReactNode
  updateAvailable: boolean
  onUpdate: () => void
}

export function Layout({ activeTab, onTabChange, children, updateAvailable, onUpdate }: LayoutProps) {
  const tabs = [
    { id: 'recipes' as const, label: 'Recipes', icon: BookIcon },
    { id: 'search' as const, label: 'Search', icon: SearchIcon },
    { id: 'settings' as const, label: 'Settings', icon: SettingsIcon },
  ]
  return (
    <div className="app-shell">
      {updateAvailable && <button className="update-banner" onClick={onUpdate}>A fresh version is ready. Tap to update.</button>}
      <main className="main-content">{children}</main>
      <nav className="tab-bar" aria-label="Main navigation">
        {tabs.map(({ id, label, icon: TabIcon }) => (
          <button key={id} className={activeTab === id ? 'tab active' : 'tab'} onClick={() => onTabChange(id)} aria-current={activeTab === id ? 'page' : undefined}>
            <TabIcon size={23} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
