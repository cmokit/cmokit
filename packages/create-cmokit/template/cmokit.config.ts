import { defineConfig } from '@cmokit/cli';

export default defineConfig({
  analytics: {
    // Your PostHog project key (Project settings → Project API key). It is public by design.
    posthog: { key: 'phc_REPLACE_ME', host: 'https://us.i.posthog.com' },
  },
  experiments: [
    {
      // The experiment's feature flag in PostHog, with variants `control` and `b`.
      flag: 'landing',
      // The page under experiment. It is the control.
      path: '/',
      // Every other variant, as the page that holds it.
      variants: { b: '/variants/landing/b/' },
      // The conversion event that decides the experiment: a form's `data-cmokit-convert`.
      goal: 'signup',
      // `draft` serves everyone the page itself; `running` assigns visitors their variants; `ended`
      // serves everyone the page itself again.
      status: 'draft',
    },
  ],
});
