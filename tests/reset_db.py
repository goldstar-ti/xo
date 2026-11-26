"""Empty every table in the throwaway test database, so the next browser run starts from nothing.

Run between the three tests/e2e.py runs, which each create the one account. Reads DATABASE_URL.
"""

import asyncio
import os

import asyncpg


async def main():
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)
    names = [r["tablename"] for r in await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")]
    if names:
        await conn.execute("TRUNCATE " + ", ".join(f'"{n}"' for n in names) + " RESTART IDENTITY CASCADE")
    await conn.close()
    print("database emptied:", ", ".join(names))


asyncio.run(main())
