// The beta terms a deployment asks every person to accept (ADR-0047). Their version is read from the
// published page itself, from its line "Version <version>", so publishing new terms is all it takes
// for everyone to be asked again; no variable has to change with them. A version read is used for
// a few minutes before the page is read again. Web-standard fetch only (ADR-0003).

import type { SignInTerms } from './index.ts';

/** How long a version read from the page is used before the page is read again, in milliseconds. */
export const TERMS_REFRESH = 5 * 60 * 1000;

const read = new Map<string, { version: string; at: number }>();

/**
 * The terms to ask for: those published at `url`, or none when no `url` is set. When the page cannot
 * be read, or names no version, the version read last is used; with none read yet it throws, so
 * nobody signs in or works without being asked.
 */
export async function publishedTerms(url: string | undefined, now = Date.now()): Promise<SignInTerms | undefined> {
  const address = url?.trim();
  if (!address) return undefined;
  const last = read.get(address);
  if (last && now - last.at < TERMS_REFRESH) return { url: address, version: last.version };
  try {
    const response = await fetch(address, { headers: { accept: 'text/html' } });
    if (!response.ok) throw new Error(`The beta terms at ${address} answered ${response.status}.`);
    const version = termsVersion(await response.text());
    if (!version) throw new Error(`The beta terms at ${address} name no version.`);
    read.set(address, { version, at: now });
    return { url: address, version };
  } catch (error) {
    if (last) return { url: address, version: last.version };
    throw error;
  }
}

/** The version a terms page names, from its first line "Version <version>", with the page's tags taken out. */
export function termsVersion(html: string): string | undefined {
  return /\bVersion\s+([0-9A-Za-z][\w.-]*)/.exec(html.replace(/<[^>]*>/g, ' '))?.[1];
}
