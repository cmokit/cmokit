import { defineConfig } from '@cmokit/cli';

export default defineConfig({
  analytics: {
    posthog: {
      // Your PostHog project key (Project settings → Project API key). It is public by design.
      key: 'phc_REPLACE_ME',
      host: 'https://us.i.posthog.com',
      // Your project's id (Project settings → Project ID), which the deploy needs to create, start
      // and end the experiments below in PostHog. Uncomment it and set it.
      // project: 12345,
    },
  },
  experiments: [
    {
      // The experiment's feature flag. The deploy creates it, and the experiment, in PostHog.
      flag: 'landing',
      // The page under experiment. It is the control.
      path: '/',
      // Every other variant, as the page that holds it.
      variants: { b: '/variants/landing/b/' },
      // The conversion event that decides the experiment: a form's `data-cmokit-convert`.
      goal: 'signup',
      // `draft` serves everyone the page itself; `running` assigns visitors their variants; `ended`
      // serves everyone the page itself again. The deploy starts and ends the experiment in PostHog
      // to match. Optional: `split: { control: 50, b: 50 }`, which defaults to even.
      status: 'draft',
    },
  ],
});
