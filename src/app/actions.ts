'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import * as auth from '@/lib/auth'
import * as engine from '@/lib/engine'
import { countFileInputs, mergeScannedFields, scanCustomHtmlFields } from '@/lib/htmlScan'
import { sanitizeFormHtml } from '@/lib/sanitizeHtml'
import * as templates from '@/lib/templates'
import type { FieldDef, FormKind, Method } from '@/lib/types'

export type ActionResult = { error?: string; message?: string }

function fail(e: unknown): ActionResult {
  if (e instanceof engine.UserError || e instanceof auth.AuthError) return { error: e.message }
  console.error(e)
  return { error: '처리 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.' }
}

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn()
    refresh()
    return {}
  } catch (e) {
    return fail(e)
  }
}

/* ---------- auth ---------- */

export async function signUpAction(_prev: ActionResult, data: FormData): Promise<ActionResult> {
  try {
    await auth.signUp(String(data.get('email') ?? ''), String(data.get('password') ?? ''), String(data.get('workspace') ?? ''))
  } catch (e) {
    return fail(e)
  }
  redirect('/admin')
}

export async function loginAction(_prev: ActionResult, data: FormData): Promise<ActionResult> {
  try {
    await auth.login(String(data.get('email') ?? ''), String(data.get('password') ?? ''))
  } catch (e) {
    return fail(e)
  }
  redirect('/admin')
}

export async function logoutAction() {
  await auth.logout()
  redirect('/login')
}

/* ---------- operator actions (workspace-scoped) ---------- */

export async function createDraftAction(kind: FormKind = 'application') {
  const workspaceId = await auth.requireWorkspaceId()
  const id = await engine.createDraft(workspaceId, kind)
  redirect(`/admin/forms/${id}/wizard`)
}

export async function duplicateFormAction(formId: string) {
  const workspaceId = await auth.requireWorkspaceId()
  const id = await engine.duplicateForm(workspaceId, formId)
  redirect(`/admin/forms/${id}/wizard`)
}

export async function saveWizardAction(formId: string, payload: engine.WizardPayload): Promise<ActionResult> {
  try {
    const workspaceId = await auth.requireWorkspaceId()
    await engine.saveForm(workspaceId, formId, payload)
    return {}
  } catch (e) {
    return fail(e)
  }
}

export type ScanResult = ActionResult & { fields?: FieldDef[]; added?: number; removed?: number; droppedFileInputs?: number }

const FILE_INPUT_NOTE = '파일 업로드 항목(type="file")은 아직 지원하지 않아 제외했습니다.'

// Pure text transform (sanitize + parse) — no DB access, so this only needs to confirm the
// caller is a signed-in operator, not which workspace they're in.
export async function scanCustomHtmlAction(html: string, existingFields: FieldDef[]): Promise<ScanResult> {
  try {
    await auth.requireWorkspaceId()
    // Counted before sanitizing, which is what removes them.
    const droppedFileInputs = countFileInputs(html)
    const clean = sanitizeFormHtml(html)
    const scanned = scanCustomHtmlFields(clean)
    if (scanned.length === 0) {
      return {
        error: droppedFileInputs
          ? `${FILE_INPUT_NOTE} 나머지 입력 항목도 찾지 못했습니다 — name="f_항목id" 형식인지 확인해 주세요.`
          : 'f_ 로 시작하는 입력 항목을 찾지 못했습니다. name="f_항목id" 형식인지 확인해 주세요.',
      }
    }
    const { fields, added, removed } = mergeScannedFields(existingFields, scanned)
    return { fields, added, removed, droppedFileInputs }
  } catch (e) {
    return fail(e)
  }
}

/* ---------- template gallery ---------- */

export type GalleryResult = ActionResult & { gallery?: templates.TemplateGallery }

export async function listTemplatesAction(): Promise<GalleryResult> {
  try {
    const workspaceId = await auth.requireWorkspaceId()
    return { gallery: await templates.listTemplates(workspaceId) }
  } catch (e) {
    return fail(e)
  }
}

export type UseTemplateResult = ActionResult & { html?: string }

export async function pickTemplateAction(templateId: string): Promise<UseTemplateResult> {
  try {
    const workspaceId = await auth.requireWorkspaceId()
    const t = await templates.getTemplate(workspaceId, templateId)
    return { html: t.html }
  } catch (e) {
    return fail(e)
  }
}

export async function saveTemplateAction(name: string, html: string, visibility: templates.TemplateVisibility): Promise<ActionResult> {
  return run(async () => templates.saveTemplate(await auth.requireWorkspaceId(), { name, html, visibility }))
}

export async function setTemplateVisibilityAction(templateId: string, visibility: templates.TemplateVisibility) {
  return run(async () => templates.setTemplateVisibility(await auth.requireWorkspaceId(), templateId, visibility))
}

export async function deleteTemplateAction(templateId: string) {
  return run(async () => templates.deleteTemplate(await auth.requireWorkspaceId(), templateId))
}

export async function rateTemplateAction(templateId: string, stars: number) {
  return run(async () => templates.rateTemplate(await auth.requireWorkspaceId(), templateId, stars))
}

export async function publishAction(formId: string): Promise<ActionResult> {
  let workspaceId: string
  try {
    workspaceId = await auth.requireWorkspaceId()
    await engine.publishForm(workspaceId, formId)
  } catch (e) {
    return fail(e)
  }
  redirect(`/admin/forms/${formId}`)
}

export async function setFormStatusAction(formId: string, status: 'published' | 'closed') {
  return run(async () => engine.setFormStatus(await auth.requireWorkspaceId(), formId, status))
}

export async function operatorCancelAction(appId: string) {
  return run(async () => engine.operatorCancel(await auth.requireWorkspaceId(), appId))
}

export async function confirmDepositAction(appId: string) {
  return run(async () => engine.confirmDeposit(await auth.requireWorkspaceId(), appId))
}

export async function bulkConfirmAction(data: FormData) {
  const workspaceId = await auth.requireWorkspaceId()
  await engine.confirmDeposits(workspaceId, data.getAll('ids').map(String))
  refresh()
}

export async function checkInAction(appId: string, checked: boolean) {
  return run(async () => engine.setCheckIn(await auth.requireWorkspaceId(), appId, checked))
}

export async function resendCheckinLinkAction(appId: string) {
  return run(async () => engine.resendCheckinLink(await auth.requireWorkspaceId(), appId))
}

export async function manualRegisterAction(formId: string, _prev: ActionResult, data: FormData): Promise<ActionResult> {
  try {
    const workspaceId = await auth.requireWorkspaceId()
    await engine.manualRegister(workspaceId, {
      formId,
      itemId: String(data.get('itemId') ?? ''),
      name: String(data.get('name') ?? ''),
      phone: String(data.get('phone') ?? ''),
      party: Number(data.get('party') ?? 1),
      status: data.get('status') === 'pending_deposit' ? 'pending_deposit' : 'confirmed',
      method: String(data.get('method') ?? 'deposit') as Method,
      memo: String(data.get('memo') ?? ''),
      allowOver: data.get('allowOver') === 'on',
    })
    refresh()
    return { message: `${String(data.get('name') ?? '').trim()}님을 등록했습니다.` }
  } catch (e) {
    return fail(e)
  }
}

export async function shiftClockAction(ms: number | null) {
  return run(async () => engine.shiftClock(await auth.requireWorkspaceId(), ms))
}

/* ---------- public applicant actions ---------- */

export async function applyAction(slug: string, _prev: ActionResult, data: FormData): Promise<ActionResult> {
  const answers: Record<string, unknown> = {}
  for (const key of new Set(data.keys())) {
    if (!key.startsWith('f_')) continue
    const values = data.getAll(key).map(String)
    answers[key.slice(2)] = values.length > 1 ? values : values[0]
  }
  let id: string
  try {
    id = await engine.applyToForm({
      formSlug: slug,
      itemId: String(data.get('itemId') ?? ''),
      name: String(data.get('name') ?? ''),
      phone: String(data.get('phone') ?? ''),
      party: Number(data.get('party') ?? 1),
      method: String(data.get('method') ?? 'free') as Method,
      answers,
      companions: data.getAll('companion').map(String),
      marketing: data.get('marketing') === 'on',
    })
  } catch (e) {
    return fail(e)
  }
  redirect(`/f/${slug}/a/${id}`)
}

export type LookupResult = ActionResult & { results?: Awaited<ReturnType<typeof engine.lookupApplications>> }

export async function lookupAction(slug: string, _prev: LookupResult, data: FormData): Promise<LookupResult> {
  try {
    return { results: await engine.lookupApplications(slug, String(data.get('name') ?? ''), String(data.get('phone') ?? '')) }
  } catch (e) {
    return fail(e)
  }
}

export async function claimAction(appId: string) {
  return run(() => engine.claimOffer(appId))
}

export async function changeItemAction(appId: string, itemId: string) {
  return run(() => engine.changeItem(appId, itemId))
}

export async function applicantCancelAction(appId: string) {
  return run(() => engine.applicantCancel(appId))
}
