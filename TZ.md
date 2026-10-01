# ТЗ на демонстрационные сервисы

**Проект:** policy-hot-reload
**Назначение:** live-демонстрация безопасного обновления политик без даунтайма: версионирование, staged-версия, атомарная активация (swap) и rollback.

## Состав и порты

| Сервис | Назначение | REST | gRPC | Web |
|--------|-----------|------|------|-----|
| pdp | PDP: версии политик (active/staged), атомарный свап, rollback | 3001 | 50050 | — |
| bff | BFF (PEP): точка входа, прокси управления версиями | 3000 | — | — |
| frontend | Angular 22 SPA: админка политик + тестовый запрос | — | — | 4200 (nginx) |

## Внутренний транспорт

- Frontend → BFF: HTTP (CORS включён в BFF), все вызовы через `http://localhost:3000`.
- BFF → pdp (решения): gRPC `pdp.PDPService.CheckAccess` (proto в `pdp/src/proto/pdp.proto`).
- BFF → pdp (управление версиями): HTTP REST, `http://pdp:3001` (`/policies/...`).

## Модель версий политик

Политика — immutable-снимок: `{ id, status: 'active' | 'staged' | 'archived', description, rules[] }`.

Правило: `{ action, role?, department?, allow, description }`.
Логика решения (в PDP, по активной версии):
1. `role === 'admin'` → allow.
2. Ищем самое специфичное правило: сначала `role + department`, затем только `role`.
3. Если правило найдено — возвращаем его `allow`.
4. Если правил нет — default allow (для наглядности демо).

## Эндпоинты BFF (:3000)

| Метод/путь | Описание |
|-----------|----------|
| POST /auth/login | Логин (admin/viewer/manager), возвращает JWT с role |
| GET /documents/:id | Тестовый запрос: решение PDP + policyVersion |
| GET /policies | Список версий политик + активная версия |
| POST /policies/versions | Создать staged-версию из активной (+ правило) |
| POST /policies/activate | Активировать версию (атомарный свап) body: { versionId } |
| POST /policies/rollback | Откат на предыдущую активную версию |

## Эндпоинты pdp REST (:3001)

| Метод/путь | Описание |
|-----------|----------|
| GET /policies | Список версий + activeId |
| POST /policies/versions | Создать staged-версию (копия активной + новое правило) |
| POST /policies/activate | Атомарный свап activeId |
| POST /policies/rollback | Откат на предыдущую активную |

## Данные (in-memory, генерируются при старте)

- Учётные записи BFF: `admin/admin` (role: admin), `viewer/viewer` (role: viewer, department: sales), `manager/manager` (role: manager, department: it).
- Документы BFF: id 1..7 с department (finance/sales/it).
- Стартовая версия политик v1 (active): «все роли могут читать документы» (default allow), для demo правило "admin всегда allow".

## Тестовые сценарии (для видео, выполняются через фронт http://localhost:4200)

1. **Базовая версия:** viewer → документ finance → 200, в ответе `policyVersion: 1`.
2. **Staged + активация:** «Создать версию из текущей» → v2 (staged), запросы всё ещё v1.
   «Активировать v2» (добавлено правило deny viewer/finance) → viewer → документ finance → 403, `policyVersion: 2`.
3. **Rollback:** «Откатить на v1» → viewer → документ finance → 200, `policyVersion: 1`, даунтайма не было.

## Стек

- Node.js 22, NestJS 10, TypeScript.
- Angular 22 (frontend SPA, отдельный Docker-контейнер, раздаётся nginx).
- @nestjs/microservices + @grpc/grpc-js для gRPC.
- Все сервисы в Docker Compose, данные in-memory.