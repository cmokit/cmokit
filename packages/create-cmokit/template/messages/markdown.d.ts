// Wrangler bundles each message template as text (the Text rule in lifecycle/wrangler.jsonc).
declare module '*.md' {
  const text: string;
  export default text;
}
