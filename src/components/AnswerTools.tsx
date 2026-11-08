import { useEffect, useRef, type RefObject } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import { CloseIcon } from './icons';

/**
 * Bluebook-style answer tools: passage highlighting and the math reference sheet. (The answer eliminator lives
 * in QuestionView, next to the choices.)
 *
 * Highlights use the CSS Custom Highlight API, so the question HTML (MathML, SVG) is never modified. They are
 * stored as character offsets into the text of the question container, so they survive re-rendering and, for
 * tests in progress, an app restart.
 */
const HL_NAME = 'drillsat-hl';

type Win = typeof window & { Highlight?: new (...r: Range[]) => unknown; CSS: { highlights?: Map<string, unknown> } };

function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text);
  return out;
}

/** Offset of (node, offset) within the concatenated text of root, or -1. */
function toOffset(root: Node, node: Node, offset: number): number {
  let acc = 0;
  for (const t of textNodes(root)) {
    if (t === node) return acc + offset;
    acc += t.data.length;
  }
  // element boundary: count text before the child at `offset`
  if (node.nodeType === Node.ELEMENT_NODE && root.contains(node)) {
    const r = document.createRange();
    r.setStart(root, 0);
    r.setEnd(node, offset);
    return r.toString().length;
  }
  return -1;
}

function toRange(root: Node, start: number, end: number): Range | null {
  let acc = 0;
  const r = document.createRange();
  let started = false;
  for (const t of textNodes(root)) {
    const len = t.data.length;
    if (!started && start <= acc + len) {
      r.setStart(t, Math.max(0, start - acc));
      started = true;
    }
    if (started && end <= acc + len) {
      r.setEnd(t, Math.max(0, end - acc));
      return r;
    }
    acc += len;
  }
  return null;
}

export function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

export function highlightSupported(): boolean {
  const w = window as Win;
  return typeof w.Highlight === 'function' && !!w.CSS?.highlights;
}

/** Paint the ranges and, while `active`, turn selections into highlights and clicks into removals. */
export function useHighlighter(
  root: RefObject<HTMLElement | null>,
  ranges: [number, number][],
  active: boolean,
  onChange: (r: [number, number][]) => void,
  repaintKey: string,
) {
  useEffect(() => {
    const w = window as Win;
    const el = root.current;
    if (!el || !highlightSupported()) return;
    const rs = ranges.map(([a, b]) => toRange(el, a, b)).filter((r): r is Range => !!r);
    w.CSS.highlights!.set(HL_NAME, new w.Highlight!(...rs));
    return () => {
      w.CSS.highlights!.delete(HL_NAME);
    };
  }, [root, ranges, repaintKey]);

  useEffect(() => {
    const el = root.current;
    if (!el || !active) return;
    const up = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      if (!el.contains(r.commonAncestorContainer)) return;
      const a = toOffset(el, r.startContainer, r.startOffset);
      const b = toOffset(el, r.endContainer, r.endOffset);
      if (a < 0 || b < 0) return;
      if (b > a) {
        onChange(mergeRanges([...ranges, [a, b]]));
        sel.removeAllRanges();
      } else {
        // a click on highlighted text removes that highlight
        const hit = ranges.find(([x, y]) => a >= x && a <= y);
        if (hit) onChange(ranges.filter((x) => x !== hit));
      }
    };
    el.addEventListener('mouseup', up);
    return () => el.removeEventListener('mouseup', up);
  }, [root, active, ranges, onChange]);
}

const SHEET: { title: string; items: string[] }[] = [
  { title: 'Circle', items: ['A = \\pi r^2', 'C = 2\\pi r'] },
  { title: 'Rectangle', items: ['A = \\ell w'] },
  { title: 'Triangle', items: ['A = \\tfrac{1}{2} b h'] },
  { title: 'Right triangle', items: ['c^2 = a^2 + b^2'] },
  { title: 'Special right triangles', items: ['30^\\circ\\!-60^\\circ\\!-90^\\circ:\\; x,\\; x\\sqrt{3},\\; 2x', '45^\\circ\\!-45^\\circ\\!-90^\\circ:\\; s,\\; s,\\; s\\sqrt{2}'] },
  { title: 'Rectangular prism', items: ['V = \\ell w h'] },
  { title: 'Cylinder', items: ['V = \\pi r^2 h'] },
  { title: 'Sphere', items: ['V = \\tfrac{4}{3} \\pi r^3'] },
  { title: 'Cone', items: ['V = \\tfrac{1}{3} \\pi r^2 h'] },
  { title: 'Pyramid', items: ['V = \\tfrac{1}{3} \\ell w h'] },
];

/** The SAT math reference sheet. */
export function ReferenceSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) renderMathInElement(ref.current, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false });
  }, []);
  // Registered once: App's own Escape handler updates the store, which re-renders this component during the
  // same keydown dispatch; a listener re-registered then would be removed before it runs.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal refsheet" role="dialog" aria-label="Reference sheet" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="card-head"><h2>Reference</h2><button className="iconbtn" aria-label="Close reference sheet" onClick={onClose}><CloseIcon /></button></div>
        <div className="refgrid">
          {SHEET.map((s) => (
            <div key={s.title} className="refitem">
              <div className="muted small">{s.title}</div>
              {s.items.map((m) => <div key={m}>{`$${m}$`}</div>)}
            </div>
          ))}
        </div>
        <ul className="refnotes small">
          <li>The number of degrees of arc in a circle is 360.</li>
          <li>The number of radians of arc in a circle is $2\pi$.</li>
          <li>The sum of the measures in degrees of the angles of a triangle is 180.</li>
        </ul>
      </div>
    </div>
  );
}
