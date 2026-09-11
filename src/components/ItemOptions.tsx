export type ItemOption = { id: string; label: string; remaining: number | null; group: string }

// <option> list for picking an item, grouped by date once a form spans more than one day.
export function ItemOptions({ items }: { items: ItemOption[] }) {
  const groups = [...new Set(items.map(i => i.group))]
  const option = (i: ItemOption) => (
    <option key={i.id} value={i.id}>
      {i.label}
      {i.remaining !== null ? ` · ${i.remaining}석 남음` : ''}
    </option>
  )
  if (groups.length < 2) return <>{items.map(option)}</>
  return (
    <>
      {groups.map(g => (
        <optgroup key={g} label={g || '날짜 없음'}>
          {items.filter(i => i.group === g).map(option)}
        </optgroup>
      ))}
    </>
  )
}
