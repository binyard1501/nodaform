'use client'

import { useActionState } from 'react'
import { loginAction, type ActionResult } from '@/app/actions'

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(loginAction, {})
  return (
    <form action={action} className="stack">
      <div className="field">
        <label className="label" htmlFor="email">
          이메일
        </label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">
          비밀번호
        </label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
        {pending ? '로그인 중…' : '로그인'}
      </button>
    </form>
  )
}
