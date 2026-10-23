// Visits the edge takes for agents: crawlers, AI assistants, previewers and HTTP libraries. They are
// served the control and kept out of experiments (EXP-04). A missing user agent counts as an agent.

const AGENT = new RegExp(
  [
    'bot\\b', 'bot/', 'crawl', 'spider', 'slurp', 'archiver', 'preview', 'facebookexternalhit', 'embedly',
    'claude', 'anthropic', 'chatgpt', 'openai', 'gptbot', 'perplexity', 'cohere', 'bytespider', 'ccbot',
    'google-extended', 'googleother', 'meta-externalagent', 'amazonbot', 'applebot', 'diffbot', 'mistral',
    'headless', 'lighthouse', 'pagespeed', 'curl/', 'wget/', 'httpie', 'python-', 'aiohttp', '^node$',
    'node-fetch', 'undici', 'axios', 'go-http-client', 'okhttp', 'java/', 'ruby', 'libwww', 'postman',
  ].join('|'),
  'i',
);

export function isAgent(request: Request): boolean {
  const agent = request.headers.get('user-agent')?.trim();
  return !agent || AGENT.test(agent);
}
