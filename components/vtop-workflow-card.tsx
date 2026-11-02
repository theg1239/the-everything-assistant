'use client'

import { useMemo, useState } from 'react'
import * as z from 'zod'
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  VTOP_STATUSES,
  formatBytes,
  vtopBundleSchema,
  vtopFileSchema,
  vtopLinkSchema,
  vtopProgressSchema,
  vtopStepSchema,
  type VtopFile,
  type VtopOption,
  type VtopStep,
} from '@/lib/vtop-proxy'

/** queryVTOP tool output, as far as this card needs it (validated, unknown keys ignored). */
const workflowResultSchema = z
  .object({
    command: z.string().nullish(),
    status: z.enum(VTOP_STATUSES).optional(),
    success: z.boolean().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
    step: vtopStepSchema.optional(),
    progress: z.array(vtopProgressSchema).optional(),
    files: z.array(vtopFileSchema).optional(),
    bundle: vtopBundleSchema.optional(),
    links: z.array(vtopLinkSchema).optional(),
  })
  .loose()

type WorkflowResult = z.infer<typeof workflowResultSchema>

/** Prefills the chat input (chat-interface listens for `hubShareToChat`); the user presses send. */
function proposeReply(text: string) {
  window.dispatchEvent(new CustomEvent('hubShareToChat', { detail: { text } }))
}

const STATUS_COPY: Record<string, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  needs_selection: { label: 'Choose an option', tone: 'default' },
  needs_input: { label: 'Needs a value', tone: 'default' },
  needs_confirmation: { label: 'Confirm to continue', tone: 'destructive' },
  completed: { label: 'Done', tone: 'secondary' },
  cancelled: { label: 'Cancelled', tone: 'outline' },
  error: { label: 'Failed', tone: 'destructive' },
}

const commandName = (command: string) =>
  command
    .replace(/-/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace('Da', 'Digital Assignments')

function ProgressTrail({ progress }: { progress: NonNullable<WorkflowResult['progress']> }) {
  if (!progress.length) return null
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Selections so far">
      {progress.map((entry, index) => (
        <li key={`${entry.step}-${index}`} className="flex items-center gap-1">
          {index > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
          <span className="rounded-md bg-muted px-2 py-0.5">
            <span className="font-medium text-foreground">{entry.label}:</span> {entry.choice}
            {entry.auto && (
              <Sparkles className="ml-1 inline h-3 w-3 text-primary" aria-label="picked automatically" />
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

function OptionList({ step, command }: { step: VtopStep; command: string }) {
  const options = step.options ?? []
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const multiple = Boolean(step.multiple)
  const label = step.label.toLowerCase()

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter(option =>
      `${option.id} ${option.label} ${option.description ?? ''}`.toLowerCase().includes(needle)
    )
  }, [options, query])

  const choose = (option: VtopOption) => {
    if (multiple) {
      setPicked(prev => {
        const next = new Set(prev)
        if (next.has(option.id)) next.delete(option.id)
        else next.add(option.id)
        return next
      })
      return
    }
    proposeReply(`For ${commandName(command)}, choose ${step.label.toLowerCase()} option ${option.id}: ${option.label}`)
  }

  const submitMany = (all: boolean) => {
    const chosen = options.filter(option => picked.has(option.id))
    if (all) {
      proposeReply(`For ${commandName(command)}, select all ${label}.`)
      return
    }
    if (!chosen.length) return
    proposeReply(
      `For ${commandName(command)}, select ${label} options ${chosen.map(o => o.id).join(',')}: ${chosen
        .map(o => o.label)
        .join('; ')}`
    )
  }

  return (
    <div className="space-y-2">
      {options.length > 8 && (
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={`Filter ${options.length} options…`}
          className="h-8 text-sm"
          aria-label={`Filter ${label} options`}
        />
      )}
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1" role="list">
        {visible.map(option => {
          const selected = picked.has(option.id)
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => choose(option)}
                aria-pressed={multiple ? selected : undefined}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected && 'border-primary bg-primary/5'
                )}
              >
                <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-xs font-medium tabular-nums">
                  {multiple && selected ? <Check className="h-3 w-3" aria-hidden /> : option.id}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground break-words">{option.label}</span>
                  {option.description && (
                    <span className="block text-xs text-muted-foreground break-words">{option.description}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
        {!visible.length && <li className="px-1 text-xs text-muted-foreground">No options match “{query}”.</li>}
      </ul>
      {multiple && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" disabled={!picked.size} onClick={() => submitMany(false)}>
            <Download className="mr-1 h-3.5 w-3.5" aria-hidden />
            Download selected{picked.size ? ` (${picked.size})` : ''}
          </Button>
          {step.allowAll && (
            <Button size="sm" variant="outline" onClick={() => submitMany(true)}>
              Download all
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function ValueInput({ step, command }: { step: VtopStep; command: string }) {
  const [value, setValue] = useState('')
  const type = step.inputType === 'date' ? 'date' : step.inputType === 'time' ? 'time' : 'text'
  return (
    <form
      className="flex gap-2"
      onSubmit={event => {
        event.preventDefault()
        if (value.trim()) proposeReply(`For ${commandName(command)}, ${step.label.toLowerCase()} is ${value.trim()}`)
      }}
    >
      <Input
        type={type}
        value={value}
        onChange={event => setValue(event.target.value)}
        className="h-8 text-sm"
        aria-label={step.label}
      />
      <Button size="sm" type="submit" disabled={!value.trim()}>
        Use
      </Button>
    </form>
  )
}

function Confirmation({ step, command }: { step: VtopStep; command: string }) {
  const summary = Object.entries(step.summary ?? {})
  return (
    <div className="space-y-3">
      {summary.length > 0 && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
          {summary.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt>
              <dd className="font-medium break-words">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => proposeReply(`Yes, I confirm: submit the ${commandName(command)} request.`)}>
          Confirm
        </Button>
        <Button size="sm" variant="outline" onClick={() => proposeReply(`Cancel the ${commandName(command)} request.`)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function VTOPFilesList({ files, bundle }: { files: VtopFile[]; bundle?: WorkflowResult['bundle'] }) {
  if (!files.length) return null
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border" role="list">
        {files.map(file => (
          <li key={file.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium" title={file.path || file.name}>
                {file.name}
              </span>
              <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
            </span>
            {file.contentType === 'application/pdf' && (
              <a
                href={`${file.url}&inline=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Open
              </a>
            )}
            <a
              href={file.url}
              download={file.name}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download
            </a>
          </li>
        ))}
      </ul>
      {bundle && files.length > 1 && (
        <Button asChild size="sm" variant="outline">
          <a href={bundle.url} download={bundle.name} rel="noopener noreferrer">
            <Download className="mr-1 h-3.5 w-3.5" aria-hidden />
            Download all ({bundle.count} files, {formatBytes(bundle.size)})
          </a>
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Links expire after about an hour.</p>
    </div>
  )
}

/** Renders a queryVTOP multi-step result: pending step (options/input/confirm), progress, files. */
export function VTOPWorkflowCard({ data }: { data: unknown }) {
  const parsed = workflowResultSchema.safeParse(data)
  if (!parsed.success) return null
  const result = parsed.data
  const command = result.command || 'vtop'
  const status = result.status ?? (result.success === false ? 'error' : 'completed')
  const copy = STATUS_COPY[status] ?? STATUS_COPY.completed
  const step = result.step
  const pending = status === 'needs_selection' || status === 'needs_input' || status === 'needs_confirmation'

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{commandName(command)}</h3>
        {copy && <Badge variant={copy.tone}>{copy.label}</Badge>}
      </div>

      {result.progress && <ProgressTrail progress={result.progress} />}

      {pending && step && (
        <div className="space-y-2">
          {step.prompt && <p className="text-sm whitespace-pre-line">{step.prompt}</p>}
          {step.unmatchedHint && (
            <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Couldn’t match “{step.unmatchedHint}” on VTOP; closest options are listed first.
            </p>
          )}
          {step.kind === 'confirm' ? (
            <Confirmation step={step} command={command} />
          ) : step.options?.length ? (
            <OptionList step={step} command={command} />
          ) : (
            <ValueInput step={step} command={command} />
          )}
          <p className="text-xs text-muted-foreground">Picking an option fills the message box; press send to continue.</p>
        </div>
      )}

      {status === 'completed' && result.message && (
        <p className="flex items-center gap-1.5 text-sm">
          <CheckCircle className="h-4 w-4 text-green-600" aria-hidden />
          {result.message}
        </p>
      )}
      {status === 'error' && (result.error || result.message) && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {result.error || result.message}
        </p>
      )}

      <VTOPFilesList files={result.files ?? []} bundle={result.bundle} />

      {result.links && result.links.length > 0 && (
        <ul className="space-y-1 text-sm" role="list">
          {result.links.map(link => (
            <li key={link.url} className="flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                {link.label}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
