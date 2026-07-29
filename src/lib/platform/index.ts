export const isPyWebView = typeof window !== 'undefined' && (
  new URLSearchParams(window.location.search).get('platform') === 'pywebview'
  || 'pywebview' in window
);
