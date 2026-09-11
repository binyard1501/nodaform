'use client'

import { useActionState, useState } from 'react'
import { applyAction } from '@/app/actions'
import { formatDate, formatDateTime, formatTime, itemLabel, krw, refundText } from '@/lib/format'
import { fits, sortedRefundRules } from '@/lib/rules'
import type { FieldDef, ItemStats, Method, Offer, Questions } from '@/lib/types'

const dayOf = (s: ItemStats) => (s.startsAt ? formatDate(s.startsAt) : '')

function Field({ f }: { f: FieldDef }) {
  const name = `f_${f.id}`
  const label = (
    <>
      {f.label}
      {!f.required && <span className="faint"> · 선택</span>}
    </>
  )
  if (f.type === 'consent') {
    return (
      <label className="check">
        <input type="checkbox" name={name} required={f.required} />
        <span>
          {f.label}
          {f.required ? '' : ' (선택)'}
          {f.help && <small>{f.help}</small>}
        </span>
      </label>
    )
  }
  if (f.type === 'select' || f.type === 'multi') {
    return (
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>
          {label}
        </legend>
        {f.help && <small className="muted small">{f.help}</small>}
        <div className="option-list">
          {f.options.map(o => (
            <label key={o} className="check">
              <input type={f.type === 'select' ? 'radio' : 'checkbox'} name={name} value={o} required={f.type === 'select' && f.required} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }
  return (
    <div className="field">
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {f.type === 'textarea' ? (
        <textarea id={name} name={name} className="input" required={f.required} />
      ) : (
        <input id={name} name={name} className="input" type={f.type === 'email' ? 'email' : 'text'} required={f.required} />
      )}
      {f.help && <small className="muted small">{f.help}</small>}
    </div>
  )
}

export function ApplyForm({
  slug,
  offer,
  questions,
  stats,
  opensAt,
}: {
  slug: string
  offer: Offer
  questions: Questions
  stats: ItemStats[]
  opensAt: string | null
}) {
  const [state, formAction, pending] = useActionState(applyAction.bind(null, slug), {})
  const simple = offer.structure === 'simple'
  const firstOpen =
    stats.find(s => !s.closed && (s.remaining === null || s.remaining > 0)) ?? stats.find(s => !s.closed && offer.overflow === 'waitlist')
  const [itemId, setItemId] = useState(firstOpen?.id ?? '')
  const [party, setParty] = useState(1)
  const [method, setMethod] = useState<Method>(offer.deposit.enabled ? 'deposit' : 'onsite')
  const [day, setDay] = useState(firstOpen ? dayOf(firstOpen) : '')

  const item = stats.find(s => s.id === itemId)
  const amount = item ? (offer.free ? 0 : item.price) * party : 0
  const max = offer.party.mode === 'solo' ? 1 : offer.party.max
  const short = !!item && !fits(item.remaining, party)
  const willWait = short && offer.overflow === 'waitlist'
  const tooMany = short && offer.overflow === 'close'
  const rules = sortedRefundRules(offer.refundRules)
  const locked = !!opensAt

  const byDate = new Map<string, ItemStats[]>()
  for (const s of stats) {
    const key = s.startsAt ? formatDate(s.startsAt) : ''
    byDate.set(key, [...(byDate.get(key) ?? []), s])
  }

  const multiDay = offer.structure === 'slots' && byDate.size > 1

  const submitLabel = locked
    ? `${formatDateTime(opensAt)}에 열립니다`
    : willWait
      ? `대기 ${item!.waitlisted + 1}번으로 신청하기`
      : amount > 0 && method === 'deposit'
        ? '신청하고 입금 안내 받기'
        : '신청하기'

  return (
    <form action={formAction} className="stack" style={{ gap: 26 }}>
      {locked && (
        <div className="status-card tone-info">
          <span className="pill st-offered">예약 오픈 전</span>
          <h2>{formatDateTime(opensAt)}에 신청이 열립니다</h2>
          <p className="muted small">열리기 전에는 시간대와 남은 자리만 볼 수 있습니다. 시간이 되면 이 화면을 새로고침해 주세요.</p>
        </div>
      )}

      {simple ? (
        <>
          <input type="hidden" name="itemId" value={stats[0]?.id ?? ''} />
          {stats[0] && (stats[0].startsAt || stats[0].remaining !== null) && (
            <dl className="dl">
              {stats[0].startsAt && (
                <>
                  <dt>일시</dt>
                  <dd>{itemLabel(stats[0])}</dd>
                </>
              )}
              {stats[0].remaining !== null && (
                <>
                  <dt>남은 자리</dt>
                  <dd>{stats[0].closed ? '신청 마감' : stats[0].remaining > 0 ? `${stats[0].remaining}석` : '마감'}</dd>
                </>
              )}
            </dl>
          )}
        </>
      ) : (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 10 }}>
            {offer.structure === 'slots' ? '입장 시간' : '신청 항목'}
          </legend>
          {multiDay && (
            <div className="day-strip" role="radiogroup" aria-label="날짜">
              {[...byDate.entries()].map(([d, slots]) => {
                const available = slots.filter(s => !s.closed && (s.remaining === null || s.remaining > 0))
                const left = available.reduce((sum, s) => sum + (s.remaining ?? 0), 0)
                const allClosed = slots.every(s => s.closed)
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={day === d}
                    className={`day${available.length === 0 ? ' full' : ''}`}
                    onClick={() => {
                      setDay(d)
                      setItemId((available[0] ?? slots.find(s => !s.closed && offer.overflow === 'waitlist'))?.id ?? '')
                    }}
                  >
                    <b>{d}</b>
                    <span>{allClosed ? '마감' : available.length > 0 ? `${left}석` : offer.overflow === 'waitlist' ? '매진 · 대기' : '매진'}</span>
                  </button>
                )
              })}
            </div>
          )}
          {[...byDate.entries()].filter(([date]) => !multiDay || date === day).map(([date, slots]) => (
            <div key={date} className="stack" style={{ gap: 8 }}>
              {date && offer.structure !== 'slots' && byDate.size > 1 && <b>{date}</b>}
              <div className="slot-grid" style={offer.structure === 'single' ? { gridTemplateColumns: '1fr' } : undefined}>
                {slots.map(s => {
                  const soldOut = s.remaining === 0
                  const disabled = s.closed || (soldOut && offer.overflow !== 'waitlist')
                  const cls = s.closed ? 'closed' : soldOut ? (offer.overflow === 'waitlist' ? 'full' : 'closed') : s.remaining !== null && s.remaining <= 5 ? 'few' : ''
                  const left = s.closed
                    ? '신청 마감'
                    : soldOut
                      ? offer.overflow === 'waitlist'
                        ? `매진 · 대기 ${s.waitlisted}팀`
                        : '매진'
                      : s.remaining === null
                        ? '여유 있음'
                        : `${s.remaining}석 남음`
                  return (
                    <label key={s.id} className={`slot ${cls}`}>
                      <input type="radio" name="itemId" value={s.id} checked={itemId === s.id} disabled={disabled} onChange={() => setItemId(s.id)} />
                      <span className="time">{offer.structure === 'slots' && s.startsAt ? formatTime(s.startsAt) : s.label}</span>
                      <span className="left">
                        {left}
                        {offer.structure === 'single' && !offer.free && s.price > 0 ? ` · ${krw(s.price)}` : ''}
                        {offer.structure === 'single' && s.startsAt ? ` · ${formatDateTime(s.startsAt)}` : ''}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </fieldset>
      )}

      {max > 1 ? (
        <div className="field">
          <label className="label" htmlFor="party">
            인원 · 대표자 포함 최대 {max}명
          </label>
          <select id="party" name="party" className="input" value={party} onChange={e => setParty(Number(e.target.value))}>
            {Array.from({ length: max }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>
                {n}명
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="party" value="1" />
      )}

      {willWait && (
        <p className="status-card tone-info small">
          {item!.remaining ? `남은 자리가 ${item!.remaining}석이라 ${party}명은 바로 신청할 수 없습니다. ` : '이 항목은 매진되었습니다. '}
          대기 {item!.waitlisted + 1}번으로 신청되고, 자리가 나면 문자로 알려드립니다. 알림을 받은 뒤 {offer.claimHours}시간 안에 확정하면 됩니다.
        </p>
      )}
      {tooMany && <p className="form-error">남은 자리가 {item!.remaining}석입니다. 인원을 줄이거나 다른 항목을 골라 주세요.</p>}

      <div className="field">
        <label className="label" htmlFor="name">
          {party > 1 ? '대표자 이름' : '이름'}
        </label>
        <input id="name" name="name" className="input" autoComplete="name" required />
      </div>
      <div className="field">
        <label className="label" htmlFor="phone">
          휴대폰 번호 · 확정과 대기 알림을 받습니다
        </label>
        <input id="phone" name="phone" className="input" inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000" required />
      </div>
      {questions.companions && party > 1 && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
          <legend className="label" style={{ marginBottom: 8 }}>
            함께 오는 분 이름
          </legend>
          {Array.from({ length: party - 1 }, (_, i) => (
            <input key={i} name="companion" className="input" placeholder={`동반자 ${i + 1}`} aria-label={`동반자 ${i + 1} 이름`} required />
          ))}
        </fieldset>
      )}

      {questions.fields.map(f => (
        <Field key={f.id} f={f} />
      ))}

      {amount > 0 && !willWait && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
          <legend className="label" style={{ marginBottom: 8 }}>
            결제 방법
          </legend>
          {offer.deposit.enabled && (
            <label className="check">
              <input type="radio" name="method" value="deposit" checked={method === 'deposit'} onChange={() => setMethod('deposit')} />
              <span>
                무통장 입금
                <small>신청 후 {offer.deposit.deadlineHours}시간 안에 입금하면 확정됩니다. 기한이 지나면 자동으로 취소됩니다.</small>
              </span>
            </label>
          )}
          {offer.onsite && (
            <label className="check">
              <input type="radio" name="method" value="onsite" checked={method === 'onsite'} onChange={() => setMethod('onsite')} />
              <span>
                현장 결제
                <small>신청 즉시 확정되고 당일 현장에서 결제합니다.</small>
              </span>
            </label>
          )}
        </fieldset>
      )}
      {(amount === 0 || willWait) && <input type="hidden" name="method" value={amount === 0 ? 'free' : method} />}

      <div className="total-line">
        <span className="muted">{willWait ? '확정되면 결제할 금액' : '결제 금액'}</span>
        <b>{amount > 0 ? krw(amount) : '무료'}</b>
      </div>

      {amount > 0 && rules.length > 0 && (
        <div className="policy">
          <b style={{ color: 'var(--ink)' }}>취소·환불 규정</b>
          {rules.map((r, i) => (
            <span key={i}>{refundText(r)}</span>
          ))}
          <span>신청 마감 전까지는 신청 내역 화면에서 직접 취소하거나 시간을 바꿀 수 있습니다.</span>
          <label className="check" style={{ marginTop: 6, color: 'var(--ink)' }}>
            <input type="checkbox" required />
            <span>위 규정을 확인했습니다</span>
          </label>
        </div>
      )}

      {questions.marketing.enabled && (
        <label className="check">
          <input type="checkbox" name="marketing" />
          <span>{questions.marketing.text}</span>
        </label>
      )}

      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-lg" disabled={pending || locked || !item || tooMany}>
        {pending ? '신청하는 중…' : submitLabel}
      </button>
    </form>
  )
}
