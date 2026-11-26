// Web Awesome, served from static/vendor/webawesome (built into the image, see the
// Dockerfile). Nothing loads from a CDN: the base path points at our copy, and the
// default icon library reads the Font Awesome Free SVGs in static/vendor/fontawesome.
// The loader then registers each <wa-*> element the first time one appears.

const WA = '/vendor/webawesome';
const FA = '/vendor/fontawesome/svgs';

let loading = null;

// Loads Web Awesome once; later calls return the same promise.
export function loadWebAwesome() {
  if (!loading) loading = start();
  return loading;
}

async function start() {
  if (!document.querySelector('link[data-wa-styles]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // The theme only: webawesome.css would also pull in native.css, which restyles
    // every plain button and input in the app.
    link.href = `${WA}/styles/themes/default.css`;
    link.dataset.waStyles = '';
    document.head.append(link);
  }
  if (!document.querySelector('link[data-wa-tokens]')) {
    // XO's tokens mapped onto Web Awesome's theme: after the theme, so it wins.
    const map = document.createElement('link');
    map.rel = 'stylesheet';
    map.href = '/kit-wa.css';
    map.dataset.waTokens = '';
    document.head.append(map);
  }
  // The loader starts discovering <wa-*> elements as soon as it is imported, before
  // setBasePath could run, so the base path is given through the attribute it reads.
  document.documentElement.dataset.webawesome = WA;
  const wa = await import(`${WA}/webawesome.loader.js`);
  wa.setBasePath(WA);
  wa.registerIconLibrary('default', {
    resolver: (name, family = 'classic', variant = 'solid') => {
      const folder = family === 'brands' ? 'brands' : variant === 'regular' ? 'regular' : 'solid';
      return `${FA}/${folder}/${name}.svg`;
    },
    mutator: (svg) => svg.setAttribute('fill', 'currentColor'),
  });
  return wa;
}
