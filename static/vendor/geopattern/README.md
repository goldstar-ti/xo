GeoPattern 1.2.3 (MIT, see LICENSE), bundled into one browser ES module.

Rebuilt from NOBBIE's frontend/node_modules with:
`bun build node_modules/geopattern/geopattern.js --format=esm --outfile=geopattern.js`
Default export: `GeoPattern` with `generate(seed, { color, generator }).toSvg()`.
