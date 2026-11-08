declare module 'katex/contrib/auto-render' {
  interface Delimiter { left: string; right: string; display: boolean }
  interface Options { delimiters?: Delimiter[]; throwOnError?: boolean; ignoredTags?: string[] }
  export default function renderMathInElement(el: HTMLElement, options?: Options): void;
}
