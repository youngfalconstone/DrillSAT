import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from 'react';

/** Ref to the app's single scroll container (`main.page`). */
export const PageScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function usePageScroll() {
  return useContext(PageScrollContext);
}

/**
 * Remember the page scroll position while `active` is true (a list view), scroll to the top when
 * it becomes false (a detail view replaced the list) and restore the remembered position when it
 * becomes true again (back to the list).
 */
export function useRestoreScroll(active: boolean) {
  const pageRef = usePageScroll();
  const saved = useRef(0);
  const wasActive = useRef(active);

  // Track the position only while the list is shown. This effect's cleanup runs before the
  // transition effect below, so the scroll-to-top on leaving never overwrites the saved value.
  useLayoutEffect(() => {
    const el = pageRef?.current;
    if (!el || !active) return;
    const onScroll = () => {
      saved.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [active, pageRef]);

  useLayoutEffect(() => {
    const el = pageRef?.current;
    if (!el) return;
    // behavior: 'instant' also cancels any in-flight smooth scroll from the wheel or keyboard
    if (active && !wasActive.current) el.scrollTo({ top: saved.current, behavior: 'instant' }); // back to the list
    else if (!active && wasActive.current) el.scrollTo({ top: 0, behavior: 'instant' }); // into the detail view
    wasActive.current = active;
  }, [active, pageRef]);
}
