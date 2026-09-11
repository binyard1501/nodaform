import { parse, type HTMLElement } from 'node-html-parser'
import type { FieldDef, FieldType } from './types'

// These names are wired directly into applyToForm (name, phone, party, itemId, method, marketing,
// companion) — a custom form uses them as-is instead of the f_<id> convention, so they're never
// turned into custom Questions fields.
const RESERVED = new Set(['name', 'phone', 'party', 'itemId', 'method', 'marketing', 'companion'])

function humanize(id: string) {
  const s = id.replace(/[_-]+/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id
}

type Group = { tag: string; type: string; els: HTMLElement[] }

// Scans a static HTML fragment for f_<id>-named inputs/selects/textareas and turns each into a
// FieldDef, inferring type from the tag/input-type and grouping same-name checkboxes into a
// multi-select. JS-rendered fields (added after the page loads) can't be seen — this only reads
// markup, matching the "static HTML only" limitation documented for custom HTML mode v1.
export function scanCustomHtmlFields(html: string): FieldDef[] {
  const root = parse(html)
  const groups = new Map<string, Group>()

  for (const el of root.querySelectorAll('input, select, textarea')) {
    const name = el.getAttribute('name')
    if (!name || !name.startsWith('f_') || RESERVED.has(name)) continue
    const id = name.slice(2)
    if (!id) continue
    const tag = el.tagName.toLowerCase()
    const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag
    const g = groups.get(id) ?? { tag, type, els: [] }
    g.els.push(el)
    groups.set(id, g)
  }

  const labelFor = (id: string) => root.querySelector(`label[for="${id}"]`)?.text.trim() || ''

  const fields: FieldDef[] = []
  for (const [id, g] of groups) {
    const first = g.els[0]
    const required = g.els.some(el => el.hasAttribute('required'))
    const htmlId = first.getAttribute('id')
    const label = (htmlId && labelFor(htmlId)) || humanize(id)

    let type: FieldType = 'text'
    let options: string[] = []
    if (g.tag === 'textarea') {
      type = 'textarea'
    } else if (g.tag === 'select') {
      type = first.hasAttribute('multiple') ? 'multi' : 'select'
      options = first
        .querySelectorAll('option')
        .map(o => o.getAttribute('value') || o.text.trim())
        .filter(Boolean)
    } else if (g.type === 'checkbox') {
      if (g.els.length > 1) {
        type = 'multi'
        options = g.els.map(el => el.getAttribute('value')).filter((v): v is string => !!v)
      } else {
        type = 'consent'
      }
    } else if (g.type === 'email') {
      type = 'email'
    }

    fields.push({ id, type, label, required, options, help: '' })
  }
  return fields
}

// Merges freshly scanned fields into the operator's existing field list: a field already present
// (by id) keeps its current label/required/options (the operator may have already edited them in
// the wizard), a newly scanned field is appended, and a field no longer in the scan is dropped —
// its historical answers stay in old applications but stop appearing in new submissions.
export function mergeScannedFields(existing: FieldDef[], scanned: FieldDef[]): { fields: FieldDef[]; added: number; removed: number } {
  const existingById = new Map(existing.map(f => [f.id, f]))
  const scannedIds = new Set(scanned.map(f => f.id))
  const fields = scanned.map(f => existingById.get(f.id) ?? f)
  const added = scanned.filter(f => !existingById.has(f.id)).length
  const removed = existing.filter(f => !scannedIds.has(f.id)).length
  return { fields, added, removed }
}
