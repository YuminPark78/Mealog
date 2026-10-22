# Mealog

1. Open **Docker Desktop** and wait for its engine to be running.

2. In a terminal at **repository root**, start Supabase:

   ```bash
   npx supabase start
   ```

3. In a second terminal, start FastAPI:

   ```bash
   cd services/api
   uv run uvicorn mealog_api.main:app --reload --port 8000
   ```

4. In a third terminal, start Next.js:

   ```bash
   cd apps/web
   npm run dev
   ```

5. Open [connection-check page](http://localhost:3000/connection-check) and click **Test connections**.

| Service | Address |
|---|---|
| Frontend | [localhost:3000](http://localhost:3000) |
| FastAPI documentation | [127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) |
| Supabase Studio | [127.0.0.1:54323](http://127.0.0.1:54323) |