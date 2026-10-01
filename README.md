# Сервисы демо: обновление политик без даунтайма

Демонстрационный стек для видео «Обновление политик без даунтайма»: версионирование политик доступа, атомарный свап активной версии и мгновенный откат — без рестарта сервисов.

**Стек:** NestJS + gRPC + Angular 22, Docker Compose.

## Состав

| Сервис | Роль | Порт (хост) | Протоколы |
|--------|------|-------------|-----------|
| `pdp` | Policy Decision Point — хранит версии политик, принимает решения | `:3001`, `:50050` | REST `:3001` · gRPC `:50050` |
| `bff` | Policy Enforcement Point — точка входа, JWT-логин, проверка доступа к документам, прокси управления версиями | `:3000` | REST |
| `frontend` | Angular 22 — админка версий + тестовый клиент (nginx) | `:4200` | HTTP |

## Структура

```
services/
├── docker-compose.yml
├── pdp/          — NestJS: версии политик (immutable), staged/active, свап, rollback
├── bff/          — NestJS: PEP, логин + JWT, gRPC-клиент к pdp, REST-прокси
└── frontend/     — Angular 22 (standalone): UI управления версиями и проверки
```

## Взаимодействие

```
Frontend (Angular, :4200)
   │  HTTP + JWT (CORS)
   ▼
bff (PEP, :3000)
   │  gRPC CheckAccess (subject, action, resource) :50050
   ▼
pdp (PDP, :3001/:50050)
   │  читает активную версию политик из памяти
   ▼
versions-store (in-memory: v1..vN, active/staged/archived)
```

**Поток решения по документу:**
1. Пользователь логинится через `bff` (`POST /auth/login`) и получает JWT.
2. Фронт запрашивает документ: `GET /documents/:id` с Bearer-токеном.
3. `bff` (PEP) спрашивает у `pdp` (PDP) по gRPC: «можно ли subject выполнить document:read над этим ресурсом?».
4. `pdp` вычисляет решение по **активной версии** политик и возвращает `allowed`, `reason`, `policyVersion`.
5. `bff` отдаёт документ (или 403) и включает `policyVersion` в ответ — видно, по какой версии принято решение.

**Управление версиями** (через фронт или напрямую):
- `GET /policies` — текущее состояние (activeId + список версий);
- `POST /policies/versions` — создать новую staged-версию (копия активной + правило);
- `POST /policies/activate {versionId}` — атомарный свап активной версии;
- `POST /policies/rollback` — мгновенный откат на предыдущую версию.

`bff` проксирует эти запросы в `pdp` по REST `:3001` (`/policies/...`).

## Запуск

```bash
cd services
docker compose up -d --build
```

После старта:
- фронт: http://localhost:4200
- BFF: http://localhost:3000
- PDP: gRPC localhost:50050, REST localhost:3001

### Тестовые пользователи

| Логин | Пароль | Роль | Доступ к документу finance |
|-------|--------|------|----------------------------|
| `admin` | `admin` | admin | всегда разрешён |
| `viewer` | `viewer` | viewer | разрешён по v1, запрещён по v2 |
| `manager` | `manager` | manager | разрешён |

### Тестовые документы (in-memory)

| id | Название | Отдел |
|----|----------|-------|
| 1 | Бюджет Q1 | finance |
| 3 | Бюджет Q3 | finance |
| 4 | Sales план | sales |
| 6 | IT-инфра | it |
| 7 | Контракт с заказчиком | sales |

## Демо-сценарий (проверен)

1. Поднять стек: `docker compose up -d --build`.
2. Во фронте войти как `viewer`, клик «Бюджет Q1» → `200 OK · policyVersion: 1`.
3. Кнопка «Создать staged-версию (viewer закрыть finance)» → появляется `v2 · staged`, активна по-прежнему `v1`.
4. Повторный запрос «Бюджет Q1» → всё ещё `200 OK · policyVersion: 1` (изменения не влияют на трафик).
5. Кнопка «Активировать staged-версию» → атомарный свап, активна `v2`.
6. Повторный запрос → `403 Forbidden · policyVersion: 2` (viewer закрыт finance).
7. Кнопка «↩ Откат» → активна `v1`.
8. Повторный запрос → `200 OK · policyVersion: 1`.

Ни один контейнер не перезапускался: политики меняются сменой активной версии в памяти PDP.

## API-эндпоинты

### bff (`:3000`)
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/login` | Логин, выдача JWT (`{ username, password }`) |
| GET | `/documents/:id` | Доступ к документу с Bearer-токеном; ответ содержит `policyVersion` |
| GET | `/policies` | Состояние версий (прокси к PDP) |
| POST | `/policies/versions` | Создать staged-версию (прокси) |
| POST | `/policies/activate` | Активировать версию (прокси) |
| POST | `/policies/rollback` | Откат (прокси) |

### pdp REST (`:3001`)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/policies` | Состояние: `{ activeId, versions[] }` |
| POST | `/policies/versions` | Создать версию: `{ description?, rule? }` |
| POST | `/policies/activate` | Свап: `{ versionId }` |
| POST | `/policies/rollback` | Откат на предыдущую активную |

### pdp gRPC (`:50050`)
`PDPService.CheckAccess(CheckInput)` → `CheckAccessResponse { allowed, reason, policyVersion }`

## Примечания

- Версии политик хранятся **в памяти** PDP и генерируются при старте (v1 — активная).
- Docker Compose project name по умолчанию — `services` (от имени папки). Если на тех же портах поднят другой стек (например, `micro-auth-rbac`), сначала остановите его: `docker compose down` в его папке, либо запускайте с `-p policy-hot-reload`.
- Переменные окружения: `JWT_SECRET` (общий), `PDP_SERVICE_URL` (gRPC-адрес для bff), `PDP_HTTP_URL` (REST-адрес pdp для bff) — заданы в `docker-compose.yml`.