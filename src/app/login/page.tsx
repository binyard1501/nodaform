import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await getSession()) redirect('/admin')
  return (
    <div className="auth-page">
      <div className="panel auth-card">
        <div className="stack" style={{ gap: 4 }}>
          <span className="brand" style={{ fontSize: 22 }}>
            노다<span>.</span>
          </span>
          <h1>로그인</h1>
        </div>
        <LoginForm />
        <p className="foot">
          아직 계정이 없으신가요? <Link href="/signup">워크스페이스 만들기</Link>
        </p>
      </div>
    </div>
  )
}
