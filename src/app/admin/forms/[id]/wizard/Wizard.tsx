'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { publishAction, saveWizardAction } from '@/app/actions'
import type { FormRecord, Item } from '@/lib/types'
import { StepBasics, StepDesign, StepItems, StepMessages, StepPayment, StepQuestions, StepReview, StepRules, type StepProps, type WizardState } from './steps'

const STEPS = ['기본·방식', '가격과 정원', '신청서 항목', '신청 규칙', '결제·환불', '자동 알림', '디자인', '검토·게시']

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
  const [step, setStep] = useState(1)
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
  })
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [pending, start] = useTransition()

  async function save() {
    const result = await saveWizardAction(formId, s)
    if (result.error) {
      setError(result.error)
      return false
    }
    setError(null)
    setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
    return true
  }

  // A failed save must not trap the user on the current step: the error stays visible and the next move retries.
  function go(n: number) {
    start(async () => {
      await save()
      setStep(n)
      window.scrollTo({ top: 0 })
    })
  }

  function publish() {
    start(async () => {
      if (!(await save())) return
      if (initial.status === 'draft') {
        const r = await publishAction(formId)
        if (r?.error) setError(r.error)
      } else {
        router.push(`/admin/forms/${formId}`)
      }
    })
  }

  const props: StepProps = { s, update: p => setS(x => ({ ...x, ...p })), hasApplications, defaultDate, onError: setError }

  return (
    <div className="wizard">
      <ol className="rail" aria-label="단계">
        {STEPS.map((t, i) => (
          <li key={t}>
            <button type="button" aria-current={step === i + 1 ? 'step' : undefined} onClick={() => go(i + 1)} disabled={pending}>
              <span className="n">{i + 1}</span>
              <span className="t">{t}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="step-body">
        {step === 1 && <StepBasics {...props} />}
        {step === 2 && <StepItems {...props} />}
        {step === 3 && <StepQuestions {...props} />}
        {step === 4 && <StepRules {...props} />}
        {step === 5 && <StepPayment {...props} />}
        {step === 6 && <StepMessages {...props} />}
        {step === 7 && <StepDesign {...props} />}
        {step === 8 && <StepReview {...props} status={initial.status} pending={pending} onPublish={publish} />}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="wizard-nav">
          <button type="button" className="btn" onClick={() => go(step - 1)} disabled={pending || step === 1}>
            이전
          </button>
          <span className="saved">{pending ? '저장 중…' : savedAt ? `${savedAt} 저장됨` : '단계를 넘길 때마다 저장됩니다'}</span>
          {step < STEPS.length ? (
            <button type="button" className="btn btn-primary" onClick={() => go(step + 1)} disabled={pending}>
              다음
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  )
}
