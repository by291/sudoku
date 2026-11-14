/** Record the trigger as the active element so dialog teardown can restore focus to it. */
export function focusDialogOpener(event?: MouseEvent) {
  if (event?.currentTarget instanceof HTMLElement) {
    event.currentTarget.focus()
  }
}
