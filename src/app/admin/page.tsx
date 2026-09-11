import Link from 'next/link'
import { createDraftAction, duplicateFormAction } from '@/app/actions'
import { listForms } from '@/lib/engine'

export const dynamic = 'force-dynamic'

const FORM_STATUS = { draft: '작성 중', published: '신청 받는 중', closed: '마감' } as const
const STRUCTURE = { simple: '단순 신청', single: '권종', slots: '시간대' } as const

export default async function AdminHome() {
  const forms = await listForms()

  return (
    <>
      <div className="page-head">
        <div className="spread">
          <div className="stack" style={{ gap: 4 }}>
            <h1>신청 폼</h1>
            <p className="muted">폼마다 신청서, 정원, 대기자, 자동 알림, 신청 화면 디자인을 따로 설정합니다.</p>
          </div>
          <form action={createDraftAction}>
            <button type="submit" className="btn btn-primary">
              새 폼 만들기
            </button>
          </form>
        </div>
      </div>

      <ul className="form-list panel">
        {forms.map(f => {
          const ratio = f.capacity > 0 ? f.confirmed / f.capacity : 0
          return (
            <li key={f.id}>
              <div className="stack" style={{ gap: 6 }}>
                <div className="row">
                  <span className="swatch" style={{ background: f.theme.color }} aria-hidden="true" />
                  <Link className="title" href={f.status === 'draft' ? `/admin/forms/${f.id}/wizard` : `/admin/forms/${f.id}`}>
                    {f.title}
                  </Link>
                  <span className={`pill fs-${f.status}`}>{FORM_STATUS[f.status]}</span>
                </div>
                <div className="meta">
                  <span>
                    {STRUCTURE[f.offer.structure]}
                    {f.offer.structure !== 'simple' && ` ${f.items}개`} · {f.offer.free ? '무료' : '유료'}
                  </span>
                  {f.unlimited ? (
                    <span className="num">확정 {f.confirmed.toLocaleString('ko-KR')}명 · 정원 제한 없음</span>
                  ) : (
                    <span className="row" style={{ gap: 8 }}>
                      <span className="meter" aria-hidden="true">
                        <i className="m-confirmed" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                      </span>
                      <span className="num">
                        확정 {f.confirmed.toLocaleString('ko-KR')} / {f.capacity.toLocaleString('ko-KR')}석
                      </span>
                    </span>
                  )}
                  {f.waiting > 0 && <span className="pill st-waitlisted">대기 {f.waiting}팀</span>}
                  <span className="mono faint">/f/{f.slug}</span>
                </div>
              </div>
              <div className="row">
                <Link className="btn btn-sm" href={`/admin/forms/${f.id}/wizard`}>
                  판매 설정
                </Link>
                {f.status !== 'draft' && (
                  <Link className="btn btn-sm btn-ghost" href={`/f/${f.slug}`} target="_blank">
                    신청 화면
                  </Link>
                )}
                <form action={duplicateFormAction.bind(null, f.id)}>
                  <button type="submit" className="btn btn-sm btn-ghost">
                    복제
                  </button>
                </form>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
