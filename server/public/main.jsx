if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      reg => console.log('SW registered', reg),
      err => console.log('SW failed', err)
    );
  });
}
