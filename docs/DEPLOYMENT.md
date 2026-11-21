# Backend deployment

## Current live diagnosis (21 November 2026)

The JavaScript at https://www.simvest.online already uses
https://simvest-backend.onrender.com for REST and Socket.IO.
That backend returns HTTP 200 at `/health` and accepts the website's CORS origin.
However, `/api/market/instruments` and `/api/yahoo/quote/RELIANCE.NS` returned
HTTP 500 with `Failed to get crumb, status 429, statusText: Too Many Requests`.
Yahoo Finance is rejecting upstream requests. Redeployment alone does not
guarantee that Yahoo will allow the hosting server's IP address.

## Deploy on Render

1. Create a Render account at https://dashboard.render.com and connect the GitHub
   repository containing this project. If someone already owns the existing
   backend service, ask them for access to it first.
2. Publish the deployment files to your repository, then choose **New > Blueprint**
   and select that repository. The root `render.yaml` configures the service.
   Alternatively choose **New > Web Service** with these settings:

   | Setting | Value |
   | --- | --- |
   | Runtime | Node |
   | Root directory | `backend` |
   | Build command | `npm ci --omit=dev` |
   | Start command | `npm start` |
   | Health check | `/health` |

3. Set the environment variables from `render.yaml`. Copy the three Supabase
   values from your local `backend/.env` into Render's environment settings.
   Keep `SUPABASE_SERVICE_KEY` exclusively on the backend.
4. Deploy and open `https://YOUR-SERVICE.onrender.com/health`. Expect
   `{"status":"ok",...}`. Check `/api/market/instruments` separately: a healthy
   process does not prove the market provider works.
5. In the Vercel frontend project's Production environment variables, set:

   ```env
   VITE_API_URL=https://YOUR-SERVICE.onrender.com
   VITE_WS_URL=https://YOUR-SERVICE.onrender.com
   VITE_SUPABASE_URL=<your Supabase project URL>
   VITE_SUPABASE_ANON_KEY=<your Supabase anon key>
   ```

6. Redeploy the frontend so Vite includes the new variables in its build.
   Verify market requests and the Socket.IO connection in browser DevTools.

`USE_MOCK_DATA=true` selects the existing Yahoo polling service, despite its
name. It is not an offline demo mode. The updated service no longer seeds fallback prices: it waits for genuine
provider quotes.
Setting it to false selects Upstox and requires Upstox configuration and
authentication. Optional advisor functionality requires `OPENROUTER_API_KEY`.

## Yahoo rate limits

Avoid repeatedly redeploying or refreshing to retry the provider. The updated poller requests stocks once a minute and shares a one-minute
quote cache with browser requests. Requests are deduplicated and serialized
across Yahoo endpoints. HTTP 429 starts a five-minute cooldown; quote/chart
routes report HTTP 503 with Retry-After instead of retrying upstream immediately.
Expired quotes are not returned as fresh data or broadcast to the trading engine.
These changes reduce traffic but cannot remove an existing Yahoo IP block.
You still need a provider that permits your hosting environment. Upstox can be used after its authentication flow is configured.

Reference: https://render.com/docs/deploy-node-express-app

## Local verification

Run `node --test test/yahoo-cache.test.mjs` from `backend`, and `npm run build`
from `frontend`. The automated tests use a fake Yahoo client; they do not prove
that Yahoo accepts the production server or that Supabase is restored.
