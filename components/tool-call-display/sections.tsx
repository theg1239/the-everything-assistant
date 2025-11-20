import { Fragment } from 'react'

type SectionProps = {
  title?: string
  children: React.ReactNode
  hidden?: boolean
}

export function Section({ title, children, hidden }: SectionProps) {
  if (hidden) return null
  return (
    <div className="space-y-2">
      {title ? <div className="text-xs font-semibold uppercase text-muted-foreground">{title}</div> : null}
      {children}
    </div>
  )
}

export function KeyValueList({
  items,
  compact,
}: {
  items: { label: string; value: React.ReactNode }[]
  compact?: boolean
}) {
  return (
    <dl className={compact ? 'grid grid-cols-2 gap-1 text-xs' : 'space-y-1 text-sm'}>
      {items.map(item => (
        <Fragment key={item.label}>
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="font-medium">{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

