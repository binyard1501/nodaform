'use client'

import { useActionState } from 'react'
import { applyAction } from '@/app/actions'

// Renders operator-supplied (already sanitized server-side) markup inside the one <form> that
// posts to applyAction — the markup's own inputs (name="name", name="f_<id>", ...) become part of
// this form's fields. itemId is injected here since custom HTML mode is restricted to the
// 'simple' structure (exactly one item), so there's nothing for the operator's markup to pick.
export function CustomApplyForm({ slug, itemId, html }: { slug: string; itemId: string; html: string }) {
  const [state, formAction, pending] = useActionState(applyAction.bind(null, slug), {})
  return (
    <form action={formAction} className="custom-html-form" aria-busy={pending}>
      <input type="hidden" name="itemId" value={itemId} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
