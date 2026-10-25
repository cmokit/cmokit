// A stand-in for PostHog's experiments and query API, holding experiments in memory and recording
// each change and each read.

import assert from 'node:assert/strict';

export const APP = 'https://us.posthog.com';
export const BASE = `${APP}/api/projects/7`;

export interface Held {
  id: number;
  description: string;
  feature_flag_key: string;
  feature_flag: { id: number; filters: { multivariate: { variants: { key: string; rollout_percentage: number }[] } } };
  metrics: unknown[];
  start_date: string | null;
  end_date: string | null;
  archived: boolean;
  deleted: boolean;
}

export interface Analytics {
  /** What setup_context answers for its candidate metric. */
  reached?: number;
  converted?: number;
  /** The body and status the results query answers with. */
  results?: { status: number; body: unknown };
}

export function standIn(held: Held[] = [], analytics: Analytics = {}) {
  const changes: string[] = [];
  const asked: { path: string; body: any }[] = [];
  const flagsDeleted: number[] = [];
  let nextId = 100;
  const fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer phx_secret');
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.slice(BASE.length);
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    const find = (id: string) => held.find((e) => String(e.id) === id && !e.deleted);

    if (method === 'POST' && path === '/experiments/setup_context/') {
      asked.push({ path, body });
      const { reached = 0, converted = 0 } = analytics;
      return json({
        team_defaults: { status: 'ok', data: { minimum_detectable_effect: null, product_default_minimum_detectable_effect: 30 } },
        candidate_metric: { status: 'ok', data: { window_days: 14, persons_reached: reached, persons_converted: converted } },
      });
    }
    if (method === 'POST' && path === '/experiments/calculate_running_time/') {
      asked.push({ path, body });
      // PostHog's formula for a funnel: 16·p·(1−p)/d² per variant, times the variants.
      const p = body.baseline_value;
      const d = (body.minimum_detectable_effect / 100) * p;
      return json({ recommended_sample_size: Math.ceil((16 * p * (1 - p)) / d ** 2) * body.number_of_variants });
    }
    if (method === 'POST' && path === '/query/') {
      asked.push({ path, body });
      const answer = analytics.results ?? { status: 200, body: {} };
      return json(answer.body, answer.status);
    }
    if (method === 'GET' && path === '/experiments/?limit=100') {
      // The list leaves out the flag and the metrics, as PostHog's does.
      return json({ next: null, results: held.filter((e) => !e.deleted).map(({ feature_flag: _f, metrics: _m, ...e }) => e) });
    }
    let m = path.match(/^\/feature_flags\/(\d+)\/$/);
    if (m && method === 'PATCH') {
      flagsDeleted.push(Number(m[1]));
      return json({});
    }
    if (method === 'POST' && path === '/experiments/') {
      const id = nextId++;
      held.push({
        id, description: body.description, feature_flag_key: body.feature_flag_key,
        feature_flag: { id: id + 1000, filters: body.feature_flag.filters }, metrics: body.metrics,
        start_date: null, end_date: null, archived: false, deleted: false,
      });
      changes.push(`create ${body.feature_flag_key}`);
      return json({ id }, 201);
    }
    m = path.match(/^\/experiments\/(\d+)\/(?:(launch|end|archive)\/)?$/);
    const e = m ? find(m[1]) : undefined;
    if (!m || !e) return json({ detail: 'Not found.' }, 404);
    const action = m[2];
    if (method === 'GET' && !action) return json(e);
    if (method === 'PATCH' && !action) {
      if (body.deleted) e.deleted = true;
      if (body.feature_flag) e.feature_flag.filters = body.feature_flag.filters;
      if (body.metrics) e.metrics = body.metrics;
      changes.push(`${body.deleted ? 'delete' : 'update'} ${e.feature_flag_key}`);
      return json(e);
    }
    if (action === 'launch') {
      if (e.start_date) return json({ detail: 'already launched' }, 400);
      e.start_date = '2026-10-24T00:00:00Z';
    }
    if (action === 'end') {
      if (!e.start_date || e.end_date) return json({ detail: 'not running' }, 400);
      e.end_date = '2026-10-31T00:00:00Z';
    }
    if (action === 'archive') {
      if (!e.end_date) return json({ detail: 'not ended' }, 400);
      assert.equal(body.disable_feature_flag, true);
      e.archived = true;
    }
    changes.push(`${action} ${e.feature_flag_key}`);
    return json(e);
  }) as typeof globalThis.fetch;
  return { held, changes, flagsDeleted, asked, fetch };
}

