import Link from 'next/link'
import { logoutAction } from '@/app/actions'
import { requireWorkspace } from '@/lib/auth'

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireWorkspace()
  return (
    <>
      <header className="topbar">
        <Link href="/admin" className="brand">
          노다<span>.</span>
        </Link>
        <nav>
          <Link href="/admin">신청 폼</Link>
          <Link href="/admin/customers">고객 DB</Link>
        </nav>
        <span className="proto-note">{session.workspaceName} · 온라인 결제 없음, 알림은 발송 기록에만 남습니다</span>
        <span className="row" style={{ gap: 10 }}>
          <span className="small muted">{session.email}</span>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost btn-sm">
              로그아웃
            </button>
          </form>
        </span>
      </header>
      <main className="page">{children}</main>
    </>
  )
}
