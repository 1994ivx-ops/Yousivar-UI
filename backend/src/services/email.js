/**
 * Transactional email over the Resend HTTP API (fetch only — Worker friendly).
 *
 * Email is optional at boot and mandatory at use: if RESEND_API_KEY is absent the
 * caller receives `{ sent: false, reason: 'not_configured' }` and MUST surface
 * that to the administrator instead of pretending a reset link went out.
 */
export function mailerFor(config) {
  const apiKey = config.resendApiKey;
  const from = config.mailFrom;

  async function send({ to, subject, html, text }) {
    if (!apiKey) return { sent: false, reason: 'not_configured' };
    let res;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return { sent: false, reason: 'network' };
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { sent: false, reason: `resend_${res.status}`, detail: String(detail).slice(0, 200) };
    }
    return { sent: true };
  }

  return {
    configured: Boolean(apiKey),
    sendPasswordReset: ({ to, link }) => send({
      to,
      subject: 'Reset your YOUSIVAR password',
      text: `Open this link within 30 minutes to choose a new password: ${link}`,
      html: `<p>Open this link within 30 minutes to choose a new password:</p><p><a href="${link}">${link}</a></p>`,
    }),
    sendEmailVerification: ({ to, link }) => send({
      to,
      subject: 'Confirm your YOUSIVAR email',
      text: `Confirm your email address: ${link}`,
      html: `<p>Confirm your email address:</p><p><a href="${link}">${link}</a></p>`,
    }),
  };
}