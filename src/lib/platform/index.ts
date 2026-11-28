export function detectPyWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const fromQuery = new URLSearchParams(window.location.search).get('platform') === 'pywebview';
  const fromGlobal = 'pywebview' in window;
  let fromSession = false;
  try {
    if (fromQuery || fromGlobal) {
      window.sessionStorage.setItem('mhl_pywebview', '1');
    }
    fromSession = window.sessionStorage.getItem('mhl_pywebview') === '1';
  } catch {
    fromSession = false;
  }
  return fromQuery || fromGlobal || fromSession;
}

export const isPyWebView = detectPyWebView();
