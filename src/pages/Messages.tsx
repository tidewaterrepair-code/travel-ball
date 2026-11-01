import { useMemo, useRef, useState } from 'react'
import { useClub, useData } from '../lib/store'
import type { Audience, Message } from '../lib/types'
import { audienceOptions, audienceRecipients, sendMessage } from '../lib/ops'
import { MERGE_FIELDS, cx, mergeTemplate, timeAgo } from '../lib/utils'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea } from '../components/ui'
import { toast } from '../components/feedback'

export default function Messages() {
  const data = useData()
  const apply = useClub((s) => s.apply)
  const { templates, messages } = data
  const [audience, setAudience] = useState<Audience>('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [tab, setTab] = useState<'sent' | 'auto'>('sent')
  const [viewing, setViewing] = useState<Message | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const options = audienceOptions(data)
  const recipients = useMemo(() => audienceRecipients(data, audience), [data, audience])
  const sample = recipients[0]
  const label = options.find((o) => o.id === audience)?.label ?? ''

  const useTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setSubject(t.subject)
    setBody(t.body)
  }

  const insertField = (key: string) => {
    const el = bodyRef.current
    const token = `{{${key}}}`
    if (!el) return setBody((b) => b + token)
    const s = el.selectionStart
    const next = body.slice(0, s) + token + body.slice(el.selectionEnd)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + token.length, s + token.length)
    })
  }

  const send = () => {
    apply((d) => sendMessage(d, { audience, audienceLabel: label, subject, body }).data)
    toast('📣', `Sent to ${recipients.length} ${recipients.length === 1 ? 'family' : 'families'}!`, 'Each message is personalized with their own details.')
    setSubject('')
    setBody('')
  }

  const openInMailApp = () => {
    const generic = (s: string) => mergeTemplate(s, { orgName: data.settings.name, parentName: '' })
    const href = `mailto:?bcc=${encodeURIComponent(recipients.map((r) => r.email).join(','))}&subject=${encodeURIComponent(generic(subject))}&body=${encodeURIComponent(generic(body))}`
    window.location.href = href
  }

  const shown = messages.filter((m) => (tab === 'auto' ? m.automated : !m.automated))
  return (
    <div>
      <PageHeader emoji="📣" title="Messages" subtitle="Email families in seconds. Every message is personalized automatically — names, teams, balances and all." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader icon="✍️" title="New message" />
          <div className="space-y-4 px-5 pb-5">
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Start from a template</span>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button key={t.id} onClick={() => useTemplate(t.id)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-brand hover:text-white">{t.emoji} {t.name}</button>
                ))}
              </div>
            </div>
            <Field label="To" hint={`${recipients.length} ${recipients.length === 1 ? 'family' : 'families'} will receive this`}>
              <Select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Big news from the dugout! ⚾" /></Field>
            <div>
              <Field label="Message"><Textarea ref={bodyRef} rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{parentFirst}}, …" /></Field>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-slate-500">Personalize:</span>
                {MERGE_FIELDS.map((f) => (
                  <button key={f.key} onClick={() => insertField(f.key)} className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand/20">+ {f.label}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" disabled={!recipients.length} onClick={() => { navigator.clipboard?.writeText(recipients.map((r) => r.email).join(', ')); toast('📋', 'Email list copied', `${recipients.length} addresses`) }}>📋 Copy emails</Button>
              <Button variant="secondary" disabled={!subject || !recipients.length} onClick={openInMailApp}>Open in my email app</Button>
              <Button disabled={!subject || !body || !recipients.length} onClick={send}>Send to {recipients.length} 🚀</Button>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col lg:col-span-2">
          <CardHeader icon="👀" title="Preview" subtitle={sample ? `As ${sample.name} will see it` : 'No recipients'} />
          <div className="mx-5 mb-5 flex-1 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            {subject || body ? (
              <>
                <div className="text-xs text-slate-500">To: {sample?.email ?? '—'}</div>
                <div className="mt-1 border-b border-slate-200 pb-2 font-bold">{mergeTemplate(subject, sample?.ctx ?? {})}</div>
                <div className="mt-3 text-sm whitespace-pre-wrap text-slate-700">{mergeTemplate(body, sample?.ctx ?? {})}</div>
              </>
            ) : (
              <EmptyState emoji="✉️" title="Your message preview">Pick a template or start typing.</EmptyState>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader icon="📬" title="Sent messages" action={<Tabs value={tab} onChange={setTab} options={[{ id: 'sent', label: 'By staff' }, { id: 'auto', label: '⚡ Automated' }]} />} />
        {shown.length === 0 ? <EmptyState emoji="📭" title="Nothing sent yet" /> : (
          <ul className="divide-y divide-slate-100">
            {shown.slice(0, 40).map((m) => (
              <li key={m.id}>
                <button onClick={() => setViewing(m)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                  <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg', m.automated ? 'bg-amber-100' : 'bg-brand/10')}>{m.automated ? '⚡' : '📣'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{m.subject}</div>
                    <div className="truncate text-xs text-slate-500">{m.audienceLabel}</div>
                  </div>
                  <Badge>{m.recipients.length} {m.recipients.length === 1 ? 'family' : 'families'}</Badge>
                  <span className="hidden w-16 text-right text-xs text-slate-400 sm:block">{timeAgo(m.sentAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.subject}>
          <div className="text-xs text-slate-500">{viewing.audienceLabel} · {new Date(viewing.sentAt).toLocaleString()}</div>
          <div className="mt-3 text-sm whitespace-pre-wrap text-slate-700">{viewing.body}</div>
          <div className="mt-4 text-xs text-slate-400">Recipients: {viewing.recipients.join(', ')}</div>
        </Modal>
      )}
    </div>
  )
}
