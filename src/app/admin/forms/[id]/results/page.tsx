import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireWorkspace } from '@/lib/auth'
import { getResults } from '@/lib/engine'
import { formatDateTime } from '@/lib/format'
import { summarizeAnswers } from '@/lib/stats'

export const dynamic = 'force-dynamic'

export default async function Results(props: PageProps<'/admin/forms/[id]/results'>) {
  const { id } = await props.params
  const { workspaceId } = await requireWorkspace()
  const data = await getResults(workspaceId, id)
  if (!data) notFound()
  const { form, applications } = data
  const summaries = summarizeAnswers(form.questions.fields, applications)
  const survey = form.kind === 'survey'
  const last = applications[0]

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/admin">신청 폼</Link>
          <span>/</span>
          <Link href={`/admin/forms/${form.id}`}>{form.title}</Link>
          <span>/</span>
          <span>응답 집계</span>
        </div>
        <div className="spread">
          <h1>응답 집계</h1>
          <a className="btn" href={`/admin/forms/${form.id}/export`}>
            엑셀로 내려받기
          </a>
        </div>
      </div>

      <div className="figures" style={{ maxWidth: 520 }}>
        <div>
          <span className="k">{survey ? '응답' : '신청'}</span>
          <span className="v">
            {applications.length}
            <small>건</small>
          </span>
        </div>
        <div>
          <span className="k">마지막 응답</span>
          <span className="v" style={{ fontSize: 17 }}>
            {last ? formatDateTime(last.createdAt) : '–'}
          </span>
        </div>
      </div>

      {form.questions.fields.length === 0 ? (
        <p className="status-card">
          집계할 입력 항목이 없습니다. <Link href={`/admin/forms/${form.id}/wizard`}>&apos;신청서 항목&apos; 단계</Link>에서 질문을 추가해 주세요.
        </p>
      ) : (
        <div className="stack" style={{ gap: 18 }}>
          {summaries.map(s => (
            <section key={s.field.id} className="panel result-card">
              <div className="spread">
                <b>{s.field.label || s.field.id}</b>
                <span className="small muted">
                  응답 {s.answered}건{applications.length > 0 && ` · ${Math.round((s.answered / applications.length) * 100)}%`}
                </span>
              </div>

              {s.kind === 'counted' ? (
                s.options.length === 0 ? (
                  <p className="muted small">아직 응답이 없습니다.</p>
                ) : (
                  <ul className="result-bars">
                    {s.options.map(o => (
                      <li key={o.label}>
                        <span className="result-label">{o.label}</span>
                        <span className="result-track" aria-hidden="true">
                          <i style={{ width: `${o.percent}%` }} />
                        </span>
                        <span className="result-num num">
                          {o.count}건 · {o.percent}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : s.samples.length === 0 ? (
                <p className="muted small">아직 응답이 없습니다.</p>
              ) : (
                <>
                  <ul className="result-texts">
                    {s.samples.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                  {s.answered > s.samples.length && (
                    <p className="small muted">최근 {s.samples.length}건만 표시합니다. 전체는 엑셀로 내려받으세요.</p>
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  )
}
