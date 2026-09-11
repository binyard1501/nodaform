import Link from 'next/link'
import { requireWorkspace } from '@/lib/auth'
import { listCustomers } from '@/lib/engine'
import { formatDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'

const phone = (p: string) => p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3')

export default async function Customers(props: PageProps<'/admin/customers'>) {
  const { marketing = '', q = '' } = (await props.searchParams) as { marketing?: string; q?: string }
  const { workspaceId } = await requireWorkspace()
  const all = await listCustomers(workspaceId)
  const consented = all.filter(c => c.marketing).length
  const d = q.replace(/\D/g, '')
  const rows = all.filter(c => (marketing !== '1' || c.marketing) && (!q || c.name.includes(q) || (d.length >= 3 && c.phone.includes(d))))

  return (
    <>
      <div className="page-head">
        <div className="spread">
          <div className="stack" style={{ gap: 4 }}>
            <h1>고객 DB</h1>
            <p className="muted">모든 폼의 신청자를 휴대폰 번호 기준으로 한 사람씩 묶었습니다. 수신 동의는 가장 최근 신청 기준입니다.</p>
          </div>
          <div className="row">
            <a className="btn" href="/admin/customers/export">
              전체 엑셀
            </a>
            <a className="btn btn-primary" href="/admin/customers/export?marketing=1">
              수신 동의 고객만 엑셀
            </a>
          </div>
        </div>
      </div>

      <div className="figures" style={{ maxWidth: 520 }}>
        <div>
          <span className="k">고객</span>
          <span className="v">
            {all.length}
            <small>명</small>
          </span>
        </div>
        <div>
          <span className="k">마케팅 수신 동의</span>
          <span className="v">
            {consented}
            <small>명</small>
          </span>
        </div>
      </div>

      <div className="toolbar">
        <form className="inline-inputs" role="search">
          <input type="hidden" name="marketing" value={marketing} />
          <input className="input input-sm" style={{ width: 220 }} name="q" defaultValue={q} placeholder="이름·번호로 찾기" aria-label="고객 검색" />
          <button className="btn btn-sm" type="submit">
            찾기
          </button>
        </form>
        <nav className="tabs" aria-label="수신 동의">
          <Link href={`?${q ? `q=${encodeURIComponent(q)}` : ''}`} aria-current={marketing !== '1' ? 'page' : undefined}>
            전체
          </Link>
          <Link href={`?marketing=1${q ? `&q=${encodeURIComponent(q)}` : ''}`} aria-current={marketing === '1' ? 'page' : undefined}>
            수신 동의만
          </Link>
        </nav>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>이름</th>
              <th>연락처</th>
              <th>수신 동의</th>
              <th className="r">진행 중 신청</th>
              <th>신청한 폼</th>
              <th>최근 신청</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  일치하는 고객이 없습니다.
                </td>
              </tr>
            )}
            {rows.map(c => (
              <tr key={c.phone}>
                <td>{c.name}</td>
                <td className="num">{phone(c.phone)}</td>
                <td>{c.marketing ? <span className="pill pill-info">동의</span> : <span className="faint">–</span>}</td>
                <td className="r">{c.count}</td>
                <td className="wrap">{c.forms.join(' · ')}</td>
                <td className="small muted">{formatDateTime(c.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
