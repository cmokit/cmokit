// Instagram, through the Instagram API with Instagram Login (ADR-0045). It reaches business and
// creator accounts alone: Meta gives apps no access to a personal account. A person on a brand's
// waitlist connects their account to prove which handle is theirs, and the brand connects its own so
// the comments on its Reels can be read and counted toward each person's place. It uses fetch alone.

/** What CMOkit asks of a person on a waitlist: who they are on Instagram, nothing more. */
export const MEMBER_SCOPES = ['instagram_business_basic'];
/** What CMOkit asks of a brand: its account, and the comments on its posts. */
export const BRAND_SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments'];
/** The most recent Reels whose comments are counted, which keeps a count within a Worker's subrequests. */
export const REELS_COUNTED = 25;

const AUTHORIZE = 'https://www.instagram.com/oauth/authorize';
const TOKEN = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';

export interface InstagramApp {
  /** Instagram's page where a person allows CMOkit, which comes back to the redirect address with `state`. */
  authorizeUrl(state: string, scopes: string[]): string;
  /** Trades the code Instagram sent back for a short-lived token, and the account it is for. */
  connect(code: string): Promise<{ token: string; id: string; username: string }>;
  /** Trades a short-lived token for one that lasts about 60 days. */
  longLived(token: string): Promise<{ token: string; expiresIn: number }>;
  /** Refreshes a long-lived token at least a day old for another 60 days. */
  refresh(token: string): Promise<{ token: string; expiresIn: number }>;
  /** Who commented on the account's most recent Reels: one entry for each Reel a username commented on. */
  reelCommenters(token: string): Promise<{ reels: number; commenters: { reel: string; username: string }[] }>;
}

export interface InstagramOptions {
  /** The Instagram app ID from the Meta app's Instagram product. */
  appId: string;
  /** The Instagram app secret from the same place. */
  appSecret: string;
  /** Where Instagram sends a person back, as registered in the Meta app: https://app.cmokit.ai/instagram/callback. */
  redirectUri: string;
  fetch?: typeof fetch;
}

/** A refusal by Instagram, with what it said. */
export class InstagramError extends Error {
  override name = 'InstagramError';
}

export function instagramApp(options: InstagramOptions): InstagramApp {
  const get = options.fetch ?? fetch;
  const read = async (response: Response) => {
    const body = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok || body.error) throw new InstagramError(String(body.error?.message ?? body.error_message ?? `Instagram answered ${response.status}`));
    return body;
  };
  const graph = (path: string, params: Record<string, string>) => {
    const url = new URL(`${GRAPH}${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    return get(url.toString()).then(read);
  };

  return {
    authorizeUrl(state, scopes) {
      const url = new URL(AUTHORIZE);
      url.searchParams.set('client_id', options.appId);
      url.searchParams.set('redirect_uri', options.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', scopes.join(','));
      url.searchParams.set('state', state);
      return url.toString();
    },

    async connect(code) {
      const body = await read(await get(TOKEN, {
        method: 'POST',
        body: new URLSearchParams({
          client_id: options.appId, client_secret: options.appSecret, grant_type: 'authorization_code',
          redirect_uri: options.redirectUri, code: code.replace(/#_$/, ''),
        }),
      }));
      // Instagram has answered both with the token at the top and inside a one-item data list.
      const granted = (Array.isArray(body.data) ? body.data[0] : body) ?? {};
      if (typeof granted.access_token !== 'string') throw new InstagramError('Instagram gave no token');
      const me = await graph('/me', { fields: 'user_id,username', access_token: granted.access_token });
      if (typeof me.username !== 'string') throw new InstagramError('Instagram named no account');
      return { token: granted.access_token, id: String(me.user_id ?? me.id ?? granted.user_id), username: me.username.toLowerCase() };
    },

    async longLived(token) {
      const body = await graph('/access_token', { grant_type: 'ig_exchange_token', client_secret: options.appSecret, access_token: token });
      return { token: String(body.access_token), expiresIn: Number(body.expires_in) };
    },

    async refresh(token) {
      const body = await graph('/refresh_access_token', { grant_type: 'ig_refresh_token', access_token: token });
      return { token: String(body.access_token), expiresIn: Number(body.expires_in) };
    },

    async reelCommenters(token) {
      const media = await graph('/me/media', { fields: 'id,media_product_type', limit: '50', access_token: token });
      const reels = ((media.data ?? []) as { id: string; media_product_type?: string }[])
        .filter((m) => m.media_product_type === 'REELS').slice(0, REELS_COUNTED);
      const commenters: { reel: string; username: string }[] = [];
      for (const reel of reels) {
        const comments = await graph(`/${reel.id}/comments`, { fields: 'username', limit: '100', access_token: token });
        const names = new Set(((comments.data ?? []) as { username?: string }[]).map((c) => c.username?.toLowerCase()).filter(Boolean) as string[]);
        for (const username of names) commenters.push({ reel: reel.id, username });
      }
      return { reels: reels.length, commenters };
    },
  };
}
