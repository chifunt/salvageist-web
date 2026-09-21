/* A static host: no accounts, analytics, remote code, or gameplay changes. */
const canvas = document.querySelector('#game');
const loading = document.querySelector('#loading');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const retry = document.querySelector('#retry');
const diagnostics = document.querySelector('#diagnostics');
const log = document.querySelector('#diagnostic-log');
const diagnosticMode = new URLSearchParams(location.search).has('diagnostics');
diagnostics.hidden = !diagnosticMode;
const messages = [];
function record(message) {
  messages.push(String(message));
  if (messages.length > 100) messages.shift();
  if (diagnosticMode) log.textContent = messages.join('\n');
}
function fail(message) {
  loading.hidden = false;
  status.textContent = message;
  retry.hidden = false;
  record(message);
}
retry.addEventListener('click', () => location.reload());
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', () => canvas.focus());
window.addEventListener('error', event => record(event.message));
window.addEventListener('unhandledrejection', event => record(event.reason));
document.querySelector('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector('main').requestFullscreen();
    canvas.focus();
  } catch (error) { record(error); }
});

async function start() {
  // Cap the render buffer, not the CSS/UI size: Retina displays otherwise render
  // millions of unnecessary pixels in a deliberately low-resolution art style.
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 1.25, 1600 / innerWidth, 1000 / innerHeight);
  const response = await fetch('build.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Build manifest unavailable (${response.status}).`);
  const config = await response.json();
  config.canvas = canvas;
  config.devicePixelRatio = pixelRatio();
  config.print = message => { console.log(message); record(message); };
  config.printErr = message => { console.error(message); record(message); };
  config.showBanner = (message, kind) => {
    record(`${kind}: ${message}`);
    if (kind === 'error') fail(message);
  };
  const loader = document.createElement('script');
  loader.src = config.loaderUrl;
  await new Promise((resolve, reject) => {
    loader.onload = resolve;
    loader.onerror = () => reject(new Error('Could not download the game loader. Please reconnect.'));
    document.body.appendChild(loader);
  });
  const instance = await createUnityInstance(canvas, config, value => {
    progress.value = value;
    status.textContent = value < .9 ? `Receiving machines… ${Math.round(value * 100)}%` : 'Bringing the foundry online…';
  });
  loading.hidden = true;
  canvas.focus();
  record('Unity instance ready.');
  window.addEventListener('resize', () => { instance.Module.devicePixelRatio = pixelRatio(); });
  // Only browser-owned frame delivery, not simulation timing. Useful when testing
  // the exact public artifact without shipping a gameplay/debug-command endpoint.
  if (diagnosticMode) {
    let previous = performance.now();
    const frames = [];
    function measure(now) {
      frames.push(now - previous);
      previous = now;
      if (frames.length === 600) {
        frames.sort((a, b) => a - b);
        record(`Browser frames (600): median ${frames[300].toFixed(1)} ms, p95 ${frames[570].toFixed(1)} ms; buffer ${canvas.width}×${canvas.height}`);
        frames.length = 0;
      }
      requestAnimationFrame(measure);
    }
    requestAnimationFrame(measure);
  }
}
start().catch(error => fail(`Uplink failed: ${error.message || error}`));
