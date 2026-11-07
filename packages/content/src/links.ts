// A tracked link is the destination's own URL with four UTM parameters added: the platform, `social`,
// the promotable thing and the piece (ADR-0031). Nothing else in the destination's URL changes, and
// the same piece always gets the same link.

/** The platforms a piece can be posted on. */
export const PLATFORMS = ['instagram', 'tiktok', 'linkedin'] as const;
export type Platform = (typeof PLATFORMS)[number];

const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

/** Checks that a destination is an absolute https or http URL, and returns a reason when it is not. */
export function destinationProblem(destination: string): string | undefined {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return 'is not a URL';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'must be an https URL';
  return undefined;
}

export function trackedLink(destination: string, link: { platform: Platform; campaign: string; piece: string }): string {
  const hashAt = destination.indexOf('#');
  const fragment = hashAt === -1 ? '' : destination.slice(hashAt);
  const beforeHash = hashAt === -1 ? destination : destination.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  const base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const kept = queryAt === -1 ? [] : beforeHash.slice(queryAt + 1).split('&')
    .filter((pair) => pair !== '' && !PARAMS.includes(decodeURIComponent(pair.split('=')[0])));
  const added = [
    ['utm_source', link.platform], ['utm_medium', 'social'], ['utm_campaign', link.campaign], ['utm_content', link.piece],
  ].map(([name, value]) => `${name}=${encodeURIComponent(value)}`);
  return `${base}?${[...kept, ...added].join('&')}${fragment}`;
}
