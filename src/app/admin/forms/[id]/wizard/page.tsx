import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireWorkspace } from '@/lib/auth'
import { getWizard } from '@/lib/engine'
import { Wizard } from './Wizard'

export const dynamic = 'force-dynamic'

export default async function WizardPage(props: PageProps<'/admin/forms/[id]/wizard'>) {
  const { id } = await props.params
  const { workspaceId } = await requireWorkspace()
  const data = await getWizard(workspaceId, id)
  if (!data) notFound()

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/admin">신청 폼</Link>
          <span>/</span>
          {data.form.status === 'draft' ? <span>새 폼</span> : <Link href={`/admin/forms/${id}`}>{data.form.title}</Link>}
          <span>/</span>
          <span>판매 설정</span>
        </div>
        <h1>판매 설정</h1>
      </div>
      <Wizard formId={id} initial={data.form} initialItems={data.items} hasApplications={data.hasApplications} defaultDate={data.defaultDate} />
    </>
  )
}
