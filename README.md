# Tomba Email Finder

[![Price](https://img.shields.io/badge/Price-%243.12%20per%201K%20requests-brightgreen)](#pricing)
[![No signup](https://img.shields.io/badge/Tomba%20account-not%20needed-blue)](#quick-start)
[![No rate limit](https://img.shields.io/badge/Rate%20limit-none-brightgreen)](#built-for-big-lists)

**Turn a name and a company into a verified business email, and a phone number if you want one.** Give us a list of people (a name plus a company domain or company name) and get their most likely professional email address, with a confidence score, a verification status, job title, LinkedIn profile and the public sources where it was found. Turn on **Find phone numbers** to get their direct phone numbers too.

No Tomba account. No API key. No subscription. **You pay $0.00312 per request, and only when Tomba returns an answer.**

## Why teams choose this Actor

- **Start in 30 seconds**: Open the Actor, add your people, click Start. Nothing to sign up for
- **Verified emails**: Every email comes with a verification status and a 0–100 confidence score
- **More than an email**: Job title, company, country, LinkedIn, Twitter and sources come with each result
- **Phone numbers on demand**: Turn on `enrichMobile` to get mobile and direct numbers, and pay for them only when we find one
- **Flexible input**: Use a company domain or just the company name, a full name or a first and last name
- **$3.12 per 1,000 requests**: No monthly plan, no credits that expire, no minimum spend
- **Pay only for answers**: Errors, empty results and incomplete requests are free
- **Built for big lists**: No rate limit. Thousands of people are processed in parallel
- **Never pay twice**: People you looked up in the last 24 hours come back from cache for free
- **Export anywhere**: Download as CSV, Excel or JSON, or send results straight to your CRM with Apify integrations

## Promises we actually keep

- **Less than 5% bounce rate** — Every email is verified in real time before you're charged.
- **Highest coverage on the market** — 81% email coverage. That's 2x more valid emails than the next best competitor. We find contacts others simply can't.

## What you can do with it

| Goal                        | How Email Finder helps                                                     |
| --------------------------- | -------------------------------------------------------------------------- |
| **Book more meetings**      | Reach decision-makers directly instead of a generic `info@` inbox          |
| **Enrich your CRM**         | Fill in missing emails for the contacts and leads you already have         |
| **Account-based marketing** | Get the email of every stakeholder at your target accounts                 |
| **Recruiting**              | Contact candidates at their current company                                |
| **Partnerships and PR**     | Reach the right person at partners, investors and media outlets in one run |

## Quick start

1. Click **Try for free**
2. Add the people you want to reach in **Email Finder Requests**: a company (`domain` or `company` name) and a name (`fullName`, or `firstName` and `lastName`) for each
3. Click **Start**, then download your results as CSV, Excel or JSON

That's it. No Tomba account or API key is needed.

## Input

| Field            | Required | Default | Description                                                                                                           |
| ---------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `requests`       | Yes      |         | People to find (see below)                                                                                            |
| `maxResults`     | No       | `50`    | Maximum number of people to look up in this run (up to 1,000)                                                         |
| `enrichMobile`   | No       | `false` | Also find the person's phone numbers. A result with phone data costs 6 credits instead of 1 (see [Pricing](#pricing)) |
| `webhookUrl`     | No       |         | URL (`http://` or `https://`) that Tomba notifies when a result is ready                                              |
| `maxConcurrency` | No       | `10`    | How many people to process at the same time (1–50)                                                                    |
| `maxRetries`     | No       | `3`     | How many times to retry a temporary failure (0–10)                                                                    |
| `useCache`       | No       | `true`  | Reuse results from your previous runs for free                                                                        |
| `cacheTtlHours`  | No       | `24`    | How long cached results stay valid (`0` turns the cache off)                                                          |

Each request needs a company and a name:

| Request field              | Description                                              |
| -------------------------- | -------------------------------------------------------- |
| `domain` or `company`      | The company domain (`stripe.com`) or its name (`Stripe`) |
| `fullName`                 | The person's full name (`John Doe`)                      |
| `firstName` and `lastName` | The person's first and last name, instead of `fullName`  |

Requests without a company or a name are never sent and never charged. Domains are cleaned up for you (`https://www.stripe.com/about` becomes `stripe.com`), names are trimmed, and duplicate people are removed.

```json
{
    "requests": [
        { "domain": "stripe.com", "firstName": "Patrick", "lastName": "Collison" },
        { "company": "Shopify", "fullName": "Tobi Lutke" }
    ],
    "maxResults": 100,
    "enrichMobile": true
}
```

## Output

You get one row per person:

```json
{
    "email": "john.doe@stripe.com",
    "first_name": "John",
    "last_name": "Doe",
    "full_name": "John Doe",
    "country": "US",
    "gender": "male",
    "phone_number": false,
    "position": "Head of Sales",
    "twitter": null,
    "linkedin": "https://www.linkedin.com/in/johndoe",
    "disposable": false,
    "webmail": false,
    "accept_all": false,
    "company": "Stripe",
    "website_url": "stripe.com",
    "score": 97,
    "verification": {
        "date": "2025-10-17T00:00:00+02:00",
        "status": "valid"
    },
    "sources": [
        {
            "uri": "https://stripe.com/blog/team",
            "website_url": "stripe.com",
            "extracted_on": "2024-09-17T11:26:56+02:00",
            "last_seen_on": "2025-09-06T04:51:06+02:00",
            "still_on_page": true
        }
    ],
    "phone_data": [{ "number": "+14155550123", "type": "mobile" }],
    "domain": "stripe.com",
    "firstName": "John",
    "lastName": "Doe",
    "source": "tomba_email_finder",
    "phoneNumbers": 1,
    "charged": true,
    "chargedCredits": 6,
    "cached": false
}
```

| Field                                      | Description                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `domain`, `firstName`, `lastName`          | The person you submitted (domain cleaned up)                           |
| `fullName`, `inputCompany`                 | The full name and company name you submitted, when you used them       |
| `email`                                    | The person's most likely business email (`null` if none was found)     |
| `first_name`, `last_name`, `full_name`     | The person's name as found by Tomba                                    |
| `position`                                 | Job title                                                              |
| `company`, `website_url`                   | Company name and website                                               |
| `country`, `gender`                        | Country and gender, when known                                         |
| `linkedin`, `twitter`                      | Social profiles, when known                                            |
| `phone_number`                             | Whether a phone number is available for this person                    |
| `phone_data`                               | The person's phone numbers (only with `enrichMobile`)                  |
| `phoneNumbers`                             | How many phone numbers were returned                                   |
| `score`                                    | Confidence score from 0 to 100                                         |
| `verification.status`, `verification.date` | Verification result (for example `valid`) and when it was checked      |
| `accept_all`                               | `true` if the company's mail server accepts every address (catch-all)  |
| `disposable`, `webmail`                    | Whether the email is from a disposable or webmail provider             |
| `sources`                                  | Public pages where the email was found, with first and last seen dates |
| `source`                                   | Always `tomba_email_finder`                                            |
| `charged`                                  | `true` if this lookup was billed                                       |
| `chargedCredits`                           | Credits billed for this row (0, 1 or 6)                                |
| `cached`                                   | `true` if this result came from the cache (free)                       |
| `error`                                    | Why no result was returned, if applicable                              |

The dataset has three ready-made views: **Overview**, **Detailed View** and **Source Analysis**.

## Pricing

**$0.00312 per credit.** A lookup costs 1 credit ($3.12 per 1,000 people). No subscription and no Tomba account needed.

| Result                                                        | Credits | Price    |
| ------------------------------------------------------------- | ------- | -------- |
| Email lookup                                                  | 1       | $0.00312 |
| Email lookup with phone data (`enrichMobile` on, phone found) | 6       | $0.01872 |
| `enrichMobile` on, but no phone number found                  | 1       | $0.00312 |

Phone data adds $0.0156 (5 credits) to a result, and only when `enrichMobile` is on and at least one phone number is returned.

You are only charged when Tomba returns an answer for the person:

| What happens                                                      | Charged |
| ----------------------------------------------------------------- | ------- |
| Email found for the person                                        | Yes     |
| Person looked up, but Tomba has no email for them (`email: null`) | Yes     |
| No result at all for the request                                  | No      |
| Invalid domain or any other error                                 | No      |
| Request missing a company or a name (never sent)                  | No      |
| Temporary failure (it is retried automatically)                   | No      |
| Result served from the cache                                      | No      |

Every row shows `charged`, `chargedCredits` and `cached`, so you always know what you paid for. To cap your spend, set **Maximum cost per run** in the run options: the Actor stops cleanly when the limit is reached.

## Built for big lists

- **No rate limit**: up to 50 people are processed at the same time
- **Automatic retries**: temporary failures are retried for you, and never billed
- **Resumable**: if a run is interrupted, it continues where it stopped without charging you again
- **Cache**: repeat lookups within 24 hours are free

## Integrations

Run it on a schedule, call it from the Apify API, or connect it to Zapier, Make, Google Sheets, HubSpot, Slack and hundreds of other apps with [Apify integrations](https://docs.apify.com/platform/integrations). Webhooks let you trigger your own workflow as soon as a run finishes.

## FAQ

**Do I need a Tomba account or API key?**
No. Everything is built in. You only pay the per-request price on Apify.

**How much does it cost?**
$0.00312 per request that gets an answer ($3.12 per 1,000), or $0.01872 when you turn on `enrichMobile` and we return phone numbers. Errors, empty results, incomplete requests and cached lookups are free.

**What do I need to find an email?**
The person's name (`fullName`, or `firstName` and `lastName`) and their company (`domain` or `company` name). The domain gives the most precise results; correct spelling helps too.

**Can I get phone numbers too?**
Yes. Turn on **Find phone numbers** (`enrichMobile`). Numbers come back in `phone_data`, and `phoneNumbers` tells you how many. A result with phone data costs 6 credits ($0.01872) instead of 1; if no phone number is found you pay the normal 1 credit. Phone lookups are off by default.

**How many people can I look up in one run?**
Up to 1,000 per run, processed in parallel. There is no rate limit.

**What domain format should I use?**
Anything works: `stripe.com`, `www.stripe.com` or `https://stripe.com/about`. We clean it up and remove duplicate people.

**Why was I charged when `email` is empty?**
Tomba found the person's record but no email for them. That is still an answer, so it is billed like any other lookup.

**How do I know an email is safe to send to?**
Check `verification.status` and `score`. A `valid` status and a high score mean the address is ready for outreach.

**Can I find emails at gmail.com or other personal domains?**
No. Email Finder is built for business domains.

**What if my run is interrupted?**
It picks up where it stopped. People already processed are not charged again.

**How do I limit what I spend?**
Set **Maximum cost per run** before you start. The Actor stops as soon as the limit is reached.

**Is it GDPR compliant?**
Tomba only uses publicly available business information. Make sure your outreach follows the email marketing laws that apply to you (GDPR, CAN-SPAM and so on).

## Support

Questions or feedback? We're happy to help:

- **Email**: support@tomba.io
- **Live chat**: on [tomba.io](https://tomba.io) during business hours
- **Issues**: use the **Issues** tab on this Actor's page

## About Tomba

Founded in 2020, [Tomba](https://tomba.io) is a B2B data platform for finding, verifying and enriching business contacts. Our Email Finder, Domain Search and Email Verifier help sales and marketing teams reach the right people.

![Tomba Logo](https://tomba.io/logo.png)
