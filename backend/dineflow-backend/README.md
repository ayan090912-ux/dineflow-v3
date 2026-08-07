# DineFlow Cloud - Backend

Multi-tenant Restaurant Operating System built with FastAPI, SQLAlchemy, and PostgreSQL.

## Architecture

- **Modular Monolith**: Clean architecture with strict layer boundaries
- **Multi-Tenancy**: Shared database, shared schema with `restaurant_id` discriminator
- **Three Auth Systems**: Platform Admin, Restaurant Staff, Customer QR Sessions
- **Event-Driven**: Domain events for decoupled module communication
- **Real-time**: WebSockets with Redis pub/sub fanout

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start services
docker-compose up -d

# 3. Run migrations
docker-compose exec app alembic upgrade head

# 4. API is available at http://localhost:8000
# 5. API docs at http://localhost:8000/docs
```

## Project Structure

```
backend/
  app/
    core/           # Infrastructure (config, database, security, events)
    common/         # Shared schemas, exceptions, pagination
    modules/        # Business modules (auth, users, roles, orders, menu, etc.)
  alembic/          # Database migrations
  tests/            # Pytest test suite
```

## Sprint Roadmap

| Sprint | Focus |
|---|---|
| 1 | Auth + Users + Roles/Permissions |
| 2 | Platform + Restaurants + Branches |
| 3 | Menu |
| 4 | Tables + Customer Sessions |
| 5 | Cart + Orders |
| 6 | Kitchen (Real-time) |
| 7 | Waiter Module |
| 8-15 | Billing, Analytics, Inventory, Hardening |

## Development Rules

1. Build ONE module at a time
2. Every module must be production-ready, tested, documented
3. Stop after every sprint for checkpoint review
4. No automatic progression to next sprint

## License

Proprietary - DineFlow Cloud Platform
