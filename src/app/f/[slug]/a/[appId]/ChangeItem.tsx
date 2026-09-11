'use client'

import { useState, useTransition } from 'react'
import { changeItemAction } from '@/app/actions'
import { ItemOptions, type ItemOption } from '@/components/ItemOptions'

export function ChangeItem({ appId, options }: { appId: string; options: ItemOption[] }) {
  const [target, setTarget] = useState(options[0]?.id ?? '')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <details className="panel change">
      <summary>시간 바꾸기</summary>
      <div className="stack" style={{ padding: '4px 16px 16px' }}>
        <p className="small muted">가격이 같고 자리가 남은 시간으로만 바꿀 수 있습니다. 바꾸면 지금 시간의 자리는 대기 중인 분께 넘어갑니다.</p>
        <div className="inline-inputs">
          <select className="input" style={{ width: 'auto' }} value={target} onChange={e => setTarget(e.target.value)} aria-label="바꿀 시간">
            <ItemOptions items={options} />
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !target}
            onClick={() =>
              start(async () => {
                setError(null)
                const r = await changeItemAction(appId, target)
                if (r.error) setError(r.error)
              })
            }
          >
            {pending ? '바꾸는 중…' : '이 시간으로 바꾸기'}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
