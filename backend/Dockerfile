# Chromium for the Ad Library collector ships with this image; keep the tag equal to playwright in requirements.txt.
FROM mcr.microsoft.com/playwright/python:v1.63.0-noble

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    PORT=8000

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN mkdir -p /app/data/media

# SQLite database and downloaded images live here: mount a persistent volume on /app/data.
VOLUME ["/app/data"]
EXPOSE 8000
CMD ["sh", "./start.sh"]
