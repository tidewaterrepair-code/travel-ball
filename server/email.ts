// Email delivery. Uses Resend (https://resend.com) when RESEND_API_KEY is set;
// otherwise logs the email so you can still copy login links from the server logs.

export interface Email { to: string; subject: string; text: string; html?: string }

export const emailConfigured = () => !!process.env.RESEND_API_KEY

export async function sendEmail(m: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? 'Dugout HQ <onboarding@resend.dev>'
  if (!key) {
    console.log(`[email:not-sent] to=${m.to} subject="${m.subject}"\n${m.text}\n`)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) console.error(`[email] Resend ${res.status}: ${await res.text().catch(() => '')}`)
    return res.ok
  } catch (e) {
    console.error('[email] send failed', e)
    return false
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function loginEmail(link: string, clubName: string | null, invitedBy?: string): Email & { to: '' } {
  const intro = invitedBy
    ? `${invitedBy} invited you to ${clubName ?? 'Dugout HQ'} on Dugout HQ.`
    : `Here's your sign-in link for ${clubName ?? 'Dugout HQ'}.`
  return {
    to: '',
    subject: invitedBy ? `You're invited to ${clubName ?? 'Dugout HQ'} ⚾` : 'Your Dugout HQ sign-in link ⚾',
    text: `${intro}\n\nSign in: ${link}\n\nThis link works once. If you didn't ask for it, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
      <p style="font-size:16px">${esc(intro)}</p>
      <p><a href="${esc(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none">Sign in to Dugout HQ ⚾</a></p>
      <p style="color:#64748b;font-size:13px">This link works once. If you didn't ask for it, you can ignore this email.</p></div>`,
  }
}
