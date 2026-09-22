/**
 * Fix for Windows Chromium rc-trigger popups landing off-screen (left:-11730px).
 *
 * Root cause: rc-align resets popup position via style.left='0' before measuring.
 * In some Chromium builds the browser serializes left/top/right/bottom into the
 * `inset` shorthand inline style, and the longhand style.left no longer overrides it.
 * So rc-align measures the popup at its old off-screen position and writes back
 * -10x viewport coordinates.
 *
 * Fix: a MutationObserver strips the inline `inset` shorthand from rc-trigger popup
 * elements whenever it appears. The longhands (left/top) remain in the CSSOM and
 * continue to control positioning, so rc-align's reset works and final positioning
 * is unaffected.
 *
 * Covers Popover, Dropdown, Select, Tooltip, DatePicker, Cascader, Mentions — every
 * rc-trigger popup — without per-component patches.
 */

const POPUP_SELECTOR =
  '.ant-popover, .ant-dropdown, .ant-dropdown-wrap, .ant-select-dropdown, .ant-tooltip, .ant-picker-dropdown, .ant-cascader-menus, .ant-mentions-dropdown';

function stripInset(el: Element) {
  const s = (el as HTMLElement).style;
  if (s && s.inset) {
    s.inset = '';
  }
}

export function installRcTriggerInsetFix() {
  if (typeof window === 'undefined') return;
  // Guard against re-installation
  if ((window as any).__rcTriggerInsetInstalled) return;
  (window as any).__rcTriggerInsetInstalled = true;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const el = m.target as HTMLElement;
      if (el && el.matches && el.matches(POPUP_SELECTOR)) {
        stripInset(el);
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['style'],
    subtree: true,
  });

  // Also handle popups already in the DOM (edge case)
  document.querySelectorAll(POPUP_SELECTOR).forEach(stripInset);
}
