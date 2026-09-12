import type { Application, FieldDef } from './types'

export type OptionCount = { label: string; count: number; percent: number }
export type FieldSummary =
  // Choice-shaped answers (select / multi / consent) can be counted per option.
  | { field: FieldDef; kind: 'counted'; answered: number; options: OptionCount[] }
  // Free text can't be aggregated, so a sample of the most recent answers is shown instead.
  | { field: FieldDef; kind: 'text'; answered: number; samples: string[] }

const TEXT_SAMPLE_LIMIT = 20

// Percentages are of the people who answered this field, not of all responses — an optional
// question skipped by half the respondents would otherwise read as if every option lost support.
function toOptions(counts: Map<string, number>, answered: number): OptionCount[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percent: answered ? Math.round((count / answered) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count)
}

export function summarizeAnswers(fields: FieldDef[], applications: Application[]): FieldSummary[] {
  return fields.map(field => {
    if (field.type === 'text' || field.type === 'textarea' || field.type === 'email') {
      const samples: string[] = []
      let answered = 0
      for (const a of applications) {
        const v = a.answers[field.id]
        if (typeof v !== 'string' || !v.trim()) continue
        answered++
        if (samples.length < TEXT_SAMPLE_LIMIT) samples.push(v.trim())
      }
      return { field, kind: 'text', answered, samples }
    }

    const counts = new Map<string, number>()
    // Seed declared options at zero so an option nobody picked still shows up as 0%.
    if (field.type !== 'consent') for (const o of field.options) counts.set(o, 0)
    let answered = 0

    for (const a of applications) {
      const v = a.answers[field.id]
      if (field.type === 'consent') {
        if (v !== true) continue
        answered++
        counts.set('동의', (counts.get('동의') ?? 0) + 1)
      } else if (Array.isArray(v)) {
        if (v.length === 0) continue
        answered++
        for (const one of v) counts.set(one, (counts.get(one) ?? 0) + 1)
      } else if (typeof v === 'string' && v) {
        answered++
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
    }
    return { field, kind: 'counted', answered, options: toOptions(counts, answered) }
  })
}
