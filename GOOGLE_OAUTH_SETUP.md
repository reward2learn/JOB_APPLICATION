# Google OAuth setup (apply4job / Application Generator)

Use this when sign-in shows **Error 400: redirect_uri_mismatch** or when `/api/auth/google/config` lists URIs that are not yet in Google Cloud.

## What the live app sends

Production always uses this **Authorized redirect URI** (no trailing slash):

```text
https://apply4job.vercel.app/api/auth/google/callback
```

Verify anytime:

```bash
curl -sI -X GET "https://apply4job.vercel.app/api/auth/google" | grep -i location
```

Decode the `redirect_uri=` query parameter in the `Location` header — it must match Google Console **character for character**.

Machine-readable checklist: [https://apply4job.vercel.app/api/auth/google/config](https://apply4job.vercel.app/api/auth/google/config)

---

## Google Cloud Console (numbered steps)

1. Open **[Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)**.
   - ![Screenshot: Credentials page in left nav under APIs & Services](./docs/images/google-oauth-01-credentials-nav.png) *(placeholder)*

2. **Select the correct GCP project** (top bar). A mismatch here is the most common mistake — credentials from project A will not apply to a client ID from project B.
   - ![Screenshot: project picker showing the intended project](./docs/images/google-oauth-02-project-picker.png) *(placeholder)*

3. Under **OAuth 2.0 Client IDs**, open the **Web client** whose **Client ID** matches Vercel `GOOGLE_CLIENT_ID` (prefix before `.apps.googleusercontent.com`), e.g. `670560975972-gc6f7p9dck4f9pl6e92mop0ol8o5k7uv`.
   - Do **not** edit a **Desktop**, **iOS**, or **Android** client — only **Web application**.
   - ![Screenshot: OAuth 2.0 Client IDs list with Web client highlighted](./docs/images/google-oauth-03-web-client-list.png) *(placeholder)*

4. On the client edit screen, set **Application type** to **Web application** (if creating new).

5. **Authorized JavaScript origins** — add exactly (one per line):
   ```text
   https://apply4job.vercel.app
   ```
   For local dev, also:
   ```text
   http://localhost:3000
   ```
   - ![Screenshot: Authorized JavaScript origins field](./docs/images/google-oauth-04-js-origins.png) *(placeholder)*

6. **Authorized redirect URIs** — add exactly (one per line, **no trailing slash**):
   ```text
   https://apply4job.vercel.app/api/auth/google/callback
   ```
   For local dev, also:
   ```text
   http://localhost:3000/api/auth/google/callback
   ```
   - ![Screenshot: Authorized redirect URIs field with production URI pasted](./docs/images/google-oauth-05-redirect-uris.png) *(placeholder)*

7. Click **Save**. Google can take **1–5 minutes** to propagate; retry sign-in in a private window if needed.

8. **OAuth consent screen** (if users outside your org): APIs & Services → **OAuth consent screen** → add `reward2learn@gmail.com` as a **Test user** while app is in **Testing**, or publish the app for production use.
   - ![Screenshot: Test users section on consent screen](./docs/images/google-oauth-06-test-users.png) *(placeholder)*

---

## Vercel environment variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Must match the Web client you edited above |
| `GOOGLE_CLIENT_SECRET` | From the same Web client |
| `GOOGLE_REDIRECT_URI` | Optional pin; if unset, app derives `https://<host>/api/auth/google/callback` |
| `AUTH_SECRET` | Optional; session signing (else derived from client secret) |

After changing env vars, redeploy production.

---

## Common mistakes

| Mistake | Symptom |
|---------|---------|
| Edited redirect URIs on a **different** OAuth client or GCP project | `redirect_uri_mismatch` persists |
| Used **Desktop** client credentials in Vercel | Mismatch or invalid client |
| Trailing slash: `.../callback/` | Mismatch |
| `http://` instead of `https://` on production | Mismatch |
| Preview URL (e.g. `*.vercel.app`) without adding that exact callback URI | Mismatch on preview only |

---

## Code reference

Redirect URI is built in `appgen-api/lib/auth-session.js` (`googleRedirectUri`) and used identically in:

- `GET /api/auth/google` (authorize redirect)
- `GET /api/auth/google/callback` (token exchange)

No path variants or alternate hosts in application code unless `GOOGLE_REDIRECT_URI` is set.
