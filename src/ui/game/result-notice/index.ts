import type { UIUpdate } from '../adapter';
import './notice.css';

/** Nonmodal, display-only feedback; never dispatches or delays an acknowledgement. */
export function mountResultNotice(root: HTMLElement) {
  const element = document.createElement('section');
  element.className = 'pm-result-notice';
  // Native dialogs occupy the top layer; a manual popover keeps failure results
  // readable above the trial choice dialog without taking focus or blocking input.
  element.popover = 'manual';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  element.hidden = true;
  root.append(element);
  const seen = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function hide() {
    element.hidePopover?.();
    element.hidden = true;
  }
  function reset() {
    clearTimeout(timer);
    seen.clear();
    element.replaceChildren();
    hide();
  }
  return {
    show(results: UIUpdate['results'] = []) {
      const fresh = results.filter((result) => !seen.has(result.id));
      if (!fresh.length) return;
      clearTimeout(timer);
      element.hidePopover?.();
      element.replaceChildren();
      for (const result of fresh) {
        seen.add(result.id);
        const line = document.createElement('p');
        line.textContent = result.text;
        element.append(line);
      }
      element.hidden = false;
      element.showPopover?.();
      timer = setTimeout(hide, 6500);
    },
    reset,
    destroy() {
      reset();
      element.remove();
    },
  };
}
