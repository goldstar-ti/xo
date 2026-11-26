# Common mistakes: XO

Load this file when debugging or investigating any issue (loaded by `/debug`). Add a short entry after every incident or non-obvious fix: symptom, cause, fix.

## Environment

**No Node, Bun or app Python on the host.** Builds and tests run in containers. Tailwind builds in the Dockerfile's Bun stage (`make css` runs it in a container for a local copy). Python that imports `app` runs in the app image, not on the host.

**Tests run only on the `xo-test` compose project.** `make test-api` drops every table in its database. Never point pytest at `xo-db`, and never run `pytest` outside `docker-compose.test.yml`. If a run is interrupted, `make test-down` removes the stack.

**Folders at mode 0700 on the build host gave 401s from `StaticFiles`.** The app user in the image could not read them. The Dockerfile now runs `chmod -R a+rX` on the copied files. If static files return 401 or 403, check modes before looking at the code.

## Front end

**`parent.append()` prints `false` and `[object ...]`.** Mixed lists (arrays, `false`, `null`) must go through `put(parent, ...)` from `static/js/util.js`.

**Web Awesome reads its base path when it is imported.** `static/js/kit.js` sets `data-webawesome` first, then imports. Do not hoist the import above that line.

**`webawesome.css` restyles every plain button.** It pulls in `native.css`. Load only `styles/themes/default.css` from Web Awesome.

**A new view or file the app needs offline** goes in `SHELL` in `static/sw.js`, and `CACHE` is bumped. Otherwise a device keeps the old shell.

## Deployment

**A new Cloudflare hostname is negatively cached by the server's resolver.** The server may keep saying it does not exist for a while. Test with `curl --resolve <host>:443:<ip>` using an address looked up from 1.1.1.1.

**The gs-sv-008 tunnel config PUT replaces the whole ingress list.** Read the current list first (`ops/cloudflared-sync-ingress.sh --show` in the BWS repo), add the route, then push. A partial list drops every other hostname on the tunnel.

**Never restart `nobbie-nginx` casually.** It serves NOBBIE too. Edit its config in place, run `nginx -t`, then reload.

## Privacy

**No user text in a log line, a query string or a push payload** (CLAUDE.md rule 1).
