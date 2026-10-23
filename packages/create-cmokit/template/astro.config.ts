import { defineConfig } from 'astro/config';
import cmokit from '@cmokit/astro';
import config from './cmokit.config.ts';

export default defineConfig({
  integrations: [cmokit(config)],
});
