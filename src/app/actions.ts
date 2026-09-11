'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import * as engine from '@/lib/engine'
import type { Method } from '@/lib/types'

export type ActionResult = { error?: string; message?: string }

function fail(e: unknown): ActionResult {
  if (e instanceof engine.UserError) return { error: e.message }
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

// Prototype has no login: every operator action acts on the single demo workspace.

export async function createDraftAction() {
  const id = await engine.createDraft()
  redirect(`/admin/forms/${id}/wizard`)
}

export async function duplicateFormAction(formId: string) {
  const id = await engine.duplicateForm(formId)
  redirect(`/admin/forms/${id}/wizard`)
}

export async function saveWizardAction(formId: string, payload: engine.WizardPayload): Promise<ActionResult> {
  try {
    await engine.saveForm(formId, payload)
    return {}
  } catch (e) {
    return fail(e)
  }
}

export async function publishAction(formId: string): Promise<ActionResult> {
  try {
    await engine.publishForm(formId)
  } catch (e) {
    return fail(e)
  }
  redirect(`/admin/forms/${formId}`)
}

export async function setFormStatusAction(formId: string, status: 'published' | 'closed') {
  return run(() => engine.setFormStatus(formId, status))
}

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

export async function operatorCancelAction(appId: string) {
  return run(() => engine.operatorCancel(appId))
}

export async function confirmDepositAction(appId: string) {
  return run(() => engine.confirmDeposit(appId))
}

export async function bulkConfirmAction(data: FormData) {
  await engine.confirmDeposits(data.getAll('ids').map(String))
  refresh()
}

export async function checkInAction(appId: string, checked: boolean) {
  return run(() => engine.setCheckIn(appId, checked))
}

export async function resendCheckinLinkAction(appId: string) {
  return run(() => engine.resendCheckinLink(appId))
}

export async function manualRegisterAction(formId: string, _prev: ActionResult, data: FormData): Promise<ActionResult> {
  try {
    await engine.manualRegister({
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
  return run(() => engine.shiftClock(ms))
}
