import { useEffect, useRef } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';

interface Props {
  html: string;
  /** AI content uses $...$ LaTeX; official content is MathML rendered natively by Chromium. */
  latex?: boolean;
  className?: string;
}

/** Renders a bank/AI HTML fragment (MathML, inline SVG, tables, data-URI images). */
export default function QuestionHtml({ html, latex, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (latex && ref.current) {
      try {
        renderMathInElement(ref.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
          ],
          throwOnError: false,
        });
      } catch {
        /* leave raw text */
      }
    }
  }, [html, latex]);
  return <div ref={ref} className={'qhtml ' + (className ?? '')} dangerouslySetInnerHTML={{ __html: html }} />;
}
