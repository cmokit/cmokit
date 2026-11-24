// Markdown a person approved, such as a brand context section, shown as formatted text. It builds
// React elements and never renders HTML from the text: raw HTML is dropped, images are left out,
// and only web and mail links are kept.
import Markdown, { type Components } from 'react-markdown';
import { cn } from './cn.ts';

/** Headings inside a section sit below the section's own title, so each is a small bold line. */
const heading = 'font-semibold';

const components: Components = {
  h1: ({ node, ...props }) => <h4 className={heading} {...props} />,
  h2: ({ node, ...props }) => <h4 className={heading} {...props} />,
  h3: ({ node, ...props }) => <h4 className={heading} {...props} />,
  h4: ({ node, ...props }) => <h4 className={heading} {...props} />,
  h5: ({ node, ...props }) => <h5 className={heading} {...props} />,
  h6: ({ node, ...props }) => <h6 className={heading} {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc space-y-1.5 pl-5" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal space-y-1.5 pl-5" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
  blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-line pl-3 text-muted" {...props} />,
  code: ({ node, ...props }) => <code className="rounded bg-sunk px-1 py-0.5 text-[.9em]" {...props} />,
  pre: ({ node, ...props }) => <pre className="overflow-x-auto rounded-md bg-sunk p-3" {...props} />,
  hr: ({ node, ...props }) => <hr className="border-line" {...props} />,
  a: ({ node, href, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow"
      className="text-accent underline decoration-1 underline-offset-[.18em] hover:text-accent-strong" {...props} />
  ),
};

/** Keeps only links a person can safely follow; anything else is shown as its text. */
export function safeUrl(url: string): string | null {
  return /^(https?:|mailto:)/i.test(url.trim()) ? url : null;
}

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-3 break-words', className)}>
      <Markdown components={components} skipHtml disallowedElements={['img']} unwrapDisallowed urlTransform={safeUrl}>
        {text}
      </Markdown>
    </div>
  );
}
