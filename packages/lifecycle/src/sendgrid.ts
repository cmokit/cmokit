// SendGrid behind the messaging interface (ADR-0015). Sends through the Mail Send API with a key
// restricted to sending and to suppressions, a Worker secret that is never logged, and reads its
// event webhook only after verifying the request's ECDSA signature.

import type { Messaging, Report } from './index.ts';

export interface SendGridOptions {
  /** An API key with Mail Send and Suppressions access. */
  key: string;
  /** The event webhook's verification key (Settings → Mail Settings → Signed Event Webhook), base64. */
  webhookKey?: string;
  fetch?: typeof fetch;
}

const API = 'https://api.sendgrid.com/v3';
const SIGNATURE = 'x-twilio-email-event-webhook-signature';
const TIMESTAMP = 'x-twilio-email-event-webhook-timestamp';

const KINDS: Record<string, Report['kind']> = {
  delivered: 'delivered', open: 'opened', click: 'clicked', bounce: 'bounced', dropped: 'dropped',
  spamreport: 'spam_reported', unsubscribe: 'unsubscribed', group_unsubscribe: 'unsubscribed',
};

interface SendGridEvent {
  event?: string;
  type?: string;
  sg_event_id?: string;
  timestamp?: number;
  url?: string;
  [tag: string]: unknown;
}

export function sendgrid(options: SendGridOptions): Messaging {
  const send = options.fetch ?? fetch;

  async function call(method: string, path: string, body: unknown): Promise<void> {
    const response = await send(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${options.key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`SendGrid ${method} ${path} answered ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
  }

  return {
    async send(m) {
      await call('POST', '/mail/send', {
        personalizations: [{ to: [{ email: m.to }] }],
        from: { email: m.from, ...(m.fromName ? { name: m.fromName } : {}) },
        subject: m.subject,
        content: [{ type: 'text/plain', value: m.text }, { type: 'text/html', value: m.html }],
        asm: { group_id: m.group, groups_to_display: [m.group] },
        // The unsubscribe link CMOkit serves, which a mail client may follow in one click (RFC 8058).
        headers: { 'List-Unsubscribe': `<${m.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        custom_args: m.tags,
        categories: [m.tags.cmokit_sequence].filter(Boolean),
      });
    },

    async suppress(email, group) {
      await call('POST', `/asm/groups/${group}/suppressions`, { recipient_emails: [email] });
    },

    async reports(request) {
      const signature = request.headers.get(SIGNATURE);
      const timestamp = request.headers.get(TIMESTAMP);
      const body = await request.text();
      if (!options.webhookKey || !signature || !timestamp) return undefined;
      if (!(await verify(options.webhookKey, signature, timestamp + body))) return undefined;
      let events: SendGridEvent[];
      try {
        events = JSON.parse(body);
      } catch {
        return undefined;
      }
      if (!Array.isArray(events)) return undefined;
      return events.map((e) => {
        // A block is a receiving server refusing for now, not an address that does not exist.
        const kind = e.event === 'bounce' && e.type === 'blocked' ? 'other' : KINDS[e.event ?? ''] ?? 'other';
        const tags = Object.fromEntries(Object.entries(e).filter(([k, v]) => k.startsWith('cmokit_') && typeof v === 'string')) as Record<string, string>;
        return {
          id: e.sg_event_id ?? `${e.event}:${e.timestamp}:${tags.cmokit_lead}`,
          kind,
          at: (e.timestamp ?? 0) * 1000,
          tags,
          ...(e.url ? { url: e.url } : {}),
        };
      });
    },
  };
}

/** Verifies SendGrid's signature: ECDSA P-256 over SHA-256, DER-encoded, of timestamp and body. */
export async function verify(publicKey: string, signature: string, signed: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'spki', base64(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(base64(signature)), new TextEncoder().encode(signed),
    );
  } catch {
    return false;
  }
}

function base64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Web Crypto takes an ECDSA signature as r and s side by side, 32 bytes each; SendGrid sends the
// ASN.1 DER sequence of the two integers.
function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error('not a DER signature');
  let at = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
  const raw = new Uint8Array(64);
  for (const offset of [0, 32]) {
    if (der[at] !== 0x02) throw new Error('not a DER integer');
    const length = der[at + 1];
    let value = der.subarray(at + 2, at + 2 + length);
    while (value.length > 32 && value[0] === 0) value = value.subarray(1);
    if (value.length > 32) throw new Error('integer too long');
    raw.set(value, offset + 32 - value.length);
    at += 2 + length;
  }
  return raw;
}
