FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv/xo

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static
COPY scripts ./scripts
COPY content ./content

RUN useradd --system --no-create-home xo
USER xo

# One worker only: the reminder loop and the sign-in throttle live in this process.
CMD ["uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8010", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
