import { randomUUID } from 'node:crypto'
import { rawDb, type Q } from './db'
import { sanitizeFormHtml } from './sanitizeHtml'
import { UserError } from './engine'

export type TemplateVisibility = 'private' | 'public'

export type TemplateCard = {
  id: string
  name: string
  html: string
  visibility: TemplateVisibility
  isBuiltin: boolean
  mine: boolean
  avgRating: number
  ratingCount: number
  myRating: number | null
}

type TemplateRow = {
  id: string
  workspace_id: string | null
  name: string
  html: string
  visibility: string
  is_builtin: boolean
  avg_rating: number | null
  rating_count: number
  my_rating: number | null
}

const mapRow = (r: TemplateRow, workspaceId: string): TemplateCard => ({
  id: r.id,
  name: r.name,
  html: r.html,
  visibility: r.visibility === 'public' ? 'public' : 'private',
  isBuiltin: r.is_builtin,
  mine: r.workspace_id === workspaceId,
  avgRating: r.avg_rating ? Math.round(r.avg_rating * 10) / 10 : 0,
  ratingCount: r.rating_count,
  myRating: r.my_rating,
})

const SELECT = `
  select t.*, r.avg_rating, r.rating_count, mine.stars as my_rating
  from templates t
  left join (select template_id, avg(stars)::float as avg_rating, count(*)::int as rating_count from template_ratings group by template_id) r
    on r.template_id = t.id
  left join template_ratings mine on mine.template_id = t.id and mine.workspace_id = $1
`

export type TemplateGallery = { builtin: TemplateCard[]; community: TemplateCard[]; mine: TemplateCard[] }

export async function listTemplates(workspaceId: string): Promise<TemplateGallery> {
  const d = await rawDb()
  const { rows } = await d.query<TemplateRow>(
    `${SELECT} where t.is_builtin = true or t.visibility = 'public' or t.workspace_id = $1
     order by t.is_builtin desc, avg_rating desc nulls last, t.created_at desc`,
    [workspaceId],
  )
  const cards = rows.map(r => mapRow(r, workspaceId))
  return {
    builtin: cards.filter(c => c.isBuiltin),
    community: cards.filter(c => !c.isBuiltin && !c.mine),
    mine: cards.filter(c => !c.isBuiltin && c.mine),
  }
}

export async function getTemplate(workspaceId: string, templateId: string): Promise<TemplateCard> {
  const d = await rawDb()
  const { rows } = await d.query<TemplateRow>(`${SELECT} where t.id = $2`, [workspaceId, templateId])
  const row = rows[0]
  if (!row || (!row.is_builtin && row.visibility !== 'public' && row.workspace_id !== workspaceId)) {
    throw new UserError('템플릿을 찾을 수 없습니다.')
  }
  return mapRow(row, workspaceId)
}

export async function saveTemplate(workspaceId: string, input: { name: string; html: string; visibility: TemplateVisibility }) {
  const name = input.name.trim().slice(0, 60)
  if (!name) throw new UserError('템플릿 이름을 입력해 주세요.')
  const html = input.html.trim()
  if (!html) throw new UserError('저장할 HTML이 비어 있습니다.')
  const d = await rawDb()
  const id = randomUUID()
  await d.query(`insert into templates (id, workspace_id, name, html, visibility, is_builtin) values ($1, $2, $3, $4, $5, false)`, [
    id,
    workspaceId,
    name,
    sanitizeFormHtml(html),
    input.visibility === 'public' ? 'public' : 'private',
  ])
  return id
}

async function loadOwnTemplate(q: Q, workspaceId: string, templateId: string) {
  const { rows } = await q.query<{ workspace_id: string | null; is_builtin: boolean }>(`select workspace_id, is_builtin from templates where id = $1`, [
    templateId,
  ])
  if (!rows[0] || rows[0].is_builtin || rows[0].workspace_id !== workspaceId) throw new UserError('내가 만든 템플릿만 바꿀 수 있습니다.')
}

export async function setTemplateVisibility(workspaceId: string, templateId: string, visibility: TemplateVisibility) {
  const d = await rawDb()
  await loadOwnTemplate(d, workspaceId, templateId)
  await d.query(`update templates set visibility = $2 where id = $1`, [templateId, visibility === 'public' ? 'public' : 'private'])
}

export async function deleteTemplate(workspaceId: string, templateId: string) {
  const d = await rawDb()
  await loadOwnTemplate(d, workspaceId, templateId)
  await d.query(`delete from templates where id = $1`, [templateId])
}

export async function rateTemplate(workspaceId: string, templateId: string, stars: number) {
  const s = Math.max(1, Math.min(5, Math.round(stars)))
  const d = await rawDb()
  const { rows } = await d.query<{ visibility: string; is_builtin: boolean; workspace_id: string | null }>(
    `select visibility, is_builtin, workspace_id from templates where id = $1`,
    [templateId],
  )
  const t = rows[0]
  if (!t || (!t.is_builtin && t.visibility !== 'public' && t.workspace_id !== workspaceId)) throw new UserError('템플릿을 찾을 수 없습니다.')
  await d.query(
    `insert into template_ratings (template_id, workspace_id, stars) values ($1, $2, $3)
     on conflict (template_id, workspace_id) do update set stars = excluded.stars, created_at = now()`,
    [templateId, workspaceId, s],
  )
}
