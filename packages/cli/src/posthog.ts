// PostHog behind the administrative half of the experiments interface (ADR-0010, ADR-0013), through
// its experiments API with a personal API key. The key can change what visitors are served, so it is
// read by the command line alone, from the deploying environment, and never logged.

import type { Declared, ExperimentsAdmin, ToolExperiment } from './experiments.ts';

export interface PostHogAdminOptions {
  /** PostHog's app and API host, such as https://us.posthog.com. */
  app: string;
  project: number;
  /** A personal API key scoped to the project, with `experiment:write` and `feature_flag:write`. */
  key: string;
  fetch?: typeof fetch;
}

/** Marks the experiments CMOkit's sync created, and tells anyone in PostHog where to change them. */
export const MANAGED = 'Managed by CMOkit: change it in cmokit.config.ts, not here.';

interface Variant {
  key: string;
  rollout_percentage: number;
}

interface PostHogExperiment {
  id: number;
  name: string;
  description?: string | null;
  feature_flag_key: string;
  feature_flag?: { id?: number; filters?: { multivariate?: { variants?: Variant[] } } } | null;
  parameters?: { feature_flag_variants?: Variant[] } | null;
  metrics?: { metric_type?: string; series?: { event?: string }[] }[] | null;
  start_date?: string | null;
  end_date?: string | null;
  archived?: boolean;
  deleted?: boolean;
}

export function posthogAdmin(options: PostHogAdminOptions): ExperimentsAdmin {
  const send = options.fetch ?? fetch;
  const base = `${options.app.replace(/\/+$/, '')}/api/projects/${options.project}`;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const response = await send(url, {
      method,
      headers: { authorization: `Bearer ${options.key}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`PostHog ${method} ${url.replace(base, '')} answered ${response.status}: ${text.slice(0, 500)}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const experiment = (id: string) => `/experiments/${id}/`;

  return {
    async list() {
      const found: ToolExperiment[] = [];
      let next: string | null = '/experiments/?limit=100';
      while (next) {
        const page: { results: PostHogExperiment[]; next: string | null } = await call('GET', next);
        for (const listed of page.results) {
          if (listed.archived || listed.deleted) continue;
          const managed = (listed.description ?? '').startsWith(MANAGED);
          // The list leaves out the flag and metrics, which only matter for experiments CMOkit manages.
          const full = managed ? await call<PostHogExperiment>('GET', experiment(String(listed.id))) : listed;
          found.push(toTool(full, managed));
        }
        next = page.next;
      }
      return found;
    },

    async create(declared) {
      const created = await call<PostHogExperiment>('POST', '/experiments/', {
        name: `${declared.flag} (${declared.path})`,
        description: `${MANAGED}\nThe page under experiment is ${declared.path}.`,
        feature_flag_key: declared.flag,
        feature_flag: { filters: flagFilters(declared) },
        metrics: [goalMetric(declared)],
        // The goal is declared in reviewed configuration, which may precede the event's first send.
        allow_unknown_events: true,
      });
      return String(created.id);
    },

    async update(id, declared) {
      await call('PATCH', experiment(id), {
        feature_flag: { filters: flagFilters(declared) },
        metrics: [goalMetric(declared)],
        allow_unknown_events: true,
      });
    },

    async launch(id) {
      await call('POST', `${experiment(id)}launch/`);
    },

    async end(id) {
      await call('POST', `${experiment(id)}end/`, {});
    },

    async archive(id) {
      await call('POST', `${experiment(id)}archive/`, { disable_feature_flag: true });
    },

    async remove(id) {
      const held = await call<PostHogExperiment>('GET', experiment(id));
      await call('PATCH', experiment(id), { deleted: true });
      // A deleted draft's flag would otherwise keep its key, and the flag could not be declared again.
      if (held.feature_flag?.id) await call('PATCH', `/feature_flags/${held.feature_flag.id}/`, { deleted: true });
    },
  };
}

function toTool(e: PostHogExperiment, managed: boolean): ToolExperiment {
  const variants = e.feature_flag?.filters?.multivariate?.variants ?? e.parameters?.feature_flag_variants ?? [];
  const funnel = e.metrics?.find((m) => m.metric_type === 'funnel');
  return {
    id: String(e.id),
    flag: e.feature_flag_key,
    managed,
    state: !e.start_date ? 'draft' : e.end_date ? 'ended' : 'running',
    split: Object.fromEntries(variants.map((v) => [v.key, v.rollout_percentage])),
    goal: funnel?.series?.[0]?.event,
  };
}

function flagFilters(declared: Declared) {
  return {
    multivariate: {
      variants: Object.entries(declared.split).map(([key, rollout_percentage]) => ({ key, rollout_percentage })),
    },
    groups: [{ properties: [], rollout_percentage: 100 }],
  };
}

/** The share of exposed visitors who then send the goal event. */
function goalMetric(declared: Declared) {
  return {
    kind: 'ExperimentMetric',
    metric_type: 'funnel',
    name: declared.goal,
    series: [{ kind: 'EventsNode', event: declared.goal }],
  };
}
