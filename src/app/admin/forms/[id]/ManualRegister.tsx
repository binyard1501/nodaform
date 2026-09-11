'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { manualRegisterAction, type ActionResult } from '@/app/actions'
import { ItemOptions, type ItemOption } from '@/components/ItemOptions'

export function ManualRegister({
  formId,
  items,
  paid,
  deposit,
  onsite,
}: {
  formId: string
  items: ItemOption[]
  paid: boolean
  deposit: boolean
  onsite: boolean
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(manualRegisterAction.bind(null, formId), {})
  const [method, setMethod] = useState(deposit ? 'deposit' : 'onsite')
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.message) ref.current?.reset()
  }, [state])

  return (
    <details className="panel manual">
      <summary>수기 등록 · 전화나 현장에서 받은 신청을 직접 넣습니다</summary>
      <form ref={ref} action={action} className="manual-grid">
        <label className="field">
          <span className="label">항목</span>
          <select name="itemId" className="input input-sm" required>
            <ItemOptions items={items} />
          </select>
        </label>
        <label className="field">
          <span className="label">이름</span>
          <input name="name" className="input input-sm" required />
        </label>
        <label className="field">
          <span className="label">연락처</span>
          <input name="phone" className="input input-sm" inputMode="numeric" required />
        </label>
        <label className="field">
          <span className="label">인원</span>
          <input name="party" type="number" min={1} defaultValue={1} className="input input-sm" />
        </label>
        {paid && (
          <label className="field">
            <span className="label">결제</span>
            <select name="method" className="input input-sm" value={method} onChange={e => setMethod(e.target.value)}>
              {deposit && <option value="deposit">무통장</option>}
              {onsite && <option value="onsite">현장</option>}
            </select>
          </label>
        )}
        {paid && method === 'deposit' && (
          <label className="field">
            <span className="label">입금</span>
            <select name="status" className="input input-sm" defaultValue="confirmed">
              <option value="confirmed">입금 받음 · 바로 확정</option>
              <option value="pending_deposit">아직 · 입금 대기</option>
            </select>
          </label>
        )}
        <label className="field wide">
          <span className="label">메모</span>
          <input name="memo" className="input input-sm" placeholder="예: 전화 신청, 회원사 대표 요청" />
        </label>
        <label className="check wide small">
          <input type="checkbox" name="allowOver" />
          <span>정원 초과 허용 · 자리가 없어도 등록합니다</span>
        </label>
        <div className="row wide">
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? '등록 중…' : '등록'}
          </button>
          {state.message && <span className="small" style={{ color: 'var(--accent)' }}>{state.message}</span>}
          {state.error && (
            <span className="action-error" role="alert">
              {state.error}
            </span>
          )}
        </div>
      </form>
    </details>
  )
}
