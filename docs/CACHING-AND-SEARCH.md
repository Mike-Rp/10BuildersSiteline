# Caching and search visibility

SITELINE is a private portal. Every HTML shell retains `noindex, nofollow`, and
Vercel and Express send the same `X-Robots-Tag` response header. There is no public
sitemap. The production canonical URL and link preview metadata come from
`.figma/make/site.json`; update its `url` if the production domain changes.

`robots.txt` allows crawling the empty login shell so search engines can see its
`noindex` instruction. Blocking the shell with `Disallow: /` would prevent them
from reading that instruction. Crawling does not grant account or project access:
the API still authenticates and authorizes each request. Search engines may need
time to revisit a previously indexed URL; these settings do not remove results
immediately and are not a replacement for authentication.

## Cache policy

| Resource | Policy |
| --- | --- |
| Vite content-hashed files under `/assets/` | Public browser/CDN cache for one year, immutable; each new build changes the filenames |
| Unversioned public images under `/images/` | Public cache for one hour, then revalidate |
| HTML entrypoint | Revalidate on reuse so deployments reference the latest bundles |
| All API responses, errors and private downloads | `private, no-store`; explicit CDN no-store headers |
| API fetches in the browser | `cache: no-store`, including on session changes |
| Global phase/discipline definitions only | Process-local server memory cache for 60 seconds; concurrent reads share a load |

The reference cache contains no accounts, permissions, projects, checklists,
notifications, settings, report snapshots or file bytes. Authorization is checked
before using it. Results are copied before being returned so one caller cannot
modify another caller's reference data. Failed loads are retried; expired values
are not used when the database is unavailable. A successful login clears the
reference cache. Restart the backend after applying definition migrations for an
immediate refresh; otherwise the TTL bounds staleness to 60 seconds.

On Vercel, this memory cache belongs to a single running function instance. Cold
starts read from Postgres again; no Redis subscription is required.

## Loading and retry behavior

Clients see skeleton placeholders while their workspace data loads. Admin, Office PM,
Site PM and unknown sessions use simple loading messages. Loading views contain no saved records,
invented counts or enabled controls. Existing list rows remain visible during a
background refresh instead of being replaced with placeholders.

React StrictMode's repeated development effects share only the pending session
restore. Completed and failed loads are not cached; another session or Retry
starts fresh work. API requests have a 30-second deadline, including reading the
response body. Multipart uploads allow two minutes. Expiry aborts the request and
shows an error; session restoration retains its token and offers Retry. Mutations
are never automatically repeated. After an uncertain write, refresh the workspace
to check whether it saved before submitting it again.

## Deployment and checks

Deploy the updated frontend and API together to activate `vercel.json` headers.
An already-open tab may need a refresh. No database migration is needed.

Check `/`, `/admin`, `/robots.txt`, one generated `/assets/` URL and an
unauthenticated `/api/v1/workspace/project-data` request after deployment. HTML
should contain noindex; the API should return 401 with no-store and noindex
headers; only static assets should have public long-lived cache headers.
