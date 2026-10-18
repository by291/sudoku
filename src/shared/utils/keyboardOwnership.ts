// Composite controls own their input and typeahead, including portaled menus.
const INTERACTIVE_CONTROL = [
  'input',
  'textarea',
  'select',
  '[contenteditable]',
  'dialog',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="radiogroup"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
].join(',')

function hasOpenMenu(): boolean {
  const triggers = [...document.querySelectorAll('[aria-haspopup="menu"][aria-controls]')]

  return [...document.querySelectorAll('[role="menu"][aria-hidden="false"]')].some((menu) => {
    const trigger = triggers.find((element) =>
      element.getAttribute('aria-controls')?.split(/\s+/).includes(menu.id),
    )

    // Naive UI 2.45.3 can retain aria-hidden=false during leave. The trigger owns open state;
    // an outgoing menu must not swallow the next board key after Escape.
    return !trigger || trigger.getAttribute('aria-expanded') !== 'false'
  })
}

export function isKeyboardOwnedByControl(event: KeyboardEvent): boolean {
  const target = event.target

  return (
    event.defaultPrevented ||
    !!document.querySelector('dialog[open], [aria-modal="true"]') ||
    hasOpenMenu() ||
    (target instanceof Element && !!target.closest(INTERACTIVE_CONTROL))
  )
}
