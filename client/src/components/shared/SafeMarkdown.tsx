import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { sanitizedMarkdownComponents, sanitizedMarkdownPlugins } from './markdownSanitize';

/**
 * Text a user wrote in markdown (a place's description, its notes), rendered
 * the way the planner shows it: GitHub flavour, line breaks kept, raw HTML
 * shown as text, the rest sanitized, links in a new tab without an opener.
 * Safe for pages strangers see, like a shared trip (#2692).
 */
export function SafeMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={sanitizedMarkdownPlugins}
      components={sanitizedMarkdownComponents}
    >
      {children}
    </Markdown>
  );
}

/**
 * Turns markdown into the HTML {@link SafeMarkdown} renders, for output built as
 * a string such as the PDF export (#2692). It renders through the same
 * pipeline into a detached node, so the sanitizer is the one the app uses and
 * no second markdown library is bundled. Call it outside a render and dispose
 * of it when done; the same text is rendered once.
 */
export function createMarkdownHtml(): { html: (text: string) => string; dispose: () => void } {
  const host = document.createElement('div');
  const root = createRoot(host);
  const done = new Map<string, string>();
  return {
    html: (text) => {
      const known = done.get(text);
      if (known !== undefined) return known;
      flushSync(() => root.render(<SafeMarkdown>{text}</SafeMarkdown>));
      done.set(text, host.innerHTML);
      return host.innerHTML;
    },
    dispose: () => root.unmount(),
  };
}
