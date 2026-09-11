'use client'

import Link from 'next/link'
import { useState, useTransition, type CSSProperties } from 'react'
import { scanCustomHtmlAction } from '@/app/actions'
import { inkFor } from '@/lib/color'
import { formatDate, formatDateTime, itemLabel, krw, kstIso, refundText, toKstInput } from '@/lib/format'
import { durationText, isPaid, publishChecks, sortedRefundRules } from '@/lib/rules'
import { SaveTemplateButton, TemplateGalleryDialog } from './TemplateGallery'
import {
  FIELD_TYPE_LABEL,
  TEMPLATE_VARS,
  THEME_PRESETS,
  TRIGGER_LABEL,
  type CustomHtml,
  type FieldDef,
  type FieldType,
  type FormMode,
  type FormStatus,
  type Item,
  type MessageRule,
  type Offer,
  type Questions,
  type Structure,
  type Theme,
} from '@/lib/types'

export type WizardState = {
  title: string
  slug: string
  description: string
  offer: Offer
  items: Item[]
  questions: Questions
  theme: Theme
  mode: FormMode
  customHtml: CustomHtml
}

export type StepProps = {
  s: WizardState
  update: (p: Partial<WizardState>) => void
  hasApplications: boolean
  defaultDate: string
  onError: (message: string | null) => void
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const int = (v: string) => (v === '' ? 0 : Math.max(0, Math.trunc(Number(v)) || 0))
const newItem = (p: Partial<Item>): Item => ({ id: crypto.randomUUID(), label: '참가권', startsAt: null, endsAt: null, price: 0, capacity: 30, position: 0, ...p })
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
function datesBetween(from: string, to: string) {
  if (!from) return []
  const out: string[] = []
  const end = Date.parse(`${to && to >= from ? to : from}T00:00:00Z`)
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length < 120; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

function useOffer({ s, update }: StepProps) {
  return (p: Partial<Offer>) => update({ offer: { ...s.offer, ...p } })
}

function Title({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="step-title">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  )
}

/* ---------- 1. basics ---------- */

export function StepBasics(props: StepProps) {
  const { s, update, hasApplications } = props
  const patch = useOffer(props)

  function setStructure(structure: Structure) {
    let items = s.items
    if (structure === 'simple') items = [s.items[0] ? { ...s.items[0], label: '신청' } : newItem({ label: '신청', capacity: null })]
    else if (s.offer.structure === 'simple') items = s.items.map(i => ({ ...i, capacity: i.capacity ?? 30, label: i.label === '신청' ? '참가권' : i.label }))
    // Custom HTML mode only supports the simple structure — moving away from it falls back to the fixed design.
    const mode = structure === 'simple' ? s.mode : 'structured'
    update({ offer: { ...s.offer, structure }, items, mode })
  }

  return (
    <>
      <Title title="무엇을 받나요?">참가비와 신청 방식을 먼저 정하면 다음 단계에서 입력할 칸이 줄어듭니다.</Title>
      <div className="block">
        <div className="field">
          <label className="label" htmlFor="title">
            폼 이름
          </label>
          <input id="title" className="input" value={s.title} onChange={e => update({ title: e.target.value })} />
        </div>
        <div className="field">
          <label className="label" htmlFor="slug">
            신청 화면 주소
          </label>
          <div className="inline-inputs">
            <span className="mono muted">/f/</span>
            <input id="slug" className="input mono" style={{ width: 260 }} value={s.slug} onChange={e => update({ slug: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="desc">
            한 줄 소개
          </label>
          <input id="desc" className="input" value={s.description} placeholder="예: 30분 단위 입장 예약 · 굿즈 교환권 포함" onChange={e => update({ description: e.target.value })} />
        </div>
      </div>
      <div className="block">
        <span className="label">참가비</span>
        <div className="choices">
          <label className="choice">
            <input type="radio" name="free" checked={!s.offer.free} onChange={() => patch({ free: false })} />
            <b>유료</b>
            <small>참가비를 무통장 입금이나 현장 결제로 받습니다.</small>
          </label>
          <label className="choice">
            <input type="radio" name="free" checked={s.offer.free} onChange={() => patch({ free: true })} />
            <b>무료</b>
            <small>결제 없이 신청과 정원만 관리합니다.</small>
          </label>
        </div>
      </div>
      <div className="block">
        <span className="label">신청 방식</span>
        <div className="choices">
          <label className="choice">
            <input type="radio" name="structure" checked={s.offer.structure === 'simple'} disabled={hasApplications} onChange={() => setStructure('simple')} />
            <b>단순 신청</b>
            <small>설명회 사전 등록, 모집 신청처럼 고를 항목 없이 신청만 받는 경우</small>
          </label>
          <label className="choice">
            <input type="radio" name="structure" checked={s.offer.structure === 'single'} disabled={hasApplications} onChange={() => setStructure('single')} />
            <b>권종 선택</b>
            <small>회원·비회원, 일반·학생처럼 가격이나 정원이 다른 권종 중 고르는 경우</small>
          </label>
          <label className="choice">
            <input type="radio" name="structure" checked={s.offer.structure === 'slots'} disabled={hasApplications} onChange={() => setStructure('slots')} />
            <b>회차·시간대 선택</b>
            <small>팝업 30분 입장, 강좌 1·2회차처럼 시간대마다 정원이 있는 경우</small>
          </label>
          <label className="choice">
            <input type="radio" name="structure" disabled />
            <b>기본권 + 추가 옵션</b>
            <small>굿즈 패키지 추가 구매 등 · 다음 버전</small>
          </label>
        </div>
        {hasApplications && <p className="small muted">신청이 들어온 폼이라 신청 방식은 바꿀 수 없습니다. 바꾸려면 폼을 복제하세요.</p>}
      </div>
    </>
  )
}

/* ---------- 2. items ---------- */

export function StepItems(props: StepProps) {
  const { s, update, defaultDate } = props
  const patch = useOffer(props)
  const { offer, items } = s
  const setItems = (next: Item[]) => update({ items: next })
  const updateItem = (id: string, p: Partial<Item>) => setItems(items.map(x => (x.id === id ? { ...x, ...p } : x)))
  const firstDate = toKstInput(items[0]?.startsAt ?? null).date || defaultDate
  const [gen, setGen] = useState({
    date: firstDate,
    endDate: firstDate,
    days: [0, 1, 2, 3, 4, 5, 6],
    start: '11:00',
    end: '19:00',
    interval: 30,
    capacity: 40,
    price: 5000,
  })
  const [openDays, setOpenDays] = useState<string[]>([])
  const paid = !offer.free

  function setRowDate(item: Item, date: string) {
    const st = toKstInput(item.startsAt).time || '10:00'
    const en = toKstInput(item.endsAt).time
    updateItem(item.id, { startsAt: date ? kstIso(date, st) : null, endsAt: date && en ? kstIso(date, en) : null })
  }
  function setRowTime(item: Item, which: 'start' | 'end', time: string) {
    const date = toKstInput(item.startsAt).date || gen.date
    const value = time ? kstIso(date, time) : null
    if (which === 'start') updateItem(item.id, { startsAt: value, label: offer.structure === 'slots' && time ? `${time} 입장` : item.label })
    else updateItem(item.id, { endsAt: value })
  }

  const perDay = Math.max(0, Math.floor((toMin(gen.end) - toMin(gen.start)) / gen.interval))
  const genDates = datesBetween(gen.date, gen.endDate).filter(d => gen.days.includes(weekdayOf(d)))
  const slotCount = perDay * genDates.length
  function generate() {
    const existing = new Set(items.map(i => i.startsAt))
    const next: Item[] = []
    for (const date of genDates) {
      for (let k = 0; k < perDay; k++) {
        const startMin = toMin(gen.start) + k * gen.interval
        const startsAt = kstIso(date, hhmm(startMin))
        if (existing.has(startsAt)) continue
        next.push(
          newItem({ label: `${hhmm(startMin)} 입장`, startsAt, endsAt: kstIso(date, hhmm(startMin + gen.interval)), price: paid ? gen.price : 0, capacity: gen.capacity }),
        )
      }
    }
    setItems([...items, ...next].sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '')))
  }

  const seats = items.reduce((sum, i) => sum + (i.capacity ?? 0), 0)
  const revenue = items.reduce((sum, i) => sum + (i.capacity ?? 0) * (offer.free ? 0 : i.price), 0)

  const days = new Map<string, Item[]>()
  for (const it of items) {
    const d = toKstInput(it.startsAt).date
    days.set(d, [...(days.get(d) ?? []), it])
  }
  const grouped = offer.structure === 'slots' && days.size > 1
  const collapse = grouped && days.size > 3
  const rows: ({ day: string; list: Item[] } | { day?: undefined; item: Item })[] = []
  if (grouped) {
    for (const [day, list] of days) {
      rows.push({ day, list })
      if (!collapse || openDays.includes(day)) rows.push(...list.map(item => ({ item })))
    }
  } else rows.push(...items.map(item => ({ item })))

  const party = (
    <div className="block">
      <span className="label">한 번에 신청하는 인원</span>
      <label className="check">
        <input type="radio" name="party" checked={offer.party.mode === 'solo'} onChange={() => patch({ party: { ...offer.party, mode: 'solo' } })} />
        <span>1명씩</span>
      </label>
      <label className="check">
        <input type="radio" name="party" checked={offer.party.mode === 'group'} onChange={() => patch({ party: { mode: 'group', max: Math.max(2, offer.party.max) } })} />
        <span className="inline-inputs">
          대표자 + 동반자, 최대
          <input
            type="number"
            min={2}
            max={20}
            className="input input-sm w-num"
            value={offer.party.max}
            disabled={offer.party.mode !== 'group'}
            onChange={e => patch({ party: { mode: 'group', max: Math.max(2, int(e.target.value)) } })}
          />
          명
        </span>
      </label>
    </div>
  )

  if (offer.structure === 'simple') {
    const it = items[0]
    if (!it) {
      return (
        <>
          <Title title="일시와 정원" />
          <button type="button" className="btn" onClick={() => setItems([newItem({ label: '신청', capacity: null })])}>
            신청 항목 만들기
          </button>
        </>
      )
    }
    const st = toKstInput(it.startsAt)
    const en = toKstInput(it.endsAt)
    return (
      <>
        <Title title="일시와 정원">단순 신청은 항목이 하나입니다. 일시를 넣으면 신청 화면에 보이고, 전날 안내 문자가 예약됩니다.</Title>
        <div className="block">
          <span className="label">일시 · 선택</span>
          <div className="inline-inputs">
            <input type="date" className="input input-sm" value={st.date} onChange={e => setRowDate(it, e.target.value)} aria-label="날짜" />
            <input type="time" className="input input-sm" value={st.time} onChange={e => setRowTime(it, 'start', e.target.value)} aria-label="시작" />
            <span className="muted">~</span>
            <input type="time" className="input input-sm" value={en.time} onChange={e => setRowTime(it, 'end', e.target.value)} aria-label="종료" />
          </div>
        </div>
        {paid && (
          <div className="block">
            <label className="inline-inputs">
              참가비 <input type="number" min={0} step={1000} className="input input-sm w-mid" value={it.price} onChange={e => updateItem(it.id, { price: int(e.target.value) })} />원
            </label>
          </div>
        )}
        <div className="block">
          <span className="label">정원</span>
          <label className="check">
            <input type="radio" name="cap" checked={it.capacity === null} onChange={() => updateItem(it.id, { capacity: null })} />
            <span>
              제한 없음<small>누구나 신청할 수 있습니다.</small>
            </span>
          </label>
          <label className="check">
            <input type="radio" name="cap" checked={it.capacity !== null} onChange={() => updateItem(it.id, { capacity: 50 })} />
            <span className="inline-inputs">
              선착순
              <input
                type="number"
                min={1}
                className="input input-sm w-num"
                disabled={it.capacity === null}
                value={it.capacity ?? ''}
                onChange={e => updateItem(it.id, { capacity: Math.max(1, int(e.target.value)) })}
              />
              명까지
            </span>
          </label>
        </div>
        {party}
      </>
    )
  }

  return (
    <>
      <Title title="가격과 정원">정원은 항상 사람 수입니다. 대표자가 동반자 3명과 함께 신청하면 4석을 차지합니다.</Title>
      {offer.structure === 'slots' && (
        <div className="gen">
          <span className="label">시간대 한 번에 만들기 · 하루만 만들려면 시작일과 종료일을 같게 두세요</span>
          <div className="inline-inputs">
            <input
              type="date"
              className="input input-sm"
              value={gen.date}
              onChange={e => setGen({ ...gen, date: e.target.value, endDate: gen.endDate < e.target.value ? e.target.value : gen.endDate })}
              aria-label="시작일"
            />
            <span className="muted">~</span>
            <input type="date" className="input input-sm" value={gen.endDate} min={gen.date} onChange={e => setGen({ ...gen, endDate: e.target.value })} aria-label="종료일" />
            <span className="weekdays" role="group" aria-label="요일">
              {WEEKDAYS.map((w, d) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={gen.days.includes(d)}
                  onClick={() => setGen({ ...gen, days: gen.days.includes(d) ? gen.days.filter(x => x !== d) : [...gen.days, d] })}
                >
                  {w}
                </button>
              ))}
            </span>
          </div>
          <div className="inline-inputs">
            <input type="time" className="input input-sm" value={gen.start} onChange={e => setGen({ ...gen, start: e.target.value })} aria-label="시작" />
            <span className="muted">~</span>
            <input type="time" className="input input-sm" value={gen.end} onChange={e => setGen({ ...gen, end: e.target.value })} aria-label="종료" />
            <select className="input input-sm" value={gen.interval} onChange={e => setGen({ ...gen, interval: Number(e.target.value) })} aria-label="간격">
              {[15, 20, 30, 60, 90, 120].map(m => (
                <option key={m} value={m}>
                  {durationText(m)} 간격
                </option>
              ))}
            </select>
          </div>
          <div className="inline-inputs">
            <label className="inline-inputs small">
              정원 <input type="number" min={1} className="input input-sm w-num" value={gen.capacity} onChange={e => setGen({ ...gen, capacity: int(e.target.value) })} />명
            </label>
            {paid && (
              <label className="inline-inputs small">
                가격 <input type="number" min={0} step={500} className="input input-sm w-num" value={gen.price} onChange={e => setGen({ ...gen, price: int(e.target.value) })} />원
              </label>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={generate} disabled={slotCount === 0 || slotCount > 1000}>
              {genDates.length > 1 ? `${genDates.length}일 × ${perDay}개 = ` : ''}
              {slotCount}개 {items.length ? '추가' : '만들기'}
            </button>
            {slotCount > 1000 && <span className="action-error">한 번에 1,000개까지 만들 수 있습니다. 기간을 나눠 만들어 주세요.</span>}
          </div>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {offer.structure === 'single' && <th>권종 이름</th>}
              <th>날짜</th>
              <th>시작</th>
              <th>종료</th>
              <th className="r">가격</th>
              <th className="r">정원</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  {offer.structure === 'slots' ? '위에서 시간대를 만들거나 한 줄씩 추가해 주세요.' : '권종을 추가해 주세요.'}
                </td>
              </tr>
            )}
            {rows.map(row => {
              if (row.day !== undefined) {
                const day = row.day
                const list = row.list
                const open = !collapse || openDays.includes(day)
                return (
                  <tr key={`day-${day}`} className="day-row">
                    <td colSpan={7}>
                      <span className="row">
                        <b>{day ? formatDate(kstIso(day, '12:00')) : '날짜 없음'}</b>
                        <span className="muted small">
                          {list.length}개 시간대 · {list.reduce((sum, i) => sum + (i.capacity ?? 0), 0)}석
                        </span>
                        {collapse && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenDays(open ? openDays.filter(d => d !== day) : [...openDays, day])}>
                            {open ? '접기' : '펼치기'}
                          </button>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems(items.filter(i => !list.includes(i)))}>
                          이 날 삭제
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              }
              const item = row.item
              const st = toKstInput(item.startsAt)
              const en = toKstInput(item.endsAt)
              return (
                <tr key={item.id}>
                  {offer.structure === 'single' && (
                    <td>
                      <input className="input input-sm" value={item.label} onChange={e => updateItem(item.id, { label: e.target.value })} aria-label="권종 이름" />
                    </td>
                  )}
                  <td>
                    <input type="date" className="input input-sm" value={st.date} onChange={e => setRowDate(item, e.target.value)} aria-label="날짜" />
                  </td>
                  <td>
                    <input type="time" className="input input-sm" value={st.time} onChange={e => setRowTime(item, 'start', e.target.value)} aria-label="시작" />
                  </td>
                  <td>
                    <input type="time" className="input input-sm" value={en.time} onChange={e => setRowTime(item, 'end', e.target.value)} aria-label="종료" />
                  </td>
                  <td className="r">
                    {offer.free ? (
                      <span className="muted">무료</span>
                    ) : (
                      <input type="number" min={0} step={500} className="input input-sm w-num" value={item.price} onChange={e => updateItem(item.id, { price: int(e.target.value) })} aria-label="가격" />
                    )}
                  </td>
                  <td className="r">
                    <input
                      type="number"
                      min={1}
                      className="input input-sm w-num"
                      value={item.capacity ?? ''}
                      onChange={e => updateItem(item.id, { capacity: Math.max(1, int(e.target.value)) })}
                      aria-label="정원"
                    />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems(items.filter(x => x.id !== item.id))} aria-label={`${itemLabel(item)} 삭제`}>
                      삭제
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="spread">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setItems([...items, newItem({ label: offer.structure === 'slots' ? '새 시간대' : '참가권', position: items.length })])}
        >
          한 줄 추가
        </button>
        <span className="num small">
          <b>{items.length}</b>개 항목 · <b>{seats.toLocaleString('ko-KR')}</b>석
          {isPaid(offer, items) && (
            <>
              {' '}
              · 전석 판매 시 <b>{krw(revenue)}</b>
            </>
          )}
        </span>
      </div>
      {party}
    </>
  )
}

/* ---------- 3. questions ---------- */

const PRESETS: { label: string; type: FieldType; required: boolean; options?: string[]; help?: string }[] = [
  { label: '소속', type: 'text', required: true },
  { label: '직책', type: 'text', required: false },
  { label: '이메일', type: 'email', required: true },
  { label: '방문 경로', type: 'select', required: false, options: ['인스타그램', '지인 추천', '검색', '기타'] },
  { label: '개인정보 수집·이용에 동의합니다', type: 'consent', required: true, help: '신청 확인과 안내에만 씁니다' },
]

export function StepQuestions({ s, update }: StepProps) {
  const q = s.questions
  const setQ = (p: Partial<Questions>) => update({ questions: { ...q, ...p } })
  const setFields = (fields: FieldDef[]) => setQ({ fields })
  const setField = (i: number, p: Partial<FieldDef>) => setFields(q.fields.map((f, j) => (j === i ? { ...f, ...p } : f)))
  const add = (type: FieldType, p: Partial<FieldDef> = {}) =>
    setFields([
      ...q.fields,
      {
        id: `q${crypto.randomUUID().slice(0, 8)}`,
        type,
        label: '',
        required: false,
        options: type === 'select' || type === 'multi' ? ['선택지 1', '선택지 2'] : [],
        help: '',
        ...p,
      },
    ])
  const move = (i: number, d: -1 | 1) => {
    const next = [...q.fields]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setFields(next)
  }

  return (
    <>
      <Title title="신청서에 무엇을 물을까요?">이름과 휴대폰은 항상 받습니다. 그 밖에 필요한 것만 더하세요. 항목이 적을수록 신청을 끝까지 하는 사람이 늘어납니다.</Title>
      <div className="fixed-fields">
        <span className="pill">이름 · 필수</span>
        <span className="pill">휴대폰 · 필수</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={q.companions} disabled={s.offer.party.mode !== 'group'} onChange={e => setQ({ companions: e.target.checked })} />
        <span>
          함께 오는 분 이름도 받기
          <small>{s.offer.party.mode === 'group' ? '인원 수만큼 이름 칸이 생깁니다. 명단과 입장 확인에 쓰입니다.' : '2단계에서 "대표자 + 동반자"를 고르면 켤 수 있습니다.'}</small>
        </span>
      </label>

      <div className="stack">
        {q.fields.map((f, i) => (
          <div className="field-card" key={f.id}>
            <div className="head">
              <select
                className="input input-sm"
                value={f.type}
                onChange={e => setField(i, { type: e.target.value as FieldType, options: f.options.length ? f.options : ['선택지 1', '선택지 2'] })}
                aria-label="항목 종류"
              >
                {Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input className="input input-sm" value={f.label} placeholder={f.type === 'consent' ? '동의 문구' : '질문'} onChange={e => setField(i, { label: e.target.value })} aria-label="질문" />
              <span className="tools">
                <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">
                  ↑
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={i === q.fields.length - 1} onClick={() => move(i, 1)} aria-label="아래로">
                  ↓
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFields(q.fields.filter((_, j) => j !== i))}>
                  삭제
                </button>
              </span>
            </div>
            {(f.type === 'select' || f.type === 'multi') && (
              <label className="field">
                <span className="label">선택지 · 한 줄에 하나</span>
                <textarea className="input" value={f.options.join('\n')} onChange={e => setField(i, { options: e.target.value.split('\n') })} />
              </label>
            )}
            <div className="inline-inputs">
              <label className="check small">
                <input type="checkbox" checked={f.required} onChange={e => setField(i, { required: e.target.checked })} />
                <span>필수</span>
              </label>
              <input className="input input-sm" style={{ flex: 1, minWidth: 200 }} value={f.help} placeholder="도움말 · 선택" onChange={e => setField(i, { help: e.target.value })} aria-label="도움말" />
            </div>
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <span className="label">항목 추가</span>
        <div className="row">
          {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map(t => (
            <button key={t} type="button" className="btn btn-sm" onClick={() => add(t)}>
              + {FIELD_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="row small">
          <span className="muted">자주 쓰는 항목</span>
          {PRESETS.filter(p => !q.fields.some(f => f.label === p.label)).map(p => (
            <button key={p.label} type="button" className="btn btn-ghost btn-sm" onClick={() => add(p.type, { label: p.label, required: p.required, options: p.options ?? [], help: p.help ?? '' })}>
              + {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <label className="check">
          <input type="checkbox" checked={q.marketing.enabled} onChange={e => setQ({ marketing: { ...q.marketing, enabled: e.target.checked } })} />
          <span>
            마케팅 수신 동의 받기
            <small>선택 항목으로 받습니다. 동의한 사람은 고객 DB에서 따로 모아 받을 수 있습니다.</small>
          </span>
        </label>
        {q.marketing.enabled && (
          <input className="input" value={q.marketing.text} onChange={e => setQ({ marketing: { ...q.marketing, text: e.target.value } })} aria-label="수신 동의 문구" />
        )}
      </div>
    </>
  )
}

/* ---------- 4. rules ---------- */

export function StepRules(props: StepProps) {
  const { s, defaultDate } = props
  const patch = useOffer(props)
  const { offer } = s
  const closeAt = toKstInput(offer.close.at)
  const openAt = toKstInput(offer.openAt)
  const fromInput = (v: string) => {
    const [d, t] = v.split('T')
    return d && t ? kstIso(d, t) : null
  }

  return (
    <>
      <Title title="신청 규칙">언제 열고 닫을지, 자리가 차면 어떻게 할지, 한 사람이 몇 번 신청할 수 있는지 정합니다.</Title>
      <div className="block">
        <span className="label">신청 오픈</span>
        <label className="check">
          <input type="radio" name="open" checked={!offer.openAt} onChange={() => patch({ openAt: null })} />
          <span>게시하는 즉시</span>
        </label>
        <label className="check">
          <input type="radio" name="open" checked={!!offer.openAt} onChange={() => patch({ openAt: kstIso(defaultDate, '20:00') })} />
          <span className="inline-inputs">
            정해진 시각에 열기
            <input
              type="datetime-local"
              className="input input-sm"
              disabled={!offer.openAt}
              value={openAt.date ? `${openAt.date}T${openAt.time}` : ''}
              onChange={e => patch({ openAt: fromInput(e.target.value) })}
            />
          </span>
        </label>
        <p className="small muted" style={{ paddingLeft: 26 }}>
          열리기 전에는 시간대와 남은 자리만 보이고 신청 버튼이 잠깁니다. 인기 팝업의 예약 오픈에 씁니다.
        </p>
      </div>
      <div className="block">
        <span className="label">정원이 차면</span>
        <label className="check">
          <input type="radio" name="overflow" checked={offer.overflow === 'close'} onChange={() => patch({ overflow: 'close' })} />
          <span>
            매진으로 표시<small>취소로 자리가 나면 먼저 들어온 사람이 신청합니다.</small>
          </span>
        </label>
        <label className="check">
          <input type="radio" name="overflow" checked={offer.overflow === 'waitlist'} onChange={() => patch({ overflow: 'waitlist' })} />
          <span>
            대기 신청 받기
            <small>자리가 나면 대기 순서대로 알립니다. 인원이 남은 자리보다 많은 팀은 순서를 지킨 채 다음 팀에게 먼저 기회가 갑니다.</small>
          </span>
        </label>
        {offer.overflow === 'waitlist' && (
          <label className="inline-inputs small" style={{ paddingLeft: 26 }}>
            알림을 받은 뒤
            <input type="number" min={1} max={72} className="input input-sm w-num" value={offer.claimHours} onChange={e => patch({ claimHours: Math.max(1, int(e.target.value)) })} />
            시간 안에 확정하지 않으면 다음 순번에게 넘어갑니다
          </label>
        )}
      </div>
      <div className="block">
        <span className="label">신청 마감</span>
        <label className="check">
          <input type="radio" name="close" checked={offer.close.mode === 'before_start'} onChange={() => patch({ close: { ...offer.close, mode: 'before_start' } })} />
          <span className="inline-inputs">
            각 항목 시작
            <select
              className="input input-sm"
              value={offer.close.minutes}
              disabled={offer.close.mode !== 'before_start'}
              onChange={e => patch({ close: { ...offer.close, minutes: Number(e.target.value) } })}
            >
              {[0, 30, 60, 120, 180, 1440, 2880].map(m => (
                <option key={m} value={m}>
                  {m === 0 ? '직전' : `${durationText(m)} 전`}
                </option>
              ))}
            </select>
            에 마감
          </span>
        </label>
        <label className="check">
          <input type="radio" name="close" checked={offer.close.mode === 'at'} onChange={() => patch({ close: { ...offer.close, mode: 'at' } })} />
          <span className="inline-inputs">
            한 번에 마감
            <input
              type="datetime-local"
              className="input input-sm"
              disabled={offer.close.mode !== 'at'}
              value={closeAt.date ? `${closeAt.date}T${closeAt.time}` : ''}
              onChange={e => patch({ close: { ...offer.close, at: fromInput(e.target.value) } })}
            />
          </span>
        </label>
        <label className="check">
          <input type="radio" name="close" checked={offer.close.mode === 'none'} onChange={() => patch({ close: { ...offer.close, mode: 'none' } })} />
          <span>마감 없음 · 정원이 찰 때까지</span>
        </label>
        <p className="small muted">신청자는 마감 전까지 신청 내역 화면에서 직접 취소하거나 가격이 같은 다른 시간으로 바꿀 수 있습니다. 마감 뒤에는 운영자만 바꿀 수 있습니다.</p>
      </div>
      <div className="block">
        <span className="label">한 사람당 신청 횟수 · 휴대폰 번호 기준, 폼 전체</span>
        <select
          className="input"
          style={{ width: 'auto' }}
          value={offer.limitPerPerson ?? 0}
          onChange={e => patch({ limitPerPerson: Number(e.target.value) || null })}
          aria-label="한 사람당 신청 횟수"
        >
          <option value={0}>제한 없음</option>
          {[1, 2, 3, 5].map(n => (
            <option key={n} value={n}>
              {n}번까지
            </option>
          ))}
        </select>
        <p className="small muted">인기 팝업에서 한 사람이 여러 시간대를 잡아두는 걸 막습니다. 대기 신청도 횟수에 포함됩니다.</p>
      </div>
    </>
  )
}

/* ---------- 5. payment ---------- */

export function StepPayment(props: StepProps) {
  const { s } = props
  const patch = useOffer(props)
  const { offer } = s
  if (!isPaid(offer, s.items)) {
    return (
      <>
        <Title title="어떻게 받나요?" />
        <p className="panel" style={{ padding: 16 }}>
          무료 신청이라 결제 단계가 없습니다.
        </p>
      </>
    )
  }
  const d = offer.deposit
  return (
    <>
      <Title title="어떻게 받나요?">온라인 결제는 다음 버전에서 연결합니다. 지금은 무통장 입금과 현장 결제로 판매할 수 있습니다.</Title>
      <div className="block">
        <label className="check">
          <input type="checkbox" disabled />
          <span>
            온라인 결제 · 카드, 간편결제 <span className="pill">준비 중</span>
            <small>토스페이먼츠 가맹점 연결은 나중에 추가됩니다.</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={d.enabled} onChange={e => patch({ deposit: { ...d, enabled: e.target.checked } })} />
          <span>
            무통장 입금<small>신청하면 입금 기한까지 자리를 잡아두고, 운영자가 입금을 확인하면 확정됩니다.</small>
          </span>
        </label>
        {d.enabled && (
          <div className="inline-inputs" style={{ paddingLeft: 26 }}>
            <input className="input input-sm" style={{ width: 120 }} placeholder="은행" value={d.bank} onChange={e => patch({ deposit: { ...d, bank: e.target.value } })} aria-label="은행" />
            <input className="input input-sm" style={{ width: 180 }} placeholder="계좌번호" value={d.account} onChange={e => patch({ deposit: { ...d, account: e.target.value } })} aria-label="계좌번호" />
            <input className="input input-sm" style={{ width: 160 }} placeholder="예금주" value={d.holder} onChange={e => patch({ deposit: { ...d, holder: e.target.value } })} aria-label="예금주" />
            <select className="input input-sm" value={d.deadlineHours} onChange={e => patch({ deposit: { ...d, deadlineHours: Number(e.target.value) } })} aria-label="입금 기한">
              {[6, 12, 24, 48, 72].map(h => (
                <option key={h} value={h}>
                  입금 기한 {durationText(h * 60)}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={offer.onsite} onChange={e => patch({ onsite: e.target.checked })} />
          <span>
            현장 결제<small>신청 즉시 확정하고 당일 현장에서 받습니다.</small>
          </span>
        </label>
      </div>
      <div className="block">
        <span className="label">취소·환불 규정 · 신청 화면에 표시되고, 취소할 때 환불 금액을 이 규정으로 계산합니다</span>
        {offer.refundRules.map((r, i) => (
          <div key={i} className="inline-inputs">
            입장
            <input
              type="number"
              min={0}
              className="input input-sm w-num"
              value={r.daysBefore}
              onChange={e => patch({ refundRules: offer.refundRules.map((x, j) => (j === i ? { ...x, daysBefore: int(e.target.value) } : x)) })}
              aria-label="며칠 전"
            />
            일 전까지
            <input
              type="number"
              min={0}
              max={100}
              className="input input-sm w-num"
              value={r.percent}
              onChange={e => patch({ refundRules: offer.refundRules.map((x, j) => (j === i ? { ...x, percent: Math.min(100, int(e.target.value)) } : x)) })}
              aria-label="환불 비율"
            />
            % 환불 <span className="muted small">· {refundText(r)}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch({ refundRules: offer.refundRules.filter((_, j) => j !== i) })}>
              삭제
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="btn btn-sm" onClick={() => patch({ refundRules: [...offer.refundRules, { daysBefore: 1, percent: 0 }] })}>
            구간 추가
          </button>
        </div>
      </div>
    </>
  )
}

/* ---------- 6. messages ---------- */

export function StepMessages(props: StepProps) {
  const { s } = props
  const patch = useOffer(props)
  const { offer } = s
  const paid = isPaid(offer, s.items)
  const setRule = (i: number, p: Partial<MessageRule>) => patch({ messages: offer.messages.map((m, idx) => (idx === i ? { ...m, ...p } : m)) })
  const relevant = (m: MessageRule) => {
    if (m.trigger === 'deposit_requested') return paid && offer.deposit.enabled
    if (m.trigger === 'waitlisted' || m.trigger === 'waitlist_offer') return offer.overflow === 'waitlist'
    if (m.trigger === 'expired') return (paid && offer.deposit.enabled) || offer.overflow === 'waitlist'
    if (m.trigger === 'changed') return offer.structure !== 'simple' && s.items.length > 1
    return true
  }
  return (
    <>
      <Title title="무엇을 보낼까요?">지금 설정에 맞는 알림만 보여줍니다. 문구 안의 변수는 보낼 때 신청자 정보로 바뀝니다. 프로토타입에서는 실제로 보내지 않고 발송 기록에 남습니다.</Title>
      <div className="vars">
        {TEMPLATE_VARS.map(v => (
          <code key={v}>{v}</code>
        ))}
      </div>
      <div className="panel" style={{ padding: '4px 18px' }}>
        {offer.messages.map((m, i) =>
          relevant(m) ? (
            <div className="msg-rule" key={m.trigger}>
              <div className="stack" style={{ gap: 8 }}>
                <label className="check">
                  <input type="checkbox" checked={m.enabled} onChange={e => setRule(i, { enabled: e.target.checked })} />
                  <b>{TRIGGER_LABEL[m.trigger]}</b>
                </label>
                <select
                  className="input input-sm"
                  style={{ width: 110 }}
                  value={m.channel}
                  onChange={e => setRule(i, { channel: e.target.value as MessageRule['channel'] })}
                  disabled={!m.enabled}
                  aria-label="채널"
                >
                  <option value="alimtalk">알림톡</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <textarea className="input" value={m.template} disabled={!m.enabled} onChange={e => setRule(i, { template: e.target.value })} aria-label={`${TRIGGER_LABEL[m.trigger]} 문구`} />
            </div>
          ) : null,
        )}
      </div>
    </>
  )
}

/* ---------- 7. design ---------- */

async function downscale(file: File, maxWidth: number, type: 'image/png' | 'image/jpeg') {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, maxWidth / img.naturalWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL(type, 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function StepDesign({ s, update, onError }: StepProps) {
  const t = s.theme
  const setTheme = (p: Partial<Theme>) => update({ theme: { ...t, ...p } })
  const [pending, start] = useTransition()
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const canCustomHtml = s.offer.structure === 'simple'

  async function pick(kind: 'logo' | 'cover', file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) return onError('그림 파일(PNG, JPG)만 올릴 수 있습니다.')
    try {
      const data = kind === 'logo' ? await downscale(file, 480, 'image/png') : await downscale(file, 1600, 'image/jpeg')
      if (data.length > 1_400_000) return onError('이미지가 너무 큽니다. 더 작은 파일을 골라 주세요.')
      onError(null)
      setTheme({ [kind]: data })
    } catch {
      onError('이미지를 읽지 못했습니다. 다른 파일을 골라 주세요.')
    }
  }

  function setMode(mode: FormMode) {
    if (mode === 'custom_html' && !canCustomHtml) {
      onError('커스텀 HTML 모드는 1단계에서 "단순 신청" 구조를 골라야 쓸 수 있습니다.')
      return
    }
    onError(null)
    update({ mode })
  }

  function scan() {
    setScanMsg(null)
    start(async () => {
      const result = await scanCustomHtmlAction(s.customHtml.html, s.questions.fields)
      if (result.error) {
        onError(result.error)
        return
      }
      onError(null)
      update({
        questions: { ...s.questions, fields: result.fields! },
        customHtml: { ...s.customHtml, lastScannedAt: new Date().toISOString() },
      })
      setScanMsg(`감지된 항목 ${result.fields!.length}개 (신규 ${result.added}, 삭제 ${result.removed}) · 3단계 '신청서 항목'에서 라벨과 필수 여부를 확인하세요.`)
    })
  }

  async function uploadHtml(file: File | undefined) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.html') && file.type !== 'text/html') return onError('.html 파일만 올릴 수 있습니다.')
    const text = await file.text()
    onError(null)
    update({ customHtml: { ...s.customHtml, html: text, source: 'upload' } })
  }

  const preview = { '--brand': t.color, '--brand-ink': inkFor(t.color) } as CSSProperties

  return (
    <>
      <Title title="신청 화면 디자인">
        브랜드 색, 로고, 커버 이미지를 넣으면 신청 화면과 신청 내역 화면에 모두 적용됩니다. 입력 칸의 위치와 순서는 NODA가 정해 두어서, 디자인을 바꿔도 신청서가 깨지지 않습니다.
      </Title>

      <div className="field">
        <span className="label">화면 방식</span>
        <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="화면 방식">
          <label className="check">
            <input type="radio" name="designMode" checked={s.mode !== 'custom_html'} onChange={() => setMode('structured')} />
            <span>고정 디자인 · NODA가 배치를 정하고, 색·로고·커버만 바꿉니다</span>
          </label>
          <label className="check">
            <input type="radio" name="designMode" checked={s.mode === 'custom_html'} onChange={() => setMode('custom_html')} disabled={!canCustomHtml} />
            <span>
              커스텀 HTML · 직접 만든 화면을 그대로 붙여넣습니다
              {!canCustomHtml && <small> (1단계에서 &apos;단순 신청&apos;으로 바꿔야 고를 수 있습니다)</small>}
            </span>
          </label>
        </div>
      </div>

      {s.mode === 'custom_html' ? (
        <div className="stack" style={{ gap: 16 }}>
          <p className="muted small">
            신청서의 입력 칸은 커스텀 항목이면 <code>name=&quot;f_항목id&quot;</code>, 이름·전화번호는 <code>name=&quot;name&quot;</code> ·{' '}
            <code>name=&quot;phone&quot;</code> 을 그대로 써 주세요. 저장할 때 &lt;script&gt;와 이벤트 속성은 제거되고, 자바스크립트로 그려지는 항목은
            인식하지 못합니다 — 정적인 HTML만 지원합니다.
          </p>
          <div className="row">
            <TemplateGalleryDialog onUse={html => update({ customHtml: { ...s.customHtml, html, source: 'paste' } })} />
            <SaveTemplateButton html={s.customHtml.html} />
          </div>
          <div className="field">
            <span className="label">HTML 붙여넣기 또는 파일 올리기</span>
            <input type="file" accept=".html,text/html" onChange={e => uploadHtml(e.target.files?.[0])} aria-label="HTML 파일 올리기" />
            <textarea
              className="input mono"
              style={{ minHeight: 220 }}
              value={s.customHtml.html}
              onChange={e => update({ customHtml: { ...s.customHtml, html: e.target.value, source: 'paste' } })}
              placeholder={'<label>이름<input name="name" required /></label>\n<label>궁금한 점<textarea name="f_question"></textarea></label>'}
            />
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={scan} disabled={pending || !s.customHtml.html.trim()}>
              {pending ? '스캔 중…' : '필드 스캔하기'}
            </button>
            {s.customHtml.lastScannedAt && (
              <span className="small muted">마지막 스캔: {new Date(s.customHtml.lastScannedAt).toLocaleString('ko-KR')}</span>
            )}
          </div>
          {scanMsg && <p className="status-card tone-ok small">{scanMsg}</p>}
          {s.customHtml.html.trim() && (
            <div className="field">
              <span className="label">미리보기 · 스크립트는 실행되지 않습니다</span>
              <iframe
                title="커스텀 HTML 미리보기"
                sandbox=""
                srcDoc={s.customHtml.html}
                style={{ width: '100%', height: 320, border: '1px solid var(--rule)', borderRadius: 8, background: '#fff' }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="theme-grid">
        <div className="stack" style={{ gap: 22 }}>
          <div className="field">
            <span className="label">테마 선택 · 카드를 고르면 색이 바로 적용됩니다</span>
            <div className="theme-cards">
              {THEME_PRESETS.map(p => {
                const cardStyle = { '--brand': p.color, '--brand-ink': inkFor(p.color) } as CSSProperties
                const selected = t.color.toLowerCase() === p.color.toLowerCase()
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`theme-card${selected ? ' selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setTheme({ color: p.color })}
                  >
                    <span className="theme-card-preview pub-theme" style={cardStyle}>
                      <span className="tc-cover" />
                      <span className="tc-body">
                        <span className="tc-title">신청 폼</span>
                        <span className="tc-btn">신청하기</span>
                      </span>
                    </span>
                    <span className="tc-name">{p.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="field">
            <span className="label">직접 고르기</span>
            <div className="swatches">
              <input type="color" value={t.color} onChange={e => setTheme({ color: e.target.value })} aria-label="직접 고르기" />
              <span className="mono small muted">{t.color}</span>
            </div>
          </div>
          <div className="field">
            <span className="label">로고 · 투명 배경 PNG 권장</span>
            <div className="upload">
              {t.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo} alt="현재 로고" />
              )}
              <input type="file" accept="image/*" onChange={e => pick('logo', e.target.files?.[0])} aria-label="로고 올리기" />
              {t.logo && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTheme({ logo: null })}>
                  빼기
                </button>
              )}
            </div>
          </div>
          <div className="field">
            <span className="label">커버 이미지 · 가로로 긴 사진, 화면 맨 위에 걸립니다</span>
            <div className="upload">
              {t.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.cover} alt="현재 커버" />
              )}
              <input type="file" accept="image/*" onChange={e => pick('cover', e.target.files?.[0])} aria-label="커버 올리기" />
              {t.cover && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTheme({ cover: null })}>
                  빼기
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="preview pub-theme" style={preview} aria-label="미리보기">
          <div className="pv-cover">
            {t.cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.cover} alt="" />
            )}
          </div>
          <div className="pv-body">
            {t.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo} alt="" style={{ height: 28, width: 'auto', justifySelf: 'start' }} />
            )}
            <span className="pv-title">{s.title}</span>
            <span className="pv-slot">선택한 항목</span>
            <span className="pv-btn">신청하기</span>
          </div>
        </div>
        </div>
      )}
    </>
  )
}

/* ---------- 8. review ---------- */

function summarize({ offer, items, questions }: WizardState) {
  if (items.length === 0) return '아직 판매할 항목이 없습니다.'
  const simple = offer.structure === 'simple'
  const paid = isPaid(offer, items)
  const prices = [...new Set(items.map(i => i.price))].sort((a, b) => a - b)
  const priceText = !paid ? '무료로' : prices.length === 1 ? `1인 ${krw(prices[0])}에` : `1인 ${krw(prices[0])}~${krw(prices[prices.length - 1])}에`
  const what = simple ? '신청' : offer.structure === 'slots' ? `시간대 ${items.length}개 신청` : items.length === 1 ? `'${items[0].label}' 신청` : `권종 ${items.length}개 신청`
  const out = [`이 폼은 ${what}을 ${priceText} 받습니다.`]
  if (offer.openAt) out.push(`신청은 ${formatDateTime(offer.openAt)}에 열립니다.`)
  const partyText = offer.party.mode === 'solo' ? '한 번에 1명씩 신청합니다.' : `한 번에 최대 ${offer.party.max}명까지 신청할 수 있습니다.`
  if (simple) {
    out.push(`${items[0].capacity === null ? '정원 제한은 없고' : `선착순 ${items[0].capacity}명까지 받고`} ${partyText}`)
  } else {
    const seats = items.reduce((sum, i) => sum + (i.capacity ?? 0), 0)
    const caps = [...new Set(items.map(i => i.capacity))]
    out.push(`${caps.length === 1 && items.length > 1 ? `항목마다 ${caps[0]}명, 모두 ${seats}석이고` : `모두 ${seats}석이고`} ${partyText}`)
  }
  if (offer.limitPerPerson) out.push(`한 사람당 ${offer.limitPerPerson}번까지 신청할 수 있습니다.`)
  const unlimited = items.every(i => i.capacity === null)
  if (!unlimited) {
    out.push(
      offer.overflow === 'waitlist'
        ? `자리가 차면 대기 신청을 받고, 자리가 나면 대기 순서대로 알려 ${offer.claimHours}시간 안에 확정하게 합니다.`
        : '자리가 차면 매진으로 표시합니다.',
    )
  }
  if (offer.close.mode === 'before_start') out.push(`각 항목은 시작 ${durationText(offer.close.minutes)} 전에 신청을 마감합니다.`)
  if (offer.close.mode === 'at' && offer.close.at) out.push(`${formatDateTime(offer.close.at)}에 신청을 마감합니다.`)
  const labels = ['이름', '휴대폰', ...(questions.companions ? ['동반자 이름'] : []), ...questions.fields.map(f => f.label).filter(Boolean)]
  out.push(`신청서 항목: ${labels.join(', ')}.${questions.marketing.enabled ? ' 마케팅 수신 동의는 선택으로 받습니다.' : ''}`)
  if (paid) {
    const methods = [offer.deposit.enabled && `무통장 입금(${offer.deposit.deadlineHours}시간 안)`, offer.onsite && '현장 결제'].filter(Boolean)
    const rule = sortedRefundRules(offer.refundRules)[0]
    out.push(`결제는 ${methods.join(', ') || '(결제 방법 없음)'} 방식으로 받고${rule ? `, 취소하면 ${refundText(rule)}합니다.` : ' 있습니다.'}`)
  }
  return out.join(' ')
}

export function StepReview({ s, status, pending, onPublish }: StepProps & { status: FormStatus; pending: boolean; onPublish: () => void }) {
  const checks = publishChecks(s.offer, s.items, s.questions, s.mode, s.customHtml)
  return (
    <>
      <Title title="검토하고 게시">이 문장이 맞게 읽히면 설정이 맞은 것입니다.</Title>
      <p className="summary">{summarize(s)}</p>
      <ul className="checks">
        {checks.map(c => (
          <li key={c.text}>
            <span className={`m ${c.level}`}>{c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '×'}</span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="btn btn-primary btn-lg" onClick={onPublish} disabled={pending || checks.some(c => c.level === 'error')}>
          {pending ? '처리 중…' : status === 'draft' ? '게시하기' : '변경 사항 저장'}
        </button>
        {status !== 'draft' && (
          <Link className="btn btn-lg" href={`/f/${s.slug}`} target="_blank">
            신청 화면 보기
          </Link>
        )}
      </div>
      {status !== 'draft' && <p className="small muted">게시된 폼입니다. 정원을 줄여도 이미 확정된 신청은 자동으로 취소하지 않습니다.</p>}
    </>
  )
}
