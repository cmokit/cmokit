// The Astro integration. It checks the site's CMOkit configuration and adds the analytics script to
// every page. Fails the build if a draft or running experiment's page was not built (ADR-0009).

import type { AstroIntegration } from 'astro';
import { CONVERT_PATH, RELAY_PATH, defineConfig, normalizePath, resolve, type Config } from '@cmokit/cli';
import type { ClientOptions } from './client.ts';

export type { ClientOptions };

export default function cmokit(config: Config): AstroIntegration {
  const site = resolve(defineConfig(config));

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
          uiHost: site.analytics.posthog.app,
          flags: site.experiments.filter((e) => e.status === 'running').map((e) => e.flag),
          convert: command === 'dev' ? 'browser' : CONVERT_PATH,
        };
        injectScript('page', `import { start } from '@cmokit/astro/client'; start(${JSON.stringify(options)});`);
      },

      'astro:build:done': ({ pages }) => {
        const built = new Set(pages.map((p) => normalizePath(`/${p.pathname}`)));
        const missing = site.experiments.filter((e) => e.status !== 'ended').flatMap((e) =>
          [e.path, ...Object.values(e.variants)]
            .filter((path) => !built.has(normalizePath(path)))
            .map((path) => `experiment "${e.flag}": no page was built at ${path}`));
        if (missing.length > 0) throw new Error(`CMOkit:\n  ${missing.join('\n  ')}`);
      },
    },
  };
}
