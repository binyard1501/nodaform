'use client'

import { useActionState } from 'react'
import { signUpAction, type ActionResult } from '@/app/actions'

export function SignUpForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(signUpAction, {})
  return (
    <form action={action} className="stack">
      <div className="field">
        <label className="label" htmlFor="workspace">
          워크스페이스 이름
        </label>
        <input id="workspace" name="workspace" className="input" placeholder="예: 노다공방" required />
      </div>
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
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
        <span className="small muted">8자 이상</span>
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
        {pending ? '만드는 중…' : '워크스페이스 만들기'}
      </button>
    </form>
  )
}
