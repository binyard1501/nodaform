import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { SignUpForm } from './SignUpForm'

export const dynamic = 'force-dynamic'

export default async function SignUpPage() {
  if (await getSession()) redirect('/admin')
  return (
    <div className="auth-page">
      <div className="panel auth-card">
        <div className="stack" style={{ gap: 4 }}>
          <span className="brand" style={{ fontSize: 22 }}>
            노다<span>.</span>
          </span>
          <h1>워크스페이스 만들기</h1>
          <p className="muted small">가입하면 둘러볼 수 있는 예시 폼이 몇 개 채워집니다.</p>
        </div>
        <SignUpForm />
        <p className="foot">
          이미 계정이 있으신가요? <Link href="/login">로그인</Link>
        </p>
      </div>
    </div>
  )
}
