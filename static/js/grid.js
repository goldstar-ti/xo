// GridStack and the canvas styles, served from static/vendor/gridstack (built into the
// image, see the Dockerfile). Loaded on demand by static/js/canvas.js, so screens without
// a canvas never fetch them. GridStack's one-file browser build sets window.GridStack.

const GS = '/vendor/gridstack';

let loading = null;

function sheet(href, mark) {
  if (document.querySelector(`link[${mark}]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute(mark, '');
  document.head.append(link);
}

// Loads GridStack once; later calls return the same promise, which resolves to the GridStack class.
export function loadGridStack() {
  if (!loading) {
    sheet(`${GS}/gridstack.min.css`, 'data-gs-styles');
    // XO's canvas, widget and tab styles: after GridStack's, so they win.
    sheet('/canvas.css', 'data-canvas-styles');
    loading = window.GridStack
      ? Promise.resolve(window.GridStack)
      : new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${GS}/gridstack-all.js`;
        script.onload = () => resolve(window.GridStack);
        script.onerror = () => { loading = null; reject(new Error('GridStack did not load')); };
        document.head.append(script);
      });
  }
  return loading;
}
