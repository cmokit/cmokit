// A card's built page, which Wrangler bundles as text (ADR-0049).
declare module '*.html' {
  const page: string;
  export default page;
}
