// A site's CMOkit configuration, which is deployed with the edge (ADR-0009) and declares each
// experiment's plan and status (ADR-0013).

/**
 * `draft`: the edge serves the control to everyone. `running`: the edge assigns visitors and records
 * exposures. `ended`: the edge serves the control to everyone again.
 */
export type Status = 'draft' | 'running' | 'ended';

export const STATUSES: readonly Status[] = ['draft', 'running', 'ended'];

export interface Experiment {
  /** The experiments tool's flag. Lowercase letters, digits, `-` and `_`. */
  flag: string;
  /** The page under experiment, which is also its control variant. */
  path: string;
  /** Each variant other than the control, as the path of the page that holds it. */
  variants: Record<string, string>;
  /** The conversion event the experiment is decided on, as a page's `data-cmokit-convert` names it. */
  goal: string;
  status: Status;
}

export interface Config {
  analytics: {
    posthog: {
      /** The project key. Public by design. */
      key: string;
      /** Where events and flags are sent. Defaults to PostHog's US cloud. */
      host?: string;
    };
  };
  experiments?: Experiment[];
}

/** A configuration with its defaults filled in and its paths normalized, as the edge uses it. */
export interface Resolved {
  analytics: { posthog: { key: string; host: string } };
  experiments: Experiment[];
}

export const CONVERT_PATH = '/_cmokit/convert';
export const RELAY_PATH = '/_cmokit/a';
export const CONTROL = 'control';
export const VISITOR_COOKIE = 'cmokit_id';
export const PREVIEW_PARAM = 'cmokit_variant';
export const variantCookie = (flag: string) => `cmokit_x_${flag}`;

const DEFAULT_HOST = 'https://us.i.posthog.com';
const FLAG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** A conversion event's name. */
export const EVENT_NAME = /^[a-z0-9_]{1,64}$/;

/** A page path as the edge compares it: no trailing slash, no `index.html`. */
export function normalizePath(path: string): string {
  const trimmed = path.replace(/\/index\.html$/, '/').replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Returns every problem with a configuration; empty when it is valid. */
export function problems(config: Config): string[] {
  const found: string[] = [];
  if (!config.analytics?.posthog?.key) found.push('analytics.posthog.key is missing');
  const flags = new Set<string>();
  const paths = new Set<string>();
  for (const experiment of config.experiments ?? []) {
    const where = `experiment "${experiment.flag}"`;
    if (!FLAG.test(experiment.flag)) found.push(`${where}: flag must match ${FLAG}`);
    if (flags.has(experiment.flag)) found.push(`${where}: flag is used twice`);
    flags.add(experiment.flag);
    if (!experiment.path.startsWith('/')) found.push(`${where}: path must start with /`);
    const path = normalizePath(experiment.path);
    if (paths.has(path)) found.push(`${where}: ${path} is under another experiment`);
    paths.add(path);
    if (!EVENT_NAME.test(experiment.goal ?? '')) found.push(`${where}: goal must be an event name matching ${EVENT_NAME}`);
    if (!STATUSES.includes(experiment.status)) found.push(`${where}: status must be one of ${STATUSES.join(', ')}`);
    const variants = Object.entries(experiment.variants ?? {});
    if (variants.length === 0) found.push(`${where}: needs at least one variant besides the control`);
    for (const [name, page] of variants) {
      if (name === CONTROL) found.push(`${where}: "${CONTROL}" is the page itself, not a variant`);
      if (!page.startsWith('/')) found.push(`${where}: variant "${name}" must be a path starting with /`);
      if (normalizePath(page) === path) found.push(`${where}: variant "${name}" is the page under experiment`);
    }
  }
  return found;
}

/** Checks a configuration and returns it, so `cmokit.config.ts` fails as soon as it is loaded. */
export function defineConfig(config: Config): Config {
  const found = problems(config);
  if (found.length > 0) throw new Error(`CMOkit configuration:\n  ${found.join('\n  ')}`);
  return config;
}

export function resolve(config: Config): Resolved {
  return {
    analytics: {
      posthog: { key: config.analytics.posthog.key, host: config.analytics.posthog.host ?? DEFAULT_HOST },
    },
    experiments: (config.experiments ?? []).map((e) => ({
      flag: e.flag,
      path: normalizePath(e.path),
      variants: { ...e.variants },
      goal: e.goal,
      status: e.status,
    })),
  };
}
