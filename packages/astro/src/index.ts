// The Astro integration. It checks the site's CMOkit configuration, adds the analytics script to every
// page, and publishes the manifest the edge reads (ADR-0009). Fails the build if a variant's page was
// not built.

import { mkdir, writeFile } from 'node:fs/promises';
import type { AstroIntegration } from 'astro';
import {
  CONVERT_PATH,
  MANIFEST_PATH,
  RELAY_PATH,
  defineConfig,
  manifest,
  normalizePath,
  type Config,
} from '@cmokit/cli';
import type { ClientOptions } from './client.ts';

export type { ClientOptions };

export default function cmokit(config: Config): AstroIntegration {
  defineConfig(config);
  const site = manifest(config);

  return {
    name: '@cmokit/astro',
    hooks: {
      'astro:config:setup': ({ command, injectScript }) => {
        // In `astro dev` no edge is in front of the site, so events go straight to the tool and
        // conversions are captured by the browser. Built sites relay both through the edge.
        const host = site.analytics.posthog.host;
        const options: ClientOptions = {
          key: site.analytics.posthog.key,
          apiHost: command === 'dev' ? host : RELAY_PATH,
          uiHost: uiHost(host),
          flags: site.experiments.map((e) => e.flag),
          convert: command === 'dev' ? 'browser' : CONVERT_PATH,
        };
        injectScript('page', `import { start } from '@cmokit/astro/client'; start(${JSON.stringify(options)});`);
      },

      'astro:build:done': async ({ dir, pages, logger }) => {
        const built = new Set(pages.map((p) => normalizePath(`/${p.pathname}`)));
        const missing = site.experiments.flatMap((e) =>
          [e.path, ...Object.values(e.variants)]
            .filter((path) => !built.has(normalizePath(path)))
            .map((path) => `experiment "${e.flag}": no page was built at ${path}`));
        if (missing.length > 0) throw new Error(`CMOkit:\n  ${missing.join('\n  ')}`);

        const file = new URL(`.${MANIFEST_PATH}`, dir);
        await mkdir(new URL('.', file), { recursive: true });
        await writeFile(file, `${JSON.stringify(site, null, 2)}\n`);
        logger.info(`${site.experiments.length} experiment(s) published at ${MANIFEST_PATH}`);
      },
    },
  };
}

/** PostHog's app host for an ingestion host: us.i.posthog.com is reached at us.posthog.com. */
function uiHost(host: string): string {
  const url = new URL(host);
  url.hostname = url.hostname.replace(/^([a-z]+)\.i\./, '$1.');
  return url.origin;
}
