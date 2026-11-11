// Instagram, through the Instagram API with Unified Login (ADR-0045), which is built on Facebook Login
// for Business. Only a brand connects: its user logs in, picks the business portfolio that owns the
// brand's Instagram account, and CMOkit gets a token for that portfolio that does not expire. A person
// on the brand's waitlist never logs in: they comment their referral code on one of the brand's Reels,
// which proves the handle is theirs. It uses fetch alone.

/** The most recent Reels whose comments are read, which keeps a count within a Worker's subrequests. */
export const REELS_COUNTED = 25;
/** The Graph API version CMOkit calls, as in Meta's Unified Login guide. */
export const GRAPH_VERSION = 'v27.0';

const LOGIN = 'https://www.facebook.com/dialog/oauth';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** One comment on one of the brand's Reels: who wrote it and what it says. */
export interface ReelComment {
  reel: string;
  username: string;
  text: string;
}

export interface InstagramApp {
  /** Meta's login page for the brand, which comes back to the redirect address with `state`. */
  loginUrl(state: string): string;
  /** Trades the code Meta sent back for the portfolio's token, and the brand's Instagram account. */
  connect(code: string): Promise<{ token: string; id: string; username: string }>;
  /** The comments on the account's most recent Reels, the first page of each. */
  reelComments(token: string, account: string): Promise<{ reels: number; comments: ReelComment[] }>;
}

export interface InstagramOptions {
  /** The Meta app's ID, from App settings > Basic. */
  appId: string;
  /** The Meta app's secret, from the same page. */
  appSecret: string;
  /** The Facebook Login for Business configuration made under API setup with Unified login. */
  configId: string;
  /** Where Meta sends the brand back, as saved in that configuration: https://app.cmokit.ai/instagram/callback. */
  redirectUri: string;
  fetch?: typeof fetch;
}

/** A refusal by Meta, with what it said. */
export class InstagramError extends Error {
  override name = 'InstagramError';
}

export function instagramApp(options: InstagramOptions): InstagramApp {
  const get = options.fetch ?? fetch;
  const graph = async (path: string, params: Record<string, string>) => {
    const url = new URL(`${GRAPH}${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const response = await get(url.toString());
    const body = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok || body.error) throw new InstagramError(String(body.error?.message ?? `Meta answered ${response.status}`));
    return body;
  };

  return {
    loginUrl(state) {
      const url = new URL(LOGIN);
      url.searchParams.set('client_id', options.appId);
      url.searchParams.set('config_id', options.configId);
      url.searchParams.set('redirect_uri', options.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', state);
      return url.toString();
    },

    async connect(code) {
      const granted = await graph('/oauth/access_token', {
        client_id: options.appId, client_secret: options.appSecret, redirect_uri: options.redirectUri, code,
      });
      if (typeof granted.access_token !== 'string') throw new InstagramError('Meta gave no token');
      const token = granted.access_token;
      const accounts = await graph('/me/assigned_instagram_accounts', { fields: 'id,username', access_token: token });
      const account = ((accounts.data ?? []) as { id?: string; username?: string }[])[0];
      if (!account?.id || typeof account.username !== 'string') throw new InstagramError('No Instagram account was shared');
      return { token, id: String(account.id), username: account.username.toLowerCase() };
    },

    async reelComments(token, account) {
      const media = await graph(`/${account}/media`, { fields: 'id,media_product_type', limit: '50', access_token: token });
      const reels = ((media.data ?? []) as { id: string; media_product_type?: string }[])
        .filter((m) => m.media_product_type === 'REELS').slice(0, REELS_COUNTED);
      const comments: ReelComment[] = [];
      for (const reel of reels) {
        const page = await graph(`/${reel.id}/comments`, { fields: 'username,text', limit: '100', access_token: token });
        for (const c of (page.data ?? []) as { username?: string; text?: string }[]) {
          if (c.username) comments.push({ reel: reel.id, username: c.username.toLowerCase(), text: c.text ?? '' });
        }
      }
      return { reels: reels.length, comments };
    },
  };
}
