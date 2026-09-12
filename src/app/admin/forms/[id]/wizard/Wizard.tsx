'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { publishAction, saveWizardAction } from '@/app/actions'
import { isPaid, publishChecks, type CheckStep } from '@/lib/rules'
import type { FormRecord, Item } from '@/lib/types'
import { StepBasics, StepDesign, StepItems, StepMessages, StepPayment, StepQuestions, StepReview, StepRules, type StepProps, type WizardState } from './steps'

type StepKey = CheckStep | 'messages' | 'review'

// Steps a form does not need are hidden rather than disabled: a free survey has nothing to say about
// capacity, deposits or reminders, and walking through those screens is the bulk of the drop-off.
const ALL_STEPS: { key: StepKey; label: string; show: (s: WizardState) => boolean }[] = [
  { key: 'basics', label: '기본·방식', show: () => true },
  { key: 'items', label: '가격과 정원', show: s => s.kind !== 'survey' },
  { key: 'questions', label: '신청서 항목', show: () => true },
  { key: 'rules', label: '신청 규칙', show: s => s.kind !== 'survey' },
  { key: 'payment', label: '결제·환불', show: s => s.kind !== 'survey' && isPaid(s.offer, s.items) },
  { key: 'messages', label: '자동 알림', show: s => s.kind !== 'survey' },
  { key: 'design', label: '디자인', show: () => true },
  { key: 'review', label: '검토·게시', show: () => true },
]

export function Wizard({
  formId,
  initial,
  initialItems,
  hasApplications,
  defaultDate,
}: {
  formId: string
  initial: FormRecord
  initialItems: Item[]
  hasApplications: boolean
  defaultDate: string
}) {
  const router = useRouter()
  const [stepKey, setStepKey] = useState<StepKey>('basics')
  const [s, setS] = useState<WizardState>({
    title: initial.title,
    slug: initial.slug,
    description: initial.description,
    offer: initial.offer,
    items: initialItems,
    questions: initial.questions,
    theme: initial.theme,
    mode: initial.mode,
    customHtml: initial.customHtml,
    kind: initial.kind,
  })
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [autosaving, setAutosaving] = useState(false)
  const [pending, start] = useTransition()

  const save = useCallback(async (state: WizardState) => {
    const result = await saveWizardAction(formId, state)
    if (result.error) {
      setError(result.error)
      return false
    }
    setError(null)
    setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
    return true
  }, [formId])

  const steps = ALL_STEPS.filter(x => x.show(s))
  // A step can disappear under the user (turning a paid form free while standing on 결제·환불),
  // so the position is tracked by key and only resolved to an index at render time.
  const found = steps.findIndex(x => x.key === stepKey)
  const order = ALL_STEPS.findIndex(x => x.key === stepKey)
  // When the current step vanishes, fall back to the nearest visible step before it rather than to the start.
  const index = found >= 0 ? found : Math.max(0, steps.filter(x => ALL_STEPS.findIndex(y => y.key === x.key) < order).length - 1)
  const current = steps[index]
  const checks = publishChecks(s.offer, s.items, s.questions, s.mode, s.customHtml)
  const blocking = checks.find(c => c.level === 'error')

  // Autosave: edits are persisted about 2 seconds after typing stops, so closing the tab mid-step
  // does not lose them. Step navigation still saves immediately.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const t = setTimeout(() => {
      setAutosaving(true)
      void save(s).finally(() => setAutosaving(false))
    }, 2000)
    return () => clearTimeout(t)
  }, [s, save])

  // A failed save must not trap the user on the current step: the error stays visible and the next move retries.
  function go(key: StepKey) {
    start(async () => {
      await save(s)
      setStepKey(key)
      window.scrollTo({ top: 0 })
    })
  }

  function publish() {
    start(async () => {
      if (!(await save(s))) return
      if (blocking) {
        setError(blocking.text)
        if (blocking.step && steps.some(x => x.key === blocking.step)) setStepKey(blocking.step)
        window.scrollTo({ top: 0 })
        return
      }
      if (initial.status === 'draft') {
        const r = await publishAction(formId)
        if (r?.error) setError(r.error)
      } else {
        router.push(`/admin/forms/${formId}`)
      }
    })
  }

  const props: StepProps = { s, update: p => setS(x => ({ ...x, ...p })), hasApplications, defaultDate, onError: setError }
  const key = current.key

  return (
    <div className="wizard">
      <ol className="rail" aria-label="단계">
        {steps.map((x, i) => (
          <li key={x.key}>
            <button type="button" aria-current={key === x.key ? 'step' : undefined} onClick={() => go(x.key)} disabled={pending}>
              <span className="n">{i + 1}</span>
              <span className="t">{x.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="step-body">
        {key === 'basics' && <StepBasics {...props} />}
        {key === 'items' && <StepItems {...props} />}
        {key === 'questions' && <StepQuestions {...props} />}
        {key === 'rules' && <StepRules {...props} />}
        {key === 'payment' && <StepPayment {...props} />}
        {key === 'messages' && <StepMessages {...props} />}
        {key === 'design' && <StepDesign {...props} />}
        {key === 'review' && <StepReview {...props} status={initial.status} pending={pending} onPublish={publish} />}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="wizard-nav">
          <button type="button" className="btn" onClick={() => go(steps[index - 1].key)} disabled={pending || index === 0}>
            이전
          </button>
          <span className="saved">
            {pending || autosaving ? '저장 중…' : savedAt ? `${savedAt} 자동 저장됨` : '입력하는 동안 자동으로 저장됩니다'}
          </span>
          <div className="row">
            {/* 게시는 마지막 단계까지 가지 않아도 된다. 빠진 항목이 있으면 그 단계로 보낸다. */}
            {key !== 'review' && (
              <button type="button" className={blocking ? 'btn' : 'btn btn-primary'} onClick={publish} disabled={pending}>
                {initial.status === 'draft' ? '게시하기' : '변경 사항 저장'}
              </button>
            )}
            {index < steps.length - 1 && (
              <button type="button" className="btn btn-primary" onClick={() => go(steps[index + 1].key)} disabled={pending}>
                다음
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
