# Development

Notes for maintainers of the Tomba Email Finder Actor. The README is the end-user page shown on Apify Store.

## Requirements

- Node.js 20+
- [Apify CLI](https://docs.apify.com/cli) for deployment

## Scripts

```bash
npm install
npm run build     # compile TypeScript to dist/
npm run lint      # ESLint (src and test)
npm run format    # Prettier
npm test          # unit + end-to-end tests (node:test)
npm start         # run locally with tsx
```

## Credentials

The Actor uses our Tomba account. Credentials come from environment variables, never from the input:

| Variable             | Description                                        |
| -------------------- | -------------------------------------------------- |
| `TOMBA_API_KEY`      | Tomba API key (`ta_…`)                             |
| `TOMBA_API_SECRET`   | Tomba secret (`ts_…`)                              |
| `TOMBA_API_ENDPOINT` | Optional API base URL; only used by the test suite |

`.actor/actor.json` maps the variables to Apify secrets:

```bash
apify secrets add tombaApiKey ta_xxxxxxxxxxxxxxxxxxxx
apify secrets add tombaApiSecret ts_xxxxxxxxxxxxxxxxxxxx
apify push
```

Run locally:

```bash
TOMBA_API_KEY=ta_… TOMBA_API_SECRET=ts_… npm start
```

## Pricing (pay per event)

In **Apify Console → Publication → Monetization**, choose **Pay per event** and add:

| Event           | Price    | Charged when                                  |
| --------------- | -------- | --------------------------------------------- |
| `tomba-request` | $0.00312 | Tomba returns a billable response (see below) |

Every Tomba credit is one `tomba-request` event. The count follows Tomba's published rule for Email Finder, **1 search credit, or 6 with phone data**:

| Billable response                                                 | Events (`count`)        |
| ----------------------------------------------------------------- | ----------------------- |
| Without `enrichMobile`                                            | 1                       |
| `enrichMobile=true` and `data.phone_data` has at least one number | 6 (1 + `PHONE_CREDITS`) |
| `enrichMobile=true` and `data.phone_data` missing or empty        | 1                       |

`main.ts` passes `count = (body) => 1 + (hasPhoneData(body.data) ? PHONE_CREDITS : 0)` to `callTomba()`. Each item reports the events actually charged in `chargedCredits` (`res.chargedCount ?? 0`, so 0 for cache hits and errors) and the number of phones in `phoneNumbers`.

`isBillable()` in `src/tomba.ts` mirrors Tomba's billing:

| Tomba outcome                                          | Charged |
| ------------------------------------------------------ | ------- |
| JSON with non-empty `data`, including negative answers | Yes     |
| Error status (4xx, 5xx, including 422 and 429)         | No      |
| Success with empty or null `data`                      | No      |
| Success with an `errors` object                        | No      |
| Non-JSON body (reported as 502)                        | No      |
| Cache hit                                              | No      |

A negative answer here is a `data` object with `email: null` (Tomba knows the person but has no email); it is charged. A request needs (`domain` or `company`) and (`fullName` or `firstName` + `lastName`); otherwise it is never sent to Tomba and produces a free error item.

## Architecture

- `src/tomba.ts`: shared helper, identical in every Tomba Actor. It handles credentials, caching (`tomba-cache` key-value store), retries with exponential backoff, pay-per-event charging, budget reservation, the concurrency pool and resume state.
- `src/main.ts`: Actor-specific input handling and output mapping. Requests are normalized (`normalizeDomain`, trimmed and whitespace-collapsed `company`/`fullName`/`firstName`/`lastName`) and deduplicated on `domain|company|fullName|firstName|lastName` (case-insensitive). `maxResults` limits the number of requests processed. Each request calls `Finder.emailFinder({ domain, company, fullName, firstName, lastName, enrichMobile, webhook_url })` (`GET /email-finder?domain=&company=&full_name=&first_name=&last_name=&enrich_mobile=&webhook_url=`); only non-empty fields are sent, `enrich_mobile=true` only when `enrichMobile` is on and `webhook_url` only when `webhookUrl` is set. These parameters are also the cache key, so results with and without phone data are cached separately. The output item is Tomba's `data` object spread (including `phone_data` when returned), plus the input echo (`domain`, `firstName`, `lastName`, and `fullName` / `inputCompany` when given; the input company is `inputCompany` because `company` is Tomba's field), `source`, `phoneNumbers`, `charged`, `chargedCredits`, `cached` and, when there is no result, `error`.
- The `tomba` SDK v1.1.1 resolves every call to `{ data, rateLimit }`, where `data` is the response body. Its `.d.ts` types still declare the old return type, so always go through `callTomba()`.

## Tests

- `test/tomba.test.ts`: unit tests for the shared helper (identical in every Actor)
- `test/main.test.ts`: end-to-end tests that run `src/main.ts` against a local mock Tomba API
- `test/helpers.ts`: mock server and Actor runner (identical in every Actor)

Locally, the Apify SDK prices every event at $1 when `ACTOR_TEST_PAY_PER_EVENT=true`, so the tests use `maxTotalChargeUsd` as an event count.
