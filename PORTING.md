# Porting Family Connect to Success Academy

> **Status: instructions + inert templates only.** Nothing here is wired into the running app.
> A future agent (or engineer) can lift these templates to stand the app up inside SA's stack.
> The current local app (Node + `node:sqlite` + SSE, no auth) keeps working untouched.

This guide is the output of scanning the `successacademycharterschools` GitHub org for the
conventions we should adopt, and maps our prototype onto them.

---

## 1. What was scanned (and why these)

| Repo | Stack | Why it's the reference |
|---|---|---|
| **`xogito-sa-mobile-family-app-api`** | Python 3.13 · FastAPI · async SQLAlchemy + asyncpg · Alembic · Redis · structlog · `uv` | SA's **real** Family App backend — the authoritative production blueprint. Its `CLAUDE.md` documents every pattern. |
| **`xogito-mobile-family-app`** | Expo / React Native · TypeScript · Bitrise CI | SA's real Family App **frontend** — the mobile shipping path (App Store via Bitrise). |
| **`sa-ai-oral-exams`** (also cloned locally) | Python · FastAPI · Docker · served on the **SA AI sandbox** behind Nginx | A POC web app SA already **productionized**; its `main.py` literally *"replaces the original Node `server.cjs`"* — our exact migration, the lightweight way. |
| **`infrastructure`** | Terraform (HCL) · Orion deploy configs · Datadog · golden Docker images | How SA **stands services up** on AWS. |
| **`success-academies`** | Salesforce / Apex | The system of record for guardians, scholars, schools — what auth and rosters resolve against. |

**Headline:** SA backends are **FastAPI + Postgres + Redis on Docker/AWS**, deployed via **Orion + Terraform**, observed with **Datadog**, and identity is **Salesforce-backed**. Our prototype already matches the *shape* (SPA + JSON API + ops + SSE); porting is mostly swapping the substrate.

---

## 2. SA engineering conventions to adopt

Pulled from `xogito-sa-mobile-family-app-api/CLAUDE.md` unless noted.

- **Package manager `uv`** (not pip/poetry). `pyproject.toml` + `uv.lock`, `uv sync --frozen`, `[project.scripts]` entrypoints (`uv run local|dev|migrate`).
- **App factory + lifespan**: `create_app()` builds the FastAPI app; a `lifespan` context manager opens/closes DB + Redis.
- **Feature-sliced layout** — the big one. Each domain is a self-contained module:
  ```
  features/<feature>/
    api/router.py        # FastAPI APIRouter, thin — calls the service
    api/responses.py     # Pydantic response models (.from_model())
    service.py           # business logic; holds repos, owns the txn boundary
    repo.py              # SQLAlchemy queries; owns the AsyncSession + commit()
    models.py            # ORM models
    cache.py             # optional read-through Redis cache (fail-open)
    constants.py
  ```
  Cross-cutting code lives in `core/{db,cache,clients,shared}` and `config/`.
- **Config via `pydantic-settings`**: a `Settings(BaseSettings)` singleton behind `@lru_cache get_settings()`. **Env vars mirror `.env.example` exactly.** Secrets are `Field(min_length=1)` with *no default* so a blank value **fails fast at startup**. Non-env settings are `@property`s; per-env values key off an `AppEnv` enum.
- **DB conventions**: async SQLAlchemy 2.0 + asyncpg; a dedicated Postgres **schema**; a deterministic **naming convention** (`pk_`/`fk_`/`uq_`/`ix_`/`ck_`); a `DefaultColumns` mixin (UUID `id`, `created_at`/`updated_at`); request-scoped `get_async_session` unit-of-work that **rolls back on any exception**. **Alembic migrations are hand-written plain SQL** (no `--autogenerate`), with sequential 4-digit rev ids.
- **Repos own the session + an explicit `commit()`; services hold repos, never a raw session.** DI providers are the composition root that build repos and inject them.
- **Structured error envelope**: every custom exception extends `AppError` (`error_code`/`error_type`/`status_code`); a catch-all handler serializes an `ErrorResponse` Pydantic model; a global `SQLAlchemyError` handler returns one generic `503 DATABASE_UNAVAILABLE`. Wire shape: `{error_code, error_type, exception, message, details, request_id}`.
- **Pure-ASGI middleware stack** (no `BaseHTTPMiddleware`): `Logging → Timeout → Auth → app`. `RequestTimeoutMiddleware` bounds each request with `asyncio.timeout` (25s prod). Request id `x-xgsa-request-id` is bound into structlog contextvars.
- **Auth = Salesforce guardian identity** (`features/auth/middleware.py`): Bearer token → SHA-256 → **fail-open Redis cache** → `SalesforceAccessService.get_guardian_scholars()`; attaches a frozen `CurrentGuardian` to `request.state`. `PUBLIC_PATHS` (`/health`, `/ready`, docs) bypass. **This is why SA has "no separate login" — identity rides on Salesforce.** (We deliberately skipped auth; this is exactly where it slots in.)
- **Read-through caching per feature** (`features/<f>/cache.py`) wrapping a Redis `HashStore`, **fail-open** (Redis down → cache misses, never an error). Redis runs in binary mode (`decode_responses=False`) with `ormsgpack`.
- **structlog logging**: dotted event names `<feature>.<layer>.<method>.<outcome>`; Router logs `WARNING` on raised domain errors, Service logs `INFO` start/outcome, Repo logs `DEBUG`. **Never log emails, phones, or raw rows** (FERPA-relevant).
- **External HTTP clients** in `core/clients/` (Salesforce, Monday) with split connect/read timeouts and **retry on idempotent methods only** (never retry a write).
- **Docs exposure policy** (`core/shared/docs.py`): `/docs` `/redoc` `/openapi.json` off by default; local → open, staging → HTTP Basic Auth, prod → 404.
- **`/health` + `/ready`** endpoints (sandbox app uses `/api/health` + `/api/ping`).
- **Testing**: `pytest` + `pytest-asyncio`, **`--cov-fail-under=80`** gate, integration tests behind `RUN_INTEGRATION=1`, files named `*_test.py`.
- **Docker**: multi-stage `python:3.13-slim` + `uv`, run under **gunicorn with `UvicornWorker`** (`workers = 2*cpu`, `max_requests` recycling).
- **Deploy**: container → ECR; **Orion** deployment config (`.orion.nonprod.yaml`) + a **Terraform module** under `infrastructure/modules/`; **Datadog** dashboards. Frontend (if native) ships via **Bitrise**.

---

## 3. Mapping — Family Connect (today) → SA target

| Today (prototype) | SA target | Notes |
|---|---|---|
| `server.cjs` (Node `http`, hand-rolled routing) | `main.py` `create_app()` + `features/*/api/router.py` | `sa-ai-oral-exams` did this exact swap. |
| `OPS` object (mutation handlers) | `features/<f>/service.py` methods | One service method per op; group by domain (feed, messages, alerts, signups, forms, events, records). |
| `db.cjs` (`node:sqlite`, doc tables) | `core/db/` + `features/<f>/models.py` + `repo.py` | SQLite doc-tables → real SQLAlchemy models on Postgres. Hand-written Alembic migrations. |
| `/api/state` (whole DB to client) | scoped per-feature endpoints | Already prototyped: `api/queries.cjs` (`/api/feed`, `/api/conversations`, …). This is the pattern SA expects — never ship the whole dataset. |
| `/api/mutate {op,payload}` | typed REST routes per feature | Replace the generic op with explicit routes + Pydantic request/response models. |
| `/api/events` (SSE, single process) | Redis pub/sub → SSE, or push via the mobile app | Keep SSE for web; back it with Redis so it works across gunicorn workers/instances. |
| in-memory cache | Redis `HashStore` read-through (fail-open) | `core/cache/`. |
| `api/fanout.cjs` (blast queue) | a worker + **AWS SQS/SNS** (they already use `aioboto3`) → Twilio/SES/APNs | The genuinely scale-sensitive piece; runs as a separate worker/lambda. |
| persona via `?me` (no auth) | `GuardianAuthMiddleware` (Salesforce) | `features/auth/`. Staff identity → SA SSO; guardian identity → Salesforce. |
| `seed.cjs` / `seed-scale.cjs` | Alembic data migration or a fixtures script | Real rosters come from Salesforce/eSchoolData sync, not a seed. |
| client `store.js` (server/device modes) | keep almost as-is | Point `fetch` at the mounted API base (see §4 Option A note). The SPA transfers unchanged. |

---

## 4. Two standup paths

### Option A — SA AI sandbox (fast; mirrors `sa-ai-oral-exams`)
Lowest lift, gets it live at SA quickly. FastAPI serves our **existing static SPA** and ports the ops to routes; persistence can start as SQLite/a volume and graduate to Postgres later.

**Steps (a future agent can run):**
1. `uv init`; add deps `fastapi[standard]`, `uvicorn`, `gunicorn`, `pydantic-settings` (+ `sqlalchemy[asyncio] asyncpg alembic` when moving off SQLite).
2. Create `app/main.py` (template below) that mounts our `public/` as static at `/` (`html=True`, **mounted last**) and includes the API routers.
3. Port `OPS` → `app/routes/*.py` handlers (1:1 with the op names; reuse the exact semantics from `server.cjs`).
4. Client tweak: compute the API base from `window.location.pathname` (the sandbox mounts under a path like `/family-connect/` behind Nginx) instead of hard `/api`.
5. `Dockerfile` (template below) → push to ECR → request a sandbox route (`/family-connect/`) from the SA AI platform team, same as `sa-ai-oral-exams` got `/oral-exams/`.

### Option B — production family-app conventions (`xogito-sa-mobile-family-app-api`)
The real thing, for when this becomes a first-class product. Feature-sliced FastAPI + Postgres + Redis + SF auth + Orion/Terraform/Datadog. Higher lift; mechanical once the patterns are followed.

**Steps:**
1. Scaffold the package layout in §2; copy `config/settings.py`, `core/db/`, `core/cache/`, `core/shared/` patterns from the family-app API repo.
2. Model each domain as a `features/<f>/` slice (start with `feed`, `alerts`, `messages`).
3. Hand-write Alembic migrations for the schema (sequential rev ids, plain SQL).
4. Wire `GuardianAuthMiddleware` to Salesforce for guardian identity; staff via SA SSO.
5. Add `.orion.nonprod.yaml` + a Terraform module under `infrastructure/modules/family-connect/` + a Datadog dashboard.
6. CI: GitHub Actions running `uv run pytest` with the 80% coverage gate.

---

## 5. Inert templates (lift these — none are active)

### A · `app/main.py` (sandbox path — mirrors `sa-ai-oral-exams`)
```python
# TEMPLATE — Option A. FastAPI app that serves the existing Family Connect SPA
# and exposes the ported ops. Replaces server.cjs (cf. sa-ai-oral-exams/app/main.py).
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings, STATIC_DIR
from app.routes import feed, messages, alerts, signups, forms, events, records, blast

def create_app() -> FastAPI:
    app = FastAPI(title="SA Family Connect", version="0.1.0",
                  docs_url=None, redoc_url=None, openapi_url=None)  # re-add per env policy
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins,
                       allow_methods=["GET", "POST", "PUT", "OPTIONS"], allow_headers=["Content-Type"])
    for r in (feed, messages, alerts, signups, forms, events, records, blast):
        app.include_router(r.router)

    @app.get("/api/health")
    async def health() -> dict:
        return {"status": "healthy", "version": app.version}

    # SPA mounted LAST so /api/* wins. Serves our existing public/ unchanged.
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
    return app

app = create_app()
```

### B · `features/feed/api/router.py` (production path — mirrors the family-app API)
```python
# TEMPLATE — Option B. Thin router → service; scoped + paginated (never the whole dataset).
from fastapi import APIRouter, Query
from app.features.api_dependencies import FeedServiceDep, CurrentGuardianDep
from app.features.feed.api.responses import FeedPageResponse

router = APIRouter(prefix="/feed", tags=["feed"])

@router.get("", summary="Paginated feed visible to the caller")
async def get_feed(
    service: FeedServiceDep,
    guardian: CurrentGuardianDep,                 # Salesforce-resolved identity
    limit: int = Query(20, le=50),
    before: str | None = None,                    # ISO cursor
) -> FeedPageResponse:
    page = await service.visible_feed(guardian=guardian, limit=limit, before=before)
    return FeedPageResponse.from_model(page)
```
```python
# TEMPLATE — features/feed/service.py  (holds repos, owns txn boundary; logs INFO start/outcome)
class FeedService:
    def __init__(self, repo: "FeedRepo", users: "UserRepo") -> None:
        self._repo, self._users = repo, users
    async def visible_feed(self, *, guardian, limit, before):
        posts = await self._repo.visible_to(guardian.guardian_contact_id, limit=limit, before=before)
        # batch-resolve authors so the client needs no global user list
        authors = await self._users.by_ids({p.author_id for p in posts})
        return FeedPage(items=[embed_author(p, authors) for p in posts], ...)
```

### C · `config/settings.py` (mirrors family-app API)
```python
# TEMPLATE — pydantic-settings singleton; env vars mirror .env.example; secrets fail fast.
from functools import lru_cache
from enum import Enum
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class AppEnv(str, Enum):
    local = "local"; staging = "staging"; production = "production"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: AppEnv = AppEnv.local
    db_host: str = "localhost"; db_port: int = 5432
    db_name: str = "postgres"; db_user: str = "postgres"; db_pass: str = "postgres"
    redis_cache_host: str = "localhost"; redis_cache_port: int = 6379
    sf_base_url: str = Field(min_length=1)      # required, no default → fail fast
    # ... add fields ONLY alongside an .env.example entry ...

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### D · `Dockerfile` (multi-stage + gunicorn/uvicorn — mirrors both repos)
```dockerfile
# TEMPLATE
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev
EXPOSE 8000
CMD ["uv", "run", "gunicorn", "app.main:create_app()", \
     "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000"]
```

### E · `.env.example` (the contract — every var the app reads)
```ini
# TEMPLATE
APP_ENV=local
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASS=postgres
REDIS_CACHE_HOST=localhost
REDIS_CACHE_PORT=6379
SF_BASE_URL=                 # Salesforce instance URL (guardian auth + rosters) — required
DOCS_USERNAME=               # staging only
DOCS_PASSWORD=               # staging only
```

### F · `infra/.orion.nonprod.yaml` (deploy — see `infrastructure/`)
```yaml
# TEMPLATE — match the shape of existing services in successacademycharterschools/infrastructure.
# A future agent should copy a nearby service's Orion config + Terraform module and adjust:
service: family-connect
image: <ecr-repo>/family-connect
port: 8000
health_check: /api/health
env: nonprod
# + a Terraform module at infrastructure/modules/family-connect/ and a Datadog dashboard.
```

---

## 6. Next-agent checklist (mechanical wiring)

1. Pick a path (A sandbox = fast demo at SA; B = production). For a boss eval, **A** gets it on real SA infra fastest.
2. `uv init` + deps; drop in templates C, D, E.
3. **Port `OPS` → routes/services**, one domain at a time, reusing the exact semantics in `server.cjs`/`db.cjs` (they're the spec).
4. Persistence: start on SQLite/volume (A) or Postgres + Alembic (B). Migrations hand-written, plain SQL, sequential rev ids.
5. Copy `public/` in as static (A) or keep the SPA as the web client hitting the API (B). Make the client API base path-relative.
6. **Auth**: leave open for the demo (matches our current no-auth), or wire `GuardianAuthMiddleware` → Salesforce when identity is required.
7. Logging: structlog, dotted events, **no PII**. Errors: `AppError` + envelope.
8. Tests: `pytest` ≥80%. CI: GitHub Actions.
9. Deploy: Dockerfile → ECR → Orion config + Terraform module + Datadog (template F).

---

## 7. What transfers free vs. what changes

**Free:** the entire client SPA (HTML/CSS/JS), the data model, the op semantics, the scoped-endpoint pattern (already prototyped in `api/queries.cjs`), the fan-out design (`api/fanout.cjs`).

**Changes:** Node `http` → FastAPI; `node:sqlite` → Postgres + Alembic; single-process SSE → Redis-backed; in-memory cache → Redis; `?me` → Salesforce guardian auth; seed → Salesforce/eSD roster sync; ad-hoc deploy → Orion + Terraform + Datadog.

**Compliance:** student data is **FERPA**-regulated — adopt SA's "never log PII" rule, the docs-exposure policy, and least-privilege DB/secret handling from day one.
