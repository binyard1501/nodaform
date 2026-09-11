import { requireWorkspace } from '@/lib/auth'
import { csvResponse } from '@/lib/csv'
import { exportRows } from '@/lib/engine'
import { formatDateTime, itemLabel } from '@/lib/format'
import { METHOD_LABEL, STATUS_LABEL } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspaceId } = await requireWorkspace()
  const data = await exportRows(workspaceId, id)
  if (!data) return new Response('폼을 찾을 수 없습니다.', { status: 404 })
  const { form, items, applications } = data
  const byId = new Map(items.map(i => [i.id, i]))
  const fields = form.questions.fields

  const header = ['번호', '상태', '이름', '연락처', '항목', '인원', '동반자', '금액', '결제', ...fields.map(f => f.label), '마케팅 수신 동의', '신청 시각', '입장 시각', '신청 경로', '메모', '환불 예정']
  const rows = applications.map(a => [
    a.seq,
    STATUS_LABEL[a.status],
    a.name,
    a.phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3'),
    byId.get(a.itemId) ? itemLabel(byId.get(a.itemId)!) : '',
    a.party,
    a.companions.join(', '),
    a.amount,
    METHOD_LABEL[a.method],
    ...fields.map(f => {
      const v = a.answers[f.id]
      return Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? '동의' : '') : (v ?? '')
    }),
    a.marketing ? '동의' : '',
    formatDateTime(a.createdAt),
    a.checkedInAt ? formatDateTime(a.checkedInAt) : '',
    a.source === 'manual' ? '수기 등록' : '온라인',
    a.memo,
    a.refundDue ?? '',
  ])
  return csvResponse(`${form.title} 신청자.csv`, [header, ...rows])
}
