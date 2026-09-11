'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/app/actions'

export function ActionButton({
  action,
  children,
  variant = 'default',
  confirm,
  size = 'md',
}: {
  action: () => Promise<ActionResult>
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  confirm?: string
  size?: 'sm' | 'md'
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="action">
      <button
        type="button"
        className={`btn btn-${variant} btn-${size}`}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return
          setError(null)
          start(async () => {
            const result = await action()
            if (result?.error) setError(result.error)
          })
        }}
      >
        {pending ? '처리 중…' : children}
      </button>
      {error && (
        <span className="action-error" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
