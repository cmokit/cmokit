// PostHog behind the administrative half of the experiments interface (ADR-0010, ADR-0013), through
// its experiments API with a personal API key. The key can change what visitors are served, so it is
// read by the command line alone, from the deploying environment, and never logged.

import type { Declared, ExperimentsAdmin, Results, ToolExperiment, VariantResult } from './experiments.ts';

export interface PostHogAdminOptions {
  /** PostHog's app and API host, such as https://us.posthog.com. */
  app: string;
  project: number;
  /**
   * A personal API key scoped to the project, with `experiment:write`, `feature_flag:write`,
   * `query:read` and `experiment_saved_metric:read`.
   */
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

interface Section<T> {
  status: string;
  data: T | null;
}

interface SetupContext {
  team_defaults?: Section<{ minimum_detectable_effect: number | null; product_default_minimum_detectable_effect: number }>;
  candidate_metric: Section<{ window_days: number; persons_reached: number | null; persons_converted: number | null }>;
}

interface Stats {
  key: string;
  number_of_samples: number;
  sum: number;
  chance_to_win?: number | null;
  credible_interval?: number[] | null;
  p_value?: number | null;
  confidence_interval?: number[] | null;
  significant?: boolean | null;
  method?: 'bayesian' | 'frequentist';
}

/** A refusal from PostHog's API, with its status and body. */
class Refusal extends Error {
  readonly status: number;
  readonly body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
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
      const message = `PostHog ${method} ${url.replace(base, '')} answered ${response.status}: ${text.slice(0, 500)}`;
      throw new Refusal(message, response.status, text);
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

    async estimate(declared, effect) {
      // Visitors reaching the page, by the browser's page views, and those of them sending the goal.
      const pathnames = declared.path === '/' ? ['/'] : [declared.path, `${declared.path}/`];
      const context = await call<SetupContext>('POST', '/experiments/setup_context/', {
        target_event: '$pageview',
        target_properties: [{ type: 'event', key: '$pathname', operator: 'exact', value: pathnames }],
        metric_event: declared.goal,
        previous_experiments_limit: 1,
        shared_metrics_limit: 1,
      });
      const { status, data } = context.candidate_metric;
      if (status !== 'ok' || !data) throw new Error(`PostHog could not read ${declared.goal} on ${declared.path} (${status})`);
      const defaults = context.team_defaults?.data;
      const mde = effect ?? defaults?.minimum_detectable_effect ?? defaults?.product_default_minimum_detectable_effect;
      if (mde === undefined) throw new Error('PostHog has no default minimum detectable effect; pass --effect');
      const reached = data.persons_reached ?? 0;
      const converted = data.persons_converted ?? 0;
      const estimate = { windowDays: data.window_days, reached, converted, effect: mde };
      if (reached === 0 || converted === 0) return estimate;

      const shares = Object.values(declared.split);
      const sized = await call<{ recommended_sample_size: number | null }>('POST', '/experiments/calculate_running_time/', {
        metric_type: 'funnel',
        minimum_detectable_effect: mde,
        number_of_variants: shares.length,
        baseline_value: converted / reached,
      });
      const sampleSize = sized.recommended_sample_size ?? undefined;
      if (sampleSize === undefined) return estimate;
      // The sample size assumes an even split; with another, the smallest variant takes longest to fill.
      const slowest = (reached / data.window_days) * (Math.min(...shares) / 100);
      return { ...estimate, sampleSize, days: slowest > 0 ? Math.ceil(sampleSize / shares.length / slowest) : undefined };
    },

    async results(id, declared) {
      let answer: { baseline?: Stats | null; variant_results?: Stats[] | null };
      try {
        answer = await call('POST', '/query/', {
          query: { kind: 'ExperimentQuery', experiment_id: Number(id), metric: goalMetric(declared) },
        });
      } catch (error) {
        // PostHog refuses with `no_data` until the control has exposures.
        if (error instanceof Refusal && error.status === 400 && /"code"\s*:\s*"no_data"/.test(error.body)) {
          return { waiting: (JSON.parse(error.body) as { detail?: string }).detail ?? 'No exposures yet.' };
        }
        throw error;
      }
      if (!answer.baseline) return { waiting: 'No exposures yet.' };
      const variants = answer.variant_results ?? [];
      const results: Results = {
        method: variants[0]?.method ?? 'bayesian',
        variants: [toVariant(answer.baseline), ...variants.map(toVariant)],
      };
      return results;
    },
  };
}

function toVariant(s: Stats): VariantResult {
  const interval = s.credible_interval ?? s.confidence_interval;
  return {
    key: s.key,
    exposed: s.number_of_samples,
    converted: s.sum,
    ...(interval?.length === 2 ? { interval: [interval[0], interval[1]] as [number, number] } : {}),
    ...(typeof s.chance_to_win === 'number' ? { chanceToWin: s.chance_to_win } : {}),
    ...(typeof s.p_value === 'number' ? { pValue: s.p_value } : {}),
    ...(typeof s.significant === 'boolean' ? { significant: s.significant } : {}),
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
    ...(e.start_date ? { started: e.start_date } : {}),
    ...(e.end_date ? { ended: e.end_date } : {}),
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
