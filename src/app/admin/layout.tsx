import Link from 'next/link'

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
        <span className="proto-note">프로토타입 · 온라인 결제 없음, 알림은 발송 기록에만 남습니다</span>
      </header>
      <main className="page">{children}</main>
    </>
  )
}
