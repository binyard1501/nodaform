import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { getPublic } from '@/lib/engine'
import { LookupForm } from './LookupForm'

export const dynamic = 'force-dynamic'

export default async function Lookup(props: PageProps<'/f/[slug]/lookup'>) {
  const { slug } = await props.params
  const data = await getPublic(slug)
  if (!data || data.form.status === 'draft') notFound()
  return (
    <PublicShell theme={data.form.theme} title={data.form.title} eyebrow={<span>내 신청 조회</span>}>
      <p className="muted">신청할 때 쓴 이름과 휴대폰 번호를 입력하면 신청 내역을 보여드립니다.</p>
      <LookupForm slug={slug} />
    </PublicShell>
  )
}
