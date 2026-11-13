// Stylesheets the cards and the account page import, which Vite bundles into each page.
declare module '*.css';
// A built file read as text, such as the account page's script handed to the server (ADR-0051).
declare module '*?raw' {
  const text: string;
  export default text;
}
