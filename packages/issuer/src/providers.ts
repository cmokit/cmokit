// The providers a person can sign in with besides an email code (ADR-0018), as Better Auth's own:
// Google by OpenID Connect, GitHub by OAuth and Meta by Facebook Login each ask for identity alone.
// Instagram, the creators' own way in, goes through the Meta app's Unified Login configuration, which
// decides what it asks for; the issuer reads the Instagram account's ID and handle (ADR-0048). Each is
// offered only when its client is configured, and each sends the person back to `<issuer>/callback`,
// the one redirect every provider's console names. An email address comes with a sign-in only when the
// provider says it is verified; Facebook's and Instagram's sign-ins carry a stand-in address that
// never counts as proven. The issuer keeps no provider's token.

export interface ProviderClient {
  id: string;
  secret: string;
}

/** The providers a deployment has set up, each with its client. */
export interface ProviderSettings {
  google?: ProviderClient;
  github?: ProviderClient;
  facebook?: ProviderClient;
  /** The content server's Meta app, with the sign-in's own Unified Login configuration (ADR-0048). */
  instagram?: ProviderClient & { config: string };
}

/** The ways in the sign-in page offers, by Better Auth's provider id, with Instagram first (ADR-0048). */
export const WAYS = [
  { name: 'instagram', label: 'Instagram' },
  { name: 'google', label: 'Google' },
  { name: 'github', label: 'GitHub' },
  { name: 'facebook', label: 'Facebook' },
] as const;

export type Way = (typeof WAYS)[number]['name'];

/** An Instagram account a person signed in with: its ID, and its handle without the @ and in lower case. */
export interface InstagramAccount {
  id: string;
  handle: string;
}

/** The domain of the stand-in addresses of people whose provider gave no verified address. */
export const NO_EMAIL = 'no-email.cmokit.invalid';

/** A stand-in address, unique to a provider's subject, that is never taken as proven. */
export function standIn(provider: string, subject: string): string {
  return `${provider}-${subject.toLowerCase().replace(/[^a-z0-9]/g, '')}@${NO_EMAIL}`;
}

/** The Graph API version CMOKit calls, as the content server's Instagram connection does (ADR-0045). */
const GRAPH = 'https://graph.facebook.com/v27.0';

type Fetch = typeof fetch;

async function json(response: Response, what: string): Promise<any> {
  if (!response.ok) throw new Error(`${what} answered ${response.status}`);
  return response.json();
}

/**
 * Instagram through the Meta app's Facebook Login for Business configuration made under API setup
 * with Unified login (ADR-0048): the configuration, not a scope list, says what Meta asks for. The
 * person's own Meta login names the account, not a business account they manage, which others may
 * manage too; the Instagram account it shared comes with it, by its ID and handle, and is passed to
 * `shared`.
 */
export function instagramProvider(client: ProviderClient & { config: string }, redirectURI: string, shared: (metaId: string, account: InstagramAccount) => Promise<void>, send: Fetch = (input, init) => fetch(input, init)) {
  return {
    providerId: 'instagram',
    clientId: client.id,
    clientSecret: client.secret,
    authorizationUrl: 'https://www.facebook.com/dialog/oauth',
    authorizationUrlParams: { config_id: client.config },
    redirectURI,
    pkce: false,
    async getToken({ code }: { code: string }) {
      const token = await json(await send(`${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: client.id, client_secret: client.secret, redirect_uri: redirectURI, code,
      })}`), 'Instagram token');
      if (typeof token.access_token !== 'string') throw new Error('Instagram sent no token');
      return { accessToken: token.access_token as string, tokenType: 'bearer' };
    },
    async getUserInfo(tokens: { accessToken?: string }) {
      const headers = { authorization: `Bearer ${tokens.accessToken}` };
      const user = await json(await send(`${GRAPH}/me?fields=id`, { headers }), 'Meta user');
      if ((typeof user.id !== 'string' && typeof user.id !== 'number') || !user.id) throw new Error('Meta sent no user id');
      const accounts = await json(await send(`${GRAPH}/me/assigned_instagram_accounts?fields=id,username`, { headers }), 'Instagram accounts');
      const account = ((accounts.data ?? []) as { id?: unknown; username?: unknown }[])[0];
      if (!account || (typeof account.id !== 'string' && typeof account.id !== 'number') || typeof account.username !== 'string' || !account.username) {
        throw new Error('No Instagram account was shared');
      }
      const id = String(user.id);
      const handle = account.username.replace(/^@/, '').toLowerCase();
      await shared(id, { id: String(account.id), handle });
      return { id, email: standIn('instagram', id), emailVerified: false, name: handle };
    },
  };
}

/** Better Auth's own providers for Google, GitHub and Facebook, each sent back to the one callback. */
export function socialProviders(settings: ProviderSettings, redirectURI: string) {
  return {
    ...(settings.google ? { google: { clientId: settings.google.id, clientSecret: settings.google.secret, redirectURI } } : {}),
    ...(settings.github ? { github: { clientId: settings.github.id, clientSecret: settings.github.secret, redirectURI } } : {}),
    ...(settings.facebook ? {
      facebook: {
        clientId: settings.facebook.id, clientSecret: settings.facebook.secret, redirectURI,
        // Facebook's address is not taken as verified, so it never joins one account to another.
        mapProfileToUser: (profile: { id?: string; sub?: string }) => ({ email: standIn('facebook', String(profile.id ?? profile.sub)), emailVerified: false }),
      },
    } : {}),
  };
}
