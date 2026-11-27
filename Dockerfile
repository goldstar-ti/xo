# XO: FastAPI app and static front end in one image.

# -- Tailwind stage --------------------------------------------------------------
# Compiles tailwind/src/tw.css into dist/tw.css. package.json and bun.lock are
# copied first so bun install only re-runs when dependencies change. The content
# scan reads ../../static, so static/ sits at /static beside /tailwind.
FROM oven/bun:1-debian AS css
WORKDIR /tailwind
COPY tailwind/package.json tailwind/bun.lock ./
RUN bun install --frozen-lockfile
# The two component kits, served from static/vendor/ (nothing loads from a CDN):
# Web Awesome's browser build without its docs, types and framework wrappers,
# and the Font Awesome Free SVGs its <wa-icon> reads through static/js/kit.js.
RUN mkdir -p /vendor/webawesome /vendor/fontawesome \
    && cd node_modules/@awesome.me/webawesome \
    && cp -r dist-cdn/chunks dist-cdn/components dist-cdn/events dist-cdn/internal dist-cdn/styles \
         dist-cdn/translations dist-cdn/utilities dist-cdn/webawesome.js dist-cdn/webawesome.loader.js \
         LICENSE.md /vendor/webawesome/ \
    && cd ../../@fortawesome/fontawesome-free \
    && cp -r svgs LICENSE.txt /vendor/fontawesome/
# GridStack for the widget canvas (static/js/grid.js): the one-file browser build,
# which sets window.GridStack, and its stylesheet. Its ES module files import
# without file extensions, so a browser cannot load them without a bundler.
RUN mkdir -p /vendor/gridstack \
    && cd node_modules/gridstack \
    && cp dist/gridstack-all.js dist/gridstack.min.css LICENSE /vendor/gridstack/
# marked, for the Markdown in notes (static/js/markdown.js): the ES module build and its licence.
RUN mkdir -p /vendor/marked \
    && cd node_modules/marked \
    && cp lib/marked.esm.js LICENSE /vendor/marked/
# EasyMDE, the Markdown editor for notes: the one-file browser build (it bundles CodeMirror 5), its stylesheet and licence.
RUN mkdir -p /vendor/easymde \
    && cd node_modules/easymde \
    && cp dist/easymde.min.js dist/easymde.min.css LICENSE /vendor/easymde/
# Phosphor and Tabler icons (static/js/icons.js): the packages go to the app stage, where
# scripts/build_icons.py turns them into JSON maps under static/vendor/icons/.
RUN mkdir -p /iconsrc/@tabler/icons \
    && cp -r node_modules/@phosphor-icons /iconsrc/ \
    && cp -r node_modules/@tabler/icons/icons node_modules/@tabler/icons/icons.json \
         node_modules/@tabler/icons/package.json node_modules/@tabler/icons/LICENSE /iconsrc/@tabler/icons/
COPY tailwind/src ./src
COPY static /static
RUN bun run build

# -- App stage -------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS app

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# curl is used by the compose healthcheck; tzdata for TZ.
RUN apt-get update && apt-get install -y --no-install-recommends curl tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/xo

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static
COPY --from=css /tailwind/dist/tw.css ./static/tw.css
COPY --from=css /vendor ./static/vendor
COPY scripts ./scripts
COPY --from=css /iconsrc /tmp/iconsrc
RUN python scripts/build_icons.py /tmp/iconsrc && rm -rf /tmp/iconsrc
COPY content ./content

# Readable by the app user whatever modes the files had on the build host
# (a checkout with 0700 folders otherwise gives 401s from StaticFiles).
RUN chmod -R a+rX,go-w /srv/xo && useradd --system --no-create-home xo
USER xo

# One worker only: the reminder loop and the sign-in throttle live in this process.
# Requests arrive from nobbie-nginx through Docker's bridge addresses, so only
# those may set the forwarded headers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "172.16.0.0/12"]

# -- Test stage (used by docker-compose.test.yml only) --------------------------------
FROM app AS test
USER root
COPY requirements-dev.txt pytest.ini ./
RUN pip install --no-cache-dir -r requirements-dev.txt
USER xo
