import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  bulkConfirmAction,
  confirmDepositAction,
  duplicateFormAction,
  operatorCancelAction,
  setFormStatusAction,
  shiftClockAction,
} from '@/app/actions'
import { ActionButton } from '@/components/ActionButton'
import { getDashboard } from '@/lib/engine'
import { formatDate, formatDateTime, itemLabel, krw, kstIso, relative, toKstInput } from '@/lib/format'
import { CHANNEL_LABEL, METHOD_LABEL, STATUS_LABEL, TRIGGER_LABEL, type Application, type AppStatus, type FormRecord, type ItemStats } from '@/lib/types'
import { ManualRegister } from './ManualRegister'

export const dynamic = 'force-dynamic'

const FILTERS: { key: string; label: string; statuses: AppStatus[] | null }[] = [
  { key: 'all', label: '전체', statuses: null },
  { key: 'confirmed', label: '확정', statuses: ['confirmed'] },
  { key: 'pending', label: '입금 대기', statuses: ['pending_deposit'] },
  { key: 'waiting', label: '대기·자리 제안', statuses: ['waitlisted', 'offered'] },
  { key: 'closed', label: '취소·만료', statuses: ['canceled', 'expired'] },
]

const phone = (p: string) => p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3')

function offsetText(ms: number) {
  if (ms === 0) return '실제 시각'
  const h = Math.round(ms / 3600_000)
  return h >= 24 ? `실제보다 ${Math.floor(h / 24)}일 ${h % 24}시간 뒤` : `실제보다 ${h}시간 뒤`
}

function answerText(form: FormRecord, a: Application) {
  return form.questions.fields
    .map(f => {
      const v = a.answers[f.id]
      const text = Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? '동의' : '') : v
      return text ? { label: f.label, text } : null
    })
    .filter(Boolean) as { label: string; text: string }[]
}

function matches(form: FormRecord, a: Application, q: string) {
  if (!q) return true
  const needle = q.toLowerCase()
  const d = q.replace(/\D/g, '')
  return (
    a.name.toLowerCase().includes(needle) ||
    (d.length >= 3 && a.phone.includes(d)) ||
    a.companions.some(c => c.includes(q)) ||
    a.memo.includes(q) ||
    answerText(form, a).some(x => x.text.toLowerCase().includes(needle))
  )
}

export default async function Dashboard(props: PageProps<'/admin/forms/[id]'>) {
  const { id } = await props.params
  const { status: filterKey = 'all', q = '', day: dayParam = '' } = (await props.searchParams) as { status?: string; q?: string; day?: string }
  const data = await getDashboard(id)
  if (!data) notFound()
  const { form, stats, applications, messages, now, offsetMs } = data

  const itemById = new Map(stats.map(s => [s.id, s]))
  const filter = FILTERS.find(f => f.key === filterKey) ?? FILTERS[0]
  const rows = applications.filter(a => (!filter.statuses || filter.statuses.includes(a.status)) && matches(form, a, q.trim()))
  const unlimited = stats.some(s => s.capacity === null)
  const total = {
    confirmed: stats.reduce((s, i) => s + i.confirmed, 0),
    pending: stats.reduce((s, i) => s + i.pending, 0),
    waiting: stats.reduce((s, i) => s + i.waitlisted, 0),
    checkedIn: stats.reduce((s, i) => s + i.checkedIn, 0),
    remaining: stats.reduce((s, i) => s + (i.closed ? 0 : (i.remaining ?? 0)), 0),
    capacity: stats.reduce((s, i) => s + (i.capacity ?? 0), 0),
  }
  const refundsDue = applications.filter(a => a.status === 'canceled' && a.refundDue)
  const hasPending = rows.some(a => a.status === 'pending_deposit')
  const tabHref = (key: string) => `?status=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`
  const dayKey = (s: ItemStats) => toKstInput(s.startsAt).date
  const dayList = [...new Set(stats.map(dayKey))]
  const multiDay = dayList.length > 1
  const selectedDay = multiDay ? (dayList.includes(dayParam) ? dayParam : dayList[0]) : ''
  const shownStats = multiDay ? stats.filter(s => dayKey(s) === selectedDay) : stats
  const dayLabel = (d: string) => (d ? formatDate(kstIso(d, '12:00')) : '날짜 없음')

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/admin">신청 폼</Link>
          <span>/</span>
          <span className="mono">/f/{form.slug}</span>
        </div>
        <div className="spread">
          <div className="row" style={{ gap: 12 }}>
            <h1>{form.title}</h1>
            <span className={`pill fs-${form.status}`}>{form.status === 'published' ? '신청 받는 중' : form.status === 'closed' ? '마감' : '작성 중'}</span>
          </div>
          <div className="row">
            {form.status !== 'draft' && (
              <Link className="btn" href={`/f/${form.slug}`} target="_blank">
                신청 화면 열기
              </Link>
            )}
            <Link className="btn" href={`/admin/forms/${form.id}/checkin`}>
              입장 확인
            </Link>
            <Link className="btn" href={`/admin/forms/${form.id}/wizard`}>
              판매 설정 수정
            </Link>
            <form action={duplicateFormAction.bind(null, form.id)}>
              <button type="submit" className="btn btn-ghost">
                복제
              </button>
            </form>
            {form.status === 'published' && (
              <ActionButton action={setFormStatusAction.bind(null, form.id, 'closed')} variant="ghost" confirm="신청을 마감할까요? 이미 받은 신청은 그대로 남습니다.">
                신청 마감
              </ActionButton>
            )}
            {form.status === 'closed' && (
              <ActionButton action={setFormStatusAction.bind(null, form.id, 'published')} variant="ghost">
                다시 열기
              </ActionButton>
            )}
          </div>
        </div>
      </div>

      <div className="clock">
        <span>
          데모 시계 <b>{formatDateTime(now)}</b> <span className="muted">· {offsetText(offsetMs)}</span>
        </span>
        <span className="row">
          <ActionButton action={shiftClockAction.bind(null, 3600_000)} size="sm">
            1시간 뒤로
          </ActionButton>
          <ActionButton action={shiftClockAction.bind(null, 86_400_000)} size="sm">
            하루 뒤로
          </ActionButton>
          {offsetMs !== 0 && (
            <ActionButton action={shiftClockAction.bind(null, null)} size="sm" variant="ghost">
              실제 시각으로
            </ActionButton>
          )}
        </span>
        <span className="muted small">입금 기한이나 대기 확정 기한이 지나는 상황을 바로 확인할 때 씁니다.</span>
      </div>

      <div className="figures">
        <div>
          <span className="k">확정</span>
          <span className="v">
            {total.confirmed}
            <small>명</small>
          </span>
        </div>
        <div>
          <span className="k">입장</span>
          <span className="v">
            {total.checkedIn}
            <small>/ {total.confirmed}명</small>
          </span>
        </div>
        <div>
          <span className="k">입금 대기</span>
          <span className="v">
            {total.pending}
            <small>명</small>
          </span>
        </div>
        <div>
          <span className="k">대기</span>
          <span className="v">
            {total.waiting}
            <small>팀</small>
          </span>
        </div>
        <div>
          <span className="k">남은 자리</span>
          <span className="v">{unlimited ? <small style={{ marginLeft: 0 }}>제한 없음</small> : <>{total.remaining}<small>/ {total.capacity}석</small></>}</span>
        </div>
      </div>

      {refundsDue.length > 0 && (
        <p className="notice">
          환불할 신청이 {refundsDue.length}건, 모두 {krw(refundsDue.reduce((s, a) => s + (a.refundDue ?? 0), 0))}입니다. 취소·만료 탭에서 확인하세요.
        </p>
      )}

      <section className="section">
        <div className="section-head">
          <h2>{multiDay ? '날짜별 현황' : '항목별 현황'}</h2>
          <span className="muted small">남은 자리 = 정원 − 확정 − 입금 대기 − 자리 제안</span>
        </div>
        {multiDay && (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th className="r">시간대</th>
                    <th className="r">정원</th>
                    <th className="r">확정</th>
                    <th className="r">입장</th>
                    <th className="r">입금 대기</th>
                    <th className="r">대기</th>
                    <th className="r">남은 자리</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {dayList.map(d => {
                    const list = stats.filter(s => dayKey(s) === d)
                    const sum = (f: (s: ItemStats) => number) => list.reduce((a, s) => a + f(s), 0)
                    const waiting = sum(s => s.waitlisted)
                    return (
                      <tr key={d} className={d === selectedDay ? 'selected' : list.every(s => s.closed) ? 'dim' : undefined}>
                        <td>{dayLabel(d)}</td>
                        <td className="r">{list.length}</td>
                        <td className="r">{sum(s => s.capacity ?? 0)}</td>
                        <td className="r">{sum(s => s.confirmed)}</td>
                        <td className="r">{sum(s => s.checkedIn) || '–'}</td>
                        <td className="r">{sum(s => s.pending) || '–'}</td>
                        <td className="r">{waiting ? `${waiting}팀` : '–'}</td>
                        <td className="r">{sum(s => (s.closed ? 0 : (s.remaining ?? 0)))}</td>
                        <td>
                          {d === selectedDay ? (
                            <span className="small muted">아래 표시 중</span>
                          ) : (
                            <Link href={`?day=${d}`} scroll={false}>
                              시간대 보기
                            </Link>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <h3>{dayLabel(selectedDay)} 시간대</h3>
          </>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>항목</th>
                <th>채워진 정도</th>
                <th className="r">정원</th>
                <th className="r">확정</th>
                <th className="r">입장</th>
                <th className="r">입금 대기</th>
                <th className="r">자리 제안</th>
                <th className="r">대기</th>
                <th className="r">남은 자리</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {shownStats.map(s => {
                const cap = s.capacity
                const pct = (n: number) => (cap ? `${(n / cap) * 100}%` : '0%')
                const over = cap === null ? 0 : s.confirmed + s.pending + s.offered - cap
                return (
                  <tr key={s.id} className={s.closed ? 'dim' : undefined}>
                    <td>{itemLabel(s)}</td>
                    <td>
                      {cap === null ? (
                        <span className="small muted">–</span>
                      ) : (
                        <span className="meter" aria-label={`${cap}석 중 ${cap - (s.remaining ?? 0)}석 사용`}>
                          <i className="m-confirmed" style={{ width: pct(s.confirmed) }} />
                          <i className="m-pending" style={{ width: pct(s.pending) }} />
                          <i className="m-offered" style={{ width: pct(s.offered) }} />
                        </span>
                      )}
                    </td>
                    <td className="r">{cap ?? '제한 없음'}</td>
                    <td className="r">{s.confirmed}</td>
                    <td className="r">{s.checkedIn || '–'}</td>
                    <td className="r">{s.pending || '–'}</td>
                    <td className="r">{s.offered || '–'}</td>
                    <td className="r">{s.waitlisted ? `${s.waitlisted}팀` : '–'}</td>
                    <td className="r">{s.remaining ?? '–'}</td>
                    <td>
                      {s.closed ? (
                        <span className="pill">신청 마감</span>
                      ) : over > 0 ? (
                        <span className="pill pill-bad">정원보다 {over}명 많음</span>
                      ) : s.remaining === 0 ? (
                        <span className="pill st-waitlisted">{form.offer.overflow === 'waitlist' ? '대기 받는 중' : '매진'}</span>
                      ) : (
                        <span className="pill pill-ok">신청 가능</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>신청자</h2>
          <div className="row">
            <a className="btn btn-sm" href={`/admin/forms/${form.id}/export`}>
              엑셀로 받기
            </a>
          </div>
        </div>
        <ManualRegister
          formId={form.id}
          paid={!form.offer.free && stats.some(s => s.price > 0)}
          deposit={form.offer.deposit.enabled}
          onsite={form.offer.onsite}
          items={stats.map(s => ({ id: s.id, label: itemLabel(s), remaining: s.remaining, group: s.startsAt ? formatDate(s.startsAt) : '' }))}
        />
        <div className="toolbar">
          <form className="inline-inputs" role="search">
            <input type="hidden" name="status" value={filter.key} />
            <input className="input input-sm" style={{ width: 240 }} name="q" defaultValue={q} placeholder="이름·번호·소속·메모로 찾기" aria-label="신청자 검색" />
            <button type="submit" className="btn btn-sm">
              찾기
            </button>
            {q && (
              <Link className="btn btn-sm btn-ghost" href={`?status=${filter.key}`}>
                지우기
              </Link>
            )}
          </form>
          <nav className="tabs" aria-label="신청 상태">
            {FILTERS.map(f => (
              <Link key={f.key} href={tabHref(f.key)} aria-current={f.key === filter.key ? 'page' : undefined} scroll={false}>
                {f.label}
              </Link>
            ))}
          </nav>
        </div>
        {hasPending && (
          <form id="bulk" action={bulkConfirmAction} className="row small">
            <button type="submit" className="btn btn-sm btn-primary">
              선택한 신청 입금 확인
            </button>
            <span className="muted">입금 대기 줄 왼쪽의 체크 칸으로 여러 건을 한 번에 확정합니다.</span>
          </form>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th aria-label="선택" />
                <th className="r">번호</th>
                <th>이름</th>
                <th>연락처</th>
                <th>항목</th>
                <th className="r">인원</th>
                <th className="r">금액</th>
                <th>결제</th>
                <th>상태</th>
                <th>기한·입장</th>
                <th>응답</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="muted">
                    {q ? `'${q}'와 일치하는 신청이 없습니다.` : '이 상태의 신청이 없습니다.'}
                  </td>
                </tr>
              )}
              {rows.map(a => {
                const item = itemById.get(a.itemId)
                const active = ['confirmed', 'pending_deposit', 'offered', 'waitlisted'].includes(a.status)
                const answers = answerText(form, a)
                return (
                  <tr key={a.id} className={active ? undefined : 'dim'}>
                    <td>
                      {a.status === 'pending_deposit' && <input type="checkbox" name="ids" value={a.id} form="bulk" aria-label={`${a.name} 선택`} />}
                    </td>
                    <td className="r mono">{a.seq}</td>
                    <td>
                      <Link href={`/f/${form.slug}/a/${a.id}`} target="_blank" title="신청자가 보는 화면">
                        {a.name}
                      </Link>
                      {a.source === 'manual' && <span className="pill" style={{ marginLeft: 6 }}>수기</span>}
                      {a.marketing && <span className="pill pill-info" style={{ marginLeft: 6 }}>수신 동의</span>}
                    </td>
                    <td className="num">{phone(a.phone)}</td>
                    <td>{item ? itemLabel(item) : '–'}</td>
                    <td className="r">{a.party}</td>
                    <td className="r">{a.amount ? krw(a.amount) : '무료'}</td>
                    <td>{METHOD_LABEL[a.method]}</td>
                    <td>
                      <span className={`pill st-${a.status}`}>{STATUS_LABEL[a.status]}</span>
                      {a.refundDue ? <span className="pill pill-warn" style={{ marginLeft: 6 }}>환불 {krw(a.refundDue)}</span> : null}
                    </td>
                    <td className="small muted">
                      {a.checkedInAt ? <span className="pill pill-ok">입장 {formatDateTime(a.checkedInAt).split(' ')[1]}</span> : a.expiresAt && active ? relative(a.expiresAt, now) : ''}
                    </td>
                    <td>
                      {answers.length + a.companions.length + (a.memo ? 1 : 0) > 0 ? (
                        <details className="answers">
                          <summary>보기</summary>
                          <dl>
                            {a.companions.length > 0 && (
                              <>
                                <dt>동반자</dt>
                                <dd>{a.companions.join(', ')}</dd>
                              </>
                            )}
                            {answers.map(x => (
                              <div key={x.label} style={{ display: 'contents' }}>
                                <dt>{x.label}</dt>
                                <dd>{x.text}</dd>
                              </div>
                            ))}
                            {a.memo && (
                              <>
                                <dt>메모</dt>
                                <dd>{a.memo}</dd>
                              </>
                            )}
                          </dl>
                        </details>
                      ) : (
                        <span className="faint">–</span>
                      )}
                    </td>
                    <td>
                      <span className="row" style={{ flexWrap: 'nowrap' }}>
                        {a.status === 'pending_deposit' && (
                          <ActionButton action={confirmDepositAction.bind(null, a.id)} size="sm" variant="primary">
                            입금 확인
                          </ActionButton>
                        )}
                        {active && (
                          <ActionButton
                            action={operatorCancelAction.bind(null, a.id)}
                            size="sm"
                            variant="danger"
                            confirm={`${a.name}님의 신청을 취소할까요? 입금 확인된 신청은 환불 규정에 따라 환불 예정 금액이 기록됩니다.`}
                          >
                            취소
                          </ActionButton>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>발송 기록</h2>
          <span className="muted small">프로토타입이라 실제로 보내지 않고 보낼 내용만 남깁니다 · 최근 60건</span>
        </div>
        <ul className="log panel">
          {messages.length === 0 && <li className="muted">아직 발송 기록이 없습니다.</li>}
          {messages.map(m => (
            <li key={m.id}>
              <span className="when">{formatDateTime(m.sendAt)}</span>
              <span className="what">
                <span className="row" style={{ gap: 6 }}>
                  <span className="pill">{CHANNEL_LABEL[m.channel]}</span>
                  {m.status === 'scheduled' && <span className="pill pill-info">예약</span>}
                </span>
                <span className="small muted">
                  {TRIGGER_LABEL[m.trigger]} · {phone(m.toPhone)}
                </span>
              </span>
              <span className="body">{m.body}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
