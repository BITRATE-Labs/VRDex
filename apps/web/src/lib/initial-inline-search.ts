const fieldSelector = "input[data-inline-search]";
let initialSearch: { input: HTMLInputElement; href: string; focused: boolean } | undefined;
let stopCapture: (() => void) | undefined;

export function captureInitialInlineSearch() {
  const remember = (input: HTMLInputElement) => {
    initialSearch = { input, href: location.href, focused: document.activeElement === input };
  };
  const input = document.querySelector<HTMLInputElement>(fieldSelector);
  if (input) {
    remember(input);
    return;
  }
  if (document.readyState !== "loading") return;

  // An async bootstrap can run before the streamed form reaches the browser.
  const onInput = (event: Event) => {
    if (!event.isTrusted || !(event.target instanceof HTMLInputElement) || !event.target.matches(fieldSelector)) return;
    remember(event.target);
    stop();
  };
  const stop = () => {
    document.removeEventListener("input", onInput, true);
    window.removeEventListener("load", onLoad);
    stopCapture = undefined;
  };
  const onLoad = () => {
    const field = document.querySelector<HTMLInputElement>(fieldSelector);
    if (field) remember(field);
    stop();
  };
  stopCapture = stop;
  document.addEventListener("input", onInput, true);
  window.addEventListener("load", onLoad, { once: true });
}

export function restoreInitialInlineSearch(input: HTMLInputElement) {
  stopCapture?.();
  const initial = initialSearch;
  initialSearch = undefined;
  if (!initial || initial.href !== location.href || initial.input === input || initial.input.isConnected
    || input.value !== input.defaultValue || initial.input.value === initial.input.defaultValue) return;

  // A hydration bailout can replace the server-rendered node. Its DOM value still contains the edits.
  input.value = initial.input.value;
  if (initial.focused && document.activeElement === document.body) {
    input.focus({ preventScroll: true });
    const { selectionStart, selectionEnd, selectionDirection } = initial.input;
    if (selectionStart !== null && selectionEnd !== null) {
      input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
    }
  }
}
