// The providers a person can sign in with besides an email code (ADR-0018). Google by OpenID Connect
// (`openid`, `email`, `profile`), GitHub by OAuth (`read:user`, `user:email`) and Meta by Facebook
// Login (`public_profile`, `email`) each ask for identity alone. Instagram, the creators' own way in,
// goes through the Meta app's Unified Login configuration, which decides what it asks for; the issuer
// reads the Instagram account's ID and handle and keeps no token (ADR-0048). Each is offered only when
// its client is configured. An identity is the provider and its stable subject id; an email address
// comes with it only when the provider says it is verified, and it never joins one account to another.

export interface ProviderClient {
  id: string;
  secret: string;
}

export interface Signed {
  /** The provider's stable id for the person, which names the sign-in identity. */
  subject: string;
  /** An address the provider says is verified, or null. */
  email: string | null;
  /** The Instagram handle, without its @ and in lower case, for an Instagram sign-in (ADR-0048). */
  handle?: string;
}

export interface Provider {
  name: 'google' | 'github' | 'meta' | 'instagram';
  label: string;
  scopes: string[];
  /** Where to send the browser, with the state and, where the provider takes one, a PKCE challenge. */
  authorizeUrl(options: { state: string; challenge: string; redirectUri: string }): string;
  /** Exchanges the code the provider sent back, and reads who signed in. */
  identify(options: { code: string; verifier: string; redirectUri: string }): Promise<Signed>;
}

type Fetch = typeof fetch;

async function json(response: Response, what: string): Promise<any> {
  if (!response.ok) throw new Error(`${what} answered ${response.status}`);
  return response.json();
}

export function google(client: ProviderClient, send: Fetch = fetch): Provider {
  const scopes = ['openid', 'email', 'profile'];
  return {
    name: 'google', label: 'Google', scopes,
    authorizeUrl: ({ state, challenge, redirectUri }) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: client.id, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(' '),
      state, code_challenge: challenge, code_challenge_method: 'S256',
    })}`,
    async identify({ code, verifier, redirectUri }) {
      const token = await json(await send('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
      }), 'Google token');
      const user = await json(await send('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${token.access_token}` },
      }), 'Google userinfo');
      if (typeof user.sub !== 'string' || !user.sub) throw new Error('Google sent no subject');
      return { subject: user.sub, email: user.email_verified === true && typeof user.email === 'string' ? user.email.toLowerCase() : null };
    },
  };
}

export function github(client: ProviderClient, send: Fetch = fetch): Provider {
  const scopes = ['read:user', 'user:email'];
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'CMOkit' });
  return {
    name: 'github', label: 'GitHub', scopes,
    authorizeUrl: ({ state, challenge, redirectUri }) => `https://github.com/login/oauth/authorize?${new URLSearchParams({
      client_id: client.id, redirect_uri: redirectUri, scope: scopes.join(' '), state,
      code_challenge: challenge, code_challenge_method: 'S256',
    })}`,
    async identify({ code, verifier, redirectUri }) {
      const token = await json(await send('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, code, redirect_uri: redirectUri, code_verifier: verifier }),
      }), 'GitHub token');
      if (typeof token.access_token !== 'string') throw new Error('GitHub sent no token');
      const user = await json(await send('https://api.github.com/user', { headers: headers(token.access_token) }), 'GitHub user');
      if (typeof user.id !== 'number' && typeof user.id !== 'string') throw new Error('GitHub sent no user id');
      const emails = await json(await send('https://api.github.com/user/emails', { headers: headers(token.access_token) }), 'GitHub emails') as { email: string; primary: boolean; verified: boolean }[];
      const primary = emails.find((e) => e.primary && e.verified);
      return { subject: String(user.id), email: primary ? primary.email.toLowerCase() : null };
    },
  };
}

/** Facebook Login's manual flow, with the app's secret; the address it returns is not taken as verified. */
export function meta(client: ProviderClient, send: Fetch = fetch): Provider {
  const scopes = ['public_profile', 'email'];
  return {
    name: 'meta', label: 'Facebook', scopes,
    authorizeUrl: ({ state, redirectUri }) => `https://www.facebook.com/dialog/oauth?${new URLSearchParams({
      client_id: client.id, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(','), state,
    })}`,
    async identify({ code, redirectUri }) {
      const token = await json(await send(`https://graph.facebook.com/oauth/access_token?${new URLSearchParams({
        client_id: client.id, client_secret: client.secret, redirect_uri: redirectUri, code,
      })}`), 'Facebook token');
      if (typeof token.access_token !== 'string') throw new Error('Facebook sent no token');
      const user = await json(await send('https://graph.facebook.com/me?fields=id', {
        headers: { authorization: `Bearer ${token.access_token}` },
      }), 'Facebook user');
      if (typeof user.id !== 'string' || !user.id) throw new Error('Facebook sent no user id');
      return { subject: user.id, email: null };
    },
  };
}

/** The Graph API version CMOkit calls, as the content server's Instagram connection does (ADR-0045). */
const GRAPH = 'https://graph.facebook.com/v27.0';

/**
 * Instagram through the Meta app's Facebook Login for Business configuration made under API setup
 * with Unified login (ADR-0048): the configuration, not a scope list, says what Meta asks for. The
 * person's Instagram account's ID names the identity, and its handle comes with it; the token is used
 * for that one read and kept nowhere.
 */
export function instagram(client: ProviderClient & { config: string }, send: Fetch = fetch): Provider {
  return {
    name: 'instagram', label: 'Instagram', scopes: [],
    authorizeUrl: ({ state, redirectUri }) => `https://www.facebook.com/dialog/oauth?${new URLSearchParams({
      client_id: client.id, config_id: client.config, redirect_uri: redirectUri, response_type: 'code', state,
    })}`,
    async identify({ code, redirectUri }) {
      const token = await json(await send(`${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: client.id, client_secret: client.secret, redirect_uri: redirectUri, code,
      })}`), 'Instagram token');
      if (typeof token.access_token !== 'string') throw new Error('Instagram sent no token');
      const accounts = await json(await send(`${GRAPH}/me/assigned_instagram_accounts?fields=id,username`, {
        headers: { authorization: `Bearer ${token.access_token}` },
      }), 'Instagram accounts');
      const account = ((accounts.data ?? []) as { id?: unknown; username?: unknown }[])[0];
      if (!account || (typeof account.id !== 'string' && typeof account.id !== 'number') || typeof account.username !== 'string' || !account.username) {
        throw new Error('No Instagram account was shared');
      }
      return { subject: String(account.id), email: null, handle: account.username.replace(/^@/, '').toLowerCase() };
    },
  };
}
