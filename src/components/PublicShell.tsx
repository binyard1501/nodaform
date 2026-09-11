import type { CSSProperties } from 'react'
import { inkFor } from '@/lib/color'
import type { Theme } from '@/lib/types'

export function PublicShell({
  theme,
  eyebrow,
  title,
  description,
  children,
}: {
  theme: Theme
  eyebrow?: React.ReactNode
  title: string
  description?: string
  children: React.ReactNode
}) {
  const style = { '--brand': theme.color, '--brand-ink': inkFor(theme.color) } as CSSProperties
  return (
    <div className="pub-theme" style={style}>
      {theme.cover && (
        <div className="pub-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.cover} alt="" />
        </div>
      )}
      <main className="pub">
        <header className="pub-hero">
          {theme.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="pub-logo" src={theme.logo} alt="" />
          )}
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </header>
        {children}
      </main>
    </div>
  )
}
