import Link from 'next/link'
import { notFound } from 'next/navigation'
import { checkInAction } from '@/app/actions'
import { ActionButton } from '@/components/ActionButton'
import { getCheckinApp } from '@/lib/engine'
import { formatDateTime, itemLabel } from '@/lib/format'
import { STATUS_LABEL } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ScanResult(props: PageProps<'/admin/checkin/[appId]'>) {
  const { appId } = await props.params
  const data = await getCheckinApp(appId)
  if (!data) notFound()
  const { form, app, item } = data

  return (
    <div className="scan">
      <div className="eyebrow">
        <Link href={`/admin/forms/${form.id}/checkin`}>{form.title} 입장 확인</Link>
      </div>
      <section className={`status-card ${app.status !== 'confirmed' ? 'tone-warn' : app.checkedInAt ? '' : 'tone-ok'}`}>
        <span className={`pill st-${app.status}`}>{STATUS_LABEL[app.status]}</span>
        <h1>
          {app.name} <span className="muted">· {app.party}명</span>
        </h1>
        <dl className="dl">
          <dt>항목</dt>
          <dd>{itemLabel(item)}</dd>
          {app.companions.length > 0 && (
            <>
              <dt>동반자</dt>
              <dd>{app.companions.join(', ')}</dd>
            </>
          )}
          <dt>연락처</dt>
          <dd>끝번호 {app.phone.slice(-4)}</dd>
        </dl>
        {app.status !== 'confirmed' ? (
          <p className="form-error">확정된 신청이 아닙니다. 입금이나 대기 상태를 먼저 확인해 주세요.</p>
        ) : app.checkedInAt ? (
          <div className="stack">
            <p>
              <b>이미 {formatDateTime(app.checkedInAt)}에 입장했습니다.</b>
            </p>
            <ActionButton action={checkInAction.bind(null, app.id, false)} variant="ghost">
              입장 되돌리기
            </ActionButton>
          </div>
        ) : (
          <ActionButton action={checkInAction.bind(null, app.id, true)} variant="primary">
            입장 처리
          </ActionButton>
        )}
      </section>
    </div>
  )
}
