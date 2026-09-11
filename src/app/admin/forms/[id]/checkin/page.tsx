import Link from 'next/link'
import { notFound } from 'next/navigation'
import { checkInAction } from '@/app/actions'
import { ActionButton } from '@/components/ActionButton'
import { getCheckin } from '@/lib/engine'
import { formatDate, formatTime, itemLabel } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function Checkin(props: PageProps<'/admin/forms/[id]/checkin'>) {
  const { id } = await props.params
  const { q = '', item: itemFilter = '' } = (await props.searchParams) as { q?: string; item?: string }
  const data = await getCheckin(id)
  if (!data) notFound()
  const { form, stats, applications } = data
  const byId = new Map(stats.map(s => [s.id, s]))
  const d = q.replace(/\D/g, '')
  const rows = applications.filter(
    a =>
      (!itemFilter || a.itemId === itemFilter) &&
      (!q || a.name.includes(q) || a.companions.some(c => c.includes(q)) || (d.length >= 4 && a.phone.endsWith(d)) || (d.length >= 3 && a.phone.includes(d))),
  )
  const people = applications.reduce((s, a) => s + a.party, 0)
  const inside = applications.filter(a => a.checkedInAt).reduce((s, a) => s + a.party, 0)

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/admin">신청 폼</Link>
          <span>/</span>
          <Link href={`/admin/forms/${form.id}`}>{form.title}</Link>
          <span>/</span>
          <span>입장 확인</span>
        </div>
        <div className="spread">
          <h1>입장 확인</h1>
          <span className="checkin-count">
            <b>{inside}</b> / {people}명 입장
          </span>
        </div>
        <p className="muted">신청자 QR을 휴대폰 카메라로 찍으면 입장 화면이 바로 열립니다. QR이 없으면 이름이나 번호 뒷자리로 찾으세요.</p>
      </div>

      <form className="inline-inputs" role="search">
        <input className="input" style={{ width: 260 }} name="q" defaultValue={q} placeholder="이름 또는 번호 뒷자리 4개" aria-label="입장자 찾기" autoFocus />
        {stats.length > 1 && (
          <select className="input" style={{ width: 'auto' }} name="item" defaultValue={itemFilter} aria-label="항목">
            <option value="">모든 항목</option>
            {[...new Set(stats.map(s => (s.startsAt ? formatDate(s.startsAt) : '')))].map(g => (
              <optgroup key={g} label={g || '날짜 없음'}>
                {stats
                  .filter(s => (s.startsAt ? formatDate(s.startsAt) : '') === g)
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {itemLabel(s)} · {s.checkedIn}/{s.confirmed}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        )}
        <button type="submit" className="btn">
          찾기
        </button>
      </form>

      <ul className="panel checkin-list">
        {rows.length === 0 && <li className="muted">확정된 신청 중 일치하는 사람이 없습니다.</li>}
        {rows.map(a => (
          <li key={a.id} className={a.checkedInAt ? 'done' : undefined}>
            <div className="stack" style={{ gap: 2 }}>
              <b>
                {a.name} <span className="muted small">· {a.party}명 · 끝번호 {a.phone.slice(-4)}</span>
              </b>
              <span className="small muted">
                {byId.get(a.itemId) ? itemLabel(byId.get(a.itemId)!) : ''}
                {a.companions.length > 0 && ` · 동반 ${a.companions.join(', ')}`}
              </span>
            </div>
            {a.checkedInAt ? (
              <span className="row">
                <span className="pill pill-ok">{formatTime(a.checkedInAt)} 입장</span>
                <ActionButton action={checkInAction.bind(null, a.id, false)} size="sm" variant="ghost">
                  되돌리기
                </ActionButton>
              </span>
            ) : (
              <ActionButton action={checkInAction.bind(null, a.id, true)} variant="primary">
                입장 처리
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
