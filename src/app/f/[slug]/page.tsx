import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { getPublic } from '@/lib/engine'
import { formatDate } from '@/lib/format'
import { isOpen } from '@/lib/rules'
import { ApplyForm } from './ApplyForm'

export const dynamic = 'force-dynamic'

export default async function PublicForm(props: PageProps<'/f/[slug]'>) {
  const { slug } = await props.params
  const data = await getPublic(slug)
  if (!data || data.form.status === 'draft') notFound()
  const { form, stats, now } = data
  const dates = [...new Set(stats.filter(s => s.startsAt).map(s => formatDate(s.startsAt!)))]

  return (
    <PublicShell
      theme={form.theme}
      title={form.title}
      description={form.description}
      eyebrow={dates.length > 0 ? <span>{dates.length > 3 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : dates.join(' · ')}</span> : undefined}
    >
      {form.status === 'closed' ? (
        <p className="status-card">신청이 마감되었습니다. 문의는 운영자에게 연락해 주세요.</p>
      ) : (
        <ApplyForm
          slug={slug}
          offer={form.offer}
          questions={form.questions}
          stats={stats}
          opensAt={isOpen(form.offer, new Date(now)) ? null : form.offer.openAt}
        />
      )}
      <p className="small muted" style={{ textAlign: 'center' }}>
        이미 신청하셨나요? <Link href={`/f/${slug}/lookup`}>내 신청 조회</Link>
      </p>
    </PublicShell>
  )
}
