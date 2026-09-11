import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { applicantCancelAction, claimAction } from '@/app/actions'
import { ActionButton } from '@/components/ActionButton'
import { PublicShell } from '@/components/PublicShell'
import { getApplicationView } from '@/lib/engine'
import { formatDate, formatDateTime, itemLabel, krw, relative } from '@/lib/format'
import { ChangeItem } from './ChangeItem'

export const dynamic = 'force-dynamic'

export default async function ApplicationStatus(props: PageProps<'/f/[slug]/a/[appId]'>) {
  const { slug, appId } = await props.params
  const data = await getApplicationView(slug, appId)
  if (!data) notFound()
  const { form, item, app, position, now, canCancel, alternatives, refund } = data
  const d = form.offer.deposit
  const active = ['confirmed', 'pending_deposit', 'offered', 'waitlisted'].includes(app.status)

  let qr = ''
  if (app.status === 'confirmed') {
    const h = await headers()
    const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
    qr = await QRCode.toString(`${origin}/admin/checkin/${app.id}`, { type: 'svg', margin: 1, width: 200 })
  }

  const answered = form.questions.fields
    .map(f => {
      const v = app.answers[f.id]
      const text = Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? '동의' : '') : v
      return text ? { label: f.label, text } : null
    })
    .filter(Boolean) as { label: string; text: string }[]

  const details = (
    <dl className="dl">
      <dt>신청자</dt>
      <dd>
        {app.name} · {app.party}명
      </dd>
      {app.companions.length > 0 && (
        <>
          <dt>동반자</dt>
          <dd>{app.companions.join(', ')}</dd>
        </>
      )}
      <dt>{form.offer.structure === 'slots' ? '입장 시간' : '항목'}</dt>
      <dd>{itemLabel(item)}</dd>
      <dt>금액</dt>
      <dd>{app.amount > 0 ? `${krw(app.amount)}${app.method === 'onsite' ? ' · 현장 결제' : ''}` : '무료'}</dd>
      {answered.map(a => (
        <div key={a.label} style={{ display: 'contents' }}>
          <dt>{a.label}</dt>
          <dd>{a.text}</dd>
        </div>
      ))}
    </dl>
  )

  const cancelConfirm =
    refund != null
      ? `신청을 취소할까요? 규정에 따라 ${krw(refund.amount)}(${refund.percent}%)을 환불해 드립니다.`
      : '신청을 취소할까요? 취소하면 자리가 다음 분께 넘어갑니다.'

  return (
    <PublicShell theme={form.theme} title={form.title} eyebrow={<span>신청 내역</span>}>
      {app.status === 'confirmed' && (
        <section className="status-card tone-ok">
          <span className="pill st-confirmed">확정</span>
          <h2>신청이 확정되었습니다</h2>
          <div className="qr-row">
            <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="stack" style={{ gap: 6 }}>
              <b>입장할 때 이 QR을 보여 주세요</b>
              {app.checkedInAt ? (
                <span className="pill pill-ok">{formatDateTime(app.checkedInAt)} 입장 완료</span>
              ) : (
                <span className="muted small">입장 하루 전 오전 10시에 안내 문자를 보내드립니다.</span>
              )}
            </div>
          </div>
          {details}
        </section>
      )}

      {app.status === 'pending_deposit' && (
        <section className="status-card tone-warn">
          <span className="pill st-pending_deposit">입금 대기</span>
          <h2>입금하면 확정됩니다</h2>
          <dl className="dl">
            <dt>입금 금액</dt>
            <dd>
              <b>{krw(app.amount)}</b>
            </dd>
            <dt>계좌</dt>
            <dd>
              {d.bank} {d.account}
            </dd>
            <dt>예금주</dt>
            <dd>{d.holder}</dd>
            <dt>입금 기한</dt>
            <dd>{app.expiresAt && `${formatDateTime(app.expiresAt)} · ${relative(app.expiresAt, now)}`}</dd>
          </dl>
          <p className="muted small">입금자명은 신청자 이름({app.name})으로 해 주세요. 기한이 지나면 신청이 자동으로 취소되고 자리가 다음 분께 넘어갑니다.</p>
          {details}
        </section>
      )}

      {app.status === 'waitlisted' && (
        <section className="status-card">
          <span className="pill st-waitlisted">대기</span>
          <div className="row" style={{ gap: 14, alignItems: 'baseline' }}>
            <span className="big-number">{position}</span>
            <h2>번째로 기다리고 있습니다</h2>
          </div>
          <p>
            자리가 나면 문자로 알려드립니다. 알림을 받은 뒤 <b>{form.offer.claimHours}시간</b> 안에 확정하면 자리가 내 것이 됩니다.
          </p>
          {details}
        </section>
      )}

      {app.status === 'offered' && (
        <section className="status-card tone-info">
          <span className="pill st-offered">자리 제안</span>
          <h2>자리가 났습니다</h2>
          {app.expiresAt && (
            <p>
              <b>{formatDateTime(app.expiresAt)}</b>까지 확정해 주세요 ({relative(app.expiresAt, now)}). 기한이 지나면 다음 순번에게 넘어갑니다.
            </p>
          )}
          {details}
          <ActionButton action={claimAction.bind(null, app.id)} variant="primary">
            {app.method === 'deposit' ? '확정하고 입금 안내 받기' : '지금 확정하기'}
          </ActionButton>
        </section>
      )}

      {(app.status === 'expired' || app.status === 'canceled') && (
        <section className="status-card">
          <span className={`pill st-${app.status}`}>{app.status === 'expired' ? '기한 만료' : '취소'}</span>
          <h2>{app.status === 'expired' ? '기한이 지나 신청이 취소되었습니다' : '취소된 신청입니다'}</h2>
          {app.refundDue ? <p>환불 예정 금액 {krw(app.refundDue)} · 운영자가 확인한 뒤 입금해 드립니다.</p> : null}
          {details}
        </section>
      )}

      {alternatives.length > 0 && (
        <ChangeItem
          appId={app.id}
          options={alternatives.map(a => ({ id: a.id, label: itemLabel(a), remaining: a.remaining, group: a.startsAt ? formatDate(a.startsAt) : '' }))}
        />
      )}

      <div className="spread">
        <Link href={`/f/${form.slug}`}>신청 화면으로</Link>
        {canCancel ? (
          <span className="stack" style={{ gap: 4, justifyItems: 'end' }}>
            <ActionButton action={applicantCancelAction.bind(null, app.id)} variant="danger" size="sm" confirm={cancelConfirm}>
              신청 취소
            </ActionButton>
            {refund != null && (
              <span className="small muted">
                지금 취소하면 {krw(refund.amount)} 환불 ({refund.percent}%)
              </span>
            )}
          </span>
        ) : (
          active && <span className="small muted">신청 마감 이후 취소·변경은 운영자에게 문의해 주세요.</span>
        )}
      </div>
    </PublicShell>
  )
}
