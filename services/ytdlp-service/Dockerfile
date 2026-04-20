FROM python:3.12-slim
ARG CACHEBUST=2

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg git curl unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py app.py ./
COPY modules/ ./modules/
COPY routes/ ./routes/

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
