import { requireWorkspace } from '@/lib/auth'
import { csvResponse } from '@/lib/csv'
import { listCustomers } from '@/lib/engine'
import { formatDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { workspaceId } = await requireWorkspace()
  const onlyConsented = new URL(req.url).searchParams.get('marketing') === '1'
  const customers = (await listCustomers(workspaceId)).filter(c => !onlyConsented || c.marketing)
  return csvResponse(onlyConsented ? '고객 DB (수신 동의).csv' : '고객 DB.csv', [
    ['이름', '연락처', '마케팅 수신 동의', '진행 중 신청', '신청한 폼', '최근 신청'],
    ...customers.map(c => [
      c.name,
      c.phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3'),
      c.marketing ? '동의' : '',
      c.count,
      c.forms.join(' / '),
      formatDateTime(c.lastAt),
    ]),
  ])
}
