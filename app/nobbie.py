"""Read-only view of NOBBIE's project tracker (decision D-10).

XO signs in to NOBBIE as a reader account and fetches the tracker items and pick lists with GET
requests only. Nothing is ever written to NOBBIE. The result is kept in memory for
``config.NOBBIE_CACHE_SECONDS`` so opening the Tracker screen does not hit NOBBIE each time.

Off unless ``NOBBIE_URL``, ``NOBBIE_USER`` and ``NOBBIE_PASSWORD`` are all set.
"""

import asyncio
import logging
import time
from typing import Any

import httpx

from . import config

logger = logging.getLogger(__name__)

PAGE_SIZE = 1000
MAX_PAGES = 20
TIMEOUT = httpx.Timeout(20.0, connect=5.0)


class NobbieError(Exception):
    """NOBBIE could not be reached or refused the reader account."""


def enabled() -> bool:
    """Return whether the NOBBIE tracker view is configured.

    Returns:
        True when the URL, user and password are all set.
    """
    return bool(config.NOBBIE_URL and config.NOBBIE_USER and config.NOBBIE_PASSWORD)


class NobbieReader:
    """Signed-in GET access to NOBBIE's tracker, with a short cache.

    Args:
        base_url: NOBBIE's address including its prefix, such as https://host/nobbie.
        username: Reader account.
        password: Reader account password.
        transport: Optional httpx transport (tests pass a mock).
    """

    def __init__(self, base_url: str, username: str, password: str, transport: httpx.AsyncBaseTransport | None = None):
        """Set up the client; nothing is fetched until the first request."""
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=TIMEOUT, transport=transport)
        self._lock = asyncio.Lock()
        self._cache: dict[str, Any] | None = None
        self._cached_at = 0.0

    async def aclose(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    async def _sign_in(self) -> None:
        """Sign in with the single-form post NOBBIE accepts; keeps the session cookie.

        Raises:
            NobbieError: When NOBBIE refuses the account or cannot be reached.
        """
        try:
            r = await self._client.post(
                "/login", data={"username": self.username, "password": self.password, "step": "password"}
            )
        except httpx.HTTPError as err:
            raise NobbieError(f"NOBBIE could not be reached: {type(err).__name__}") from err
        if r.status_code not in (200, 302, 303) or not self._client.cookies:
            raise NobbieError(f"NOBBIE refused the reader account ({r.status_code})")
        logger.info("nobbie signed in")

    async def _get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """GET a JSON document, signing in first when the session has lapsed.

        Args:
            path: Path under the base URL.
            params: Query parameters.

        Returns:
            The decoded JSON.

        Raises:
            NobbieError: When NOBBIE cannot be reached or does not answer with JSON.
        """
        for attempt in (1, 2):
            try:
                r = await self._client.get(path, params=params)
            except httpx.HTTPError as err:
                raise NobbieError(f"NOBBIE could not be reached: {type(err).__name__}") from err
            json_type = r.headers.get("content-type", "").startswith("application/json")
            if r.status_code == 200 and json_type:
                return r.json()
            if attempt == 1 and r.status_code in (200, 302, 303, 401, 403):
                # A redirect or an HTML page is the sign-in form: the session lapsed or never started.
                await self._sign_in()
                continue
            raise NobbieError(f"NOBBIE answered {r.status_code} for {path}")
        raise NobbieError(f"NOBBIE kept asking to sign in for {path}")

    async def _fetch(self) -> dict[str, Any]:
        """Fetch every tracker item and the pick lists.

        Returns:
            ``{"items": [...], "vocab": {...}, "url": base_url}``.
        """
        vocab = await self._get_json("/pm/vocab.json")
        items: list[dict[str, Any]] = []
        page = 1
        while page <= MAX_PAGES:
            data = await self._get_json("/pm/items.json", {"page": page, "size": PAGE_SIZE})
            items.extend(data.get("data") or [])
            if page >= int(data.get("last_page") or 1):
                break
            page += 1
        return {"items": items, "vocab": vocab, "url": self.base_url}

    async def tracker(self, refresh: bool = False) -> dict[str, Any]:
        """Return the cached tracker, fetching it when stale or when asked.

        Args:
            refresh: Fetch even when the cache is fresh.

        Returns:
            The tracker document plus ``fetched_at`` (seconds since the epoch).
        """
        async with self._lock:
            fresh = self._cache is not None and time.time() - self._cached_at < config.NOBBIE_CACHE_SECONDS
            if refresh or not fresh:
                self._cache = await self._fetch()
                self._cached_at = time.time()
                logger.info("nobbie tracker fetched", extra={"nobbie_items": len(self._cache["items"])})
            return {**self._cache, "fetched_at": self._cached_at}

    async def item(self, item_id: int) -> dict[str, Any]:
        """Return one item with its comments and history.

        Args:
            item_id: NOBBIE item id.

        Returns:
            NOBBIE's item document.
        """
        return await self._get_json(f"/pm/items/{item_id}.json")


_reader: NobbieReader | None = None


def reader() -> NobbieReader:
    """Return the shared reader, created on first use.

    Returns:
        The reader.
    """
    global _reader
    if _reader is None:
        _reader = NobbieReader(config.NOBBIE_URL, config.NOBBIE_USER, config.NOBBIE_PASSWORD)
    return _reader
