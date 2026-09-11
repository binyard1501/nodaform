'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { lookupAction, type LookupResult } from '@/app/actions'
import { STATUS_LABEL } from '@/lib/types'

export function LookupForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<LookupResult, FormData>(lookupAction.bind(null, slug), {})
  return (
    <>
      <form action={action} className="stack">
        <div className="field">
          <label className="label" htmlFor="name">
            이름
          </label>
          <input id="name" name="name" className="input" autoComplete="name" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="phone">
            휴대폰 번호
          </label>
          <input id="phone" name="phone" className="input" inputMode="numeric" autoComplete="tel" required />
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
          {pending ? '찾는 중…' : '조회하기'}
        </button>
      </form>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.results && (
        <section className="stack">
          {state.results.length === 0 ? (
            <p className="status-card">일치하는 신청이 없습니다. 이름과 번호를 신청할 때와 똑같이 입력했는지 확인해 주세요.</p>
          ) : (
            <ul className="panel lookup-list">
              {state.results.map(r => (
                <li key={r.id}>
                  <Link href={`/f/${slug}/a/${r.id}`}>{r.item}</Link>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="small muted">{r.party}명</span>
                    <span className={`pill st-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
