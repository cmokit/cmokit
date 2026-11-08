// SendGrid as the sender of sign-in codes (ADR-0015, ADR-0018), with a sending key of the issuer's
// own. A code is transactional mail: it is sent in no unsubscribe group, so unsubscribing from a
// lead's sequence never stops a sign-in. The key is a Worker secret and is never logged.

import type { CodeMail } from './index.ts';

export interface SendGridCodeOptions {
  /** An API key with Mail Send access. */
  key: string;
  /** The address codes are sent from, verified with SendGrid. */
  from: string;
  fetch?: typeof fetch;
}

export function sendgridCodes(options: SendGridCodeOptions): CodeMail {
  const send = options.fetch ?? fetch;
  return {
    async sendCode(to, code) {
      const text = `Your CMOkit sign-in code is ${code}.\n\nIt works for ten minutes. If you didn't ask for it, you can ignore this email.`;
      const response = await send('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { authorization: `Bearer ${options.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: options.from, name: 'CMOkit' },
          subject: `${code} is your CMOkit sign-in code`,
          content: [{ type: 'text/plain', value: text }],
          tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
        }),
      });
      if (!response.ok) throw new Error(`SendGrid mail send answered ${response.status}`);
    },
  };
}
