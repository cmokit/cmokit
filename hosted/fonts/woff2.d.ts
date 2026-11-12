// A font file, imported as its bytes by wrangler's `Data` module rule.
declare module '*.woff2' {
  const bytes: ArrayBuffer;
  export default bytes;
}
