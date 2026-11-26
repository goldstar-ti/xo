"""Database tables.

Usernames, password hashes, the *kind* of each item (appointment, task, ...),
the day it belongs to and reminder times are plain columns. Everything the user
types (titles, notes, the plan, check-in answers) is stored as JSON in Item.payload.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for every table."""

    pass


class User(Base):
    """The account: username and the argon2 hash of the password."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True)
    # Argon2 hash of the password.
    password_hash: Mapped[str] = mapped_column(String(200))
    tz: Mapped[str] = mapped_column(String(64), default="Australia/Perth")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Session(Base):
    """A signed-in browser, stored as a hash of its cookie token."""

    __tablename__ = "sessions"

    # SHA-256 of the cookie value, so a database reader cannot reuse a session.
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Item(Base):
    """One item, found by kind and day."""

    __tablename__ = "items"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    id: Mapped[str] = mapped_column(String(90), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    day: Mapped[date | None] = mapped_column(Date, nullable=True)
    payload: Mapped[Any] = mapped_column(JSONB(none_as_null=True), nullable=True)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("ix_items_user_kind_day", "user_id", "kind", "day"),)


class Reminder(Base):
    """A reminder time for an item."""

    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    item_id: Mapped[str | None] = mapped_column(String(90), nullable=True)
    kind: Mapped[str] = mapped_column(String(30))
    fire_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    repeat: Mapped[str] = mapped_column(String(10), default="none")  # none | daily | weekly
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_reminders_due", "sent_at", "fire_at"),)


class PushSub(Base):
    """A browser push subscription."""

    __tablename__ = "push_subs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
