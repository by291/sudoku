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

export function isKeyboardOwnedByControl(event: KeyboardEvent): boolean {
  const target = event.target

  return (
    event.defaultPrevented ||
    // Closed menu transitions must not block board input.
    !!document.querySelector(
      'dialog[open], [aria-modal="true"], [role="menu"][aria-hidden="false"]',
    ) ||
    (target instanceof Element && !!target.closest(INTERACTIVE_CONTROL))
  )
}
