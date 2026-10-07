// End-to-end tests: run the Actor against a mock Tomba API.
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';

import type { MockHandler, MockServer } from './helpers.js';
import { removeStorage, runActor, startMockTomba, totalCharges } from './helpers.js';

const SOURCES = [
    {
        uri: 'https://stripe.com/blog/team',
        website_url: 'stripe.com',
        extracted_on: '2024-09-17T11:26:56+02:00',
        last_seen_on: '2025-09-06T04:51:06+02:00',
        still_on_page: true,
    },
];

/** Realistic Tomba email-finder `data` object for a found email. */
function found(domain: string, first: string, last: string): Record<string, unknown> {
    return {
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
        first_name: first,
        last_name: last,
        full_name: `${first} ${last}`,
        country: 'US',
        gender: 'male',
        phone_number: false,
        position: 'Head of Sales',
        twitter: null,
        linkedin: `https://www.linkedin.com/in/${first.toLowerCase()}${last.toLowerCase()}`,
        disposable: false,
        webmail: false,
        accept_all: false,
        company: 'Stripe',
        website_url: domain,
        score: 97,
        verification: { date: '2025-10-17T00:00:00+02:00', status: 'valid' },
        sources: SOURCES,
    };
}

/** Phone fixtures returned with `enrich_mobile=true`: Jane has two numbers, Phoneless none, everyone else one. */
const PHONES: Record<string, Record<string, unknown>[]> = {
    Jane: [
        { number: '+14155550123', type: 'mobile' },
        { number: '+14155550199', type: 'work' },
    ],
    Phoneless: [],
};
const phonesFor = (first: string) => PHONES[first] ?? [{ number: '+14155550123', type: 'mobile' }];

/**
 * Default Tomba behaviour: known people return an email, `nobody` returns a negative answer,
 * special domains return empty data, 422 or a non-JSON body. Requests by `company` resolve to
 * `<company>.com`, requests by `full_name` are split into first and last name. `phone_data` is
 * only returned when the query has `enrich_mobile=true`.
 */
const tomba: MockHandler = (req) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.path, '/email-finder');
    const { company, full_name: fullName, enrich_mobile: enrichMobile } = req.query;
    const domain = req.query.domain ?? `${company.toLowerCase()}.com`;
    const [first, last] = fullName ? fullName.split(' ') : [req.query.first_name, req.query.last_name];
    const phones = enrichMobile === 'true' ? { phone_data: phonesFor(first) } : {};
    if (domain === 'empty.com') return { body: { data: null } };
    if (domain === 'invalid.com') return { status: 422, body: { errors: { message: 'Invalid domain' } } };
    if (domain === 'html.com') return { raw: '<html>Bad gateway</html>' };
    if (first === 'Nobody') {
        return {
            body: {
                data: {
                    email: null,
                    first_name: first,
                    last_name: last,
                    full_name: null,
                    website_url: domain,
                    score: 0,
                    verification: { date: null, status: null },
                    sources: [],
                    ...phones,
                },
            },
        };
    }
    return { body: { data: { ...found(domain, first, last), ...phones } } };
};

const servers: MockServer[] = [];
const dirs: string[] = [];

async function mock(handler: MockHandler = tomba): Promise<MockServer> {
    const server = await startMockTomba(handler);
    servers.push(server);
    return server;
}

async function run(...args: Parameters<typeof runActor>) {
    const result = await runActor(...args);
    dirs.push(result.storageDir);
    return result;
}

const person = (domain: string, firstName = 'John', lastName = 'Doe') => ({ domain, firstName, lastName });

afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (s) => s.close()));
});

after(async () => {
    await Promise.all(dirs.map(removeStorage));
});

describe('email-finder', () => {
    it('returns the email and charges one event per billable request', async () => {
        const server = await mock();
        const result = await run({
            input: { requests: [person('stripe.com'), person('empty.com')] },
            endpoint: server.url,
        });

        assert.equal(result.code, 0, result.output);
        const hit = result.items.find((i) => i.domain === 'stripe.com');
        assert.deepEqual(hit, {
            ...found('stripe.com', 'John', 'Doe'),
            domain: 'stripe.com',
            firstName: 'John',
            lastName: 'Doe',
            source: 'tomba_email_finder',
            phoneNumbers: 0,
            charged: true,
            chargedCredits: 1,
            cached: false,
        });

        const empty = result.items.find((i) => i.domain === 'empty.com');
        assert.deepEqual(empty, {
            domain: 'empty.com',
            firstName: 'John',
            lastName: 'Doe',
            source: 'tomba_email_finder',
            phoneNumbers: 0,
            charged: false,
            chargedCredits: 0,
            cached: false,
            error: 'No email found for this person',
        });

        assert.deepEqual(result.chargeCounts, { 'tomba-request': 1 });
    });

    it('sends the built-in credentials and the expected query to Tomba', async () => {
        const server = await mock();
        await run({ input: { requests: [person('stripe.com')] }, endpoint: server.url });
        assert.equal(server.requests.length, 1);
        assert.equal(server.requests[0].headers['x-tomba-key'], 'ta_test_key');
        assert.equal(server.requests[0].headers['x-tomba-secret'], 'ts_test_secret');
        assert.deepEqual(server.requests[0].query, { domain: 'stripe.com', first_name: 'John', last_name: 'Doe' });
    });

    it('normalizes domains, trims names and deduplicates requests', async () => {
        const server = await mock();
        const result = await run({
            input: {
                requests: [
                    person('https://www.Stripe.com/about', ' John ', ' Doe '),
                    person('stripe.com', 'john', 'DOE'),
                    person('STRIPE.COM', 'John', 'Doe'),
                ],
            },
            endpoint: server.url,
        });
        assert.deepEqual(
            server.requests.map((r) => r.query),
            [{ domain: 'stripe.com', first_name: 'John', last_name: 'Doe' }],
        );
        assert.equal(result.items.length, 1);
    });

    it('charges a negative answer (person found, no email)', async () => {
        const server = await mock();
        const result = await run({
            input: { requests: [person('stripe.com', 'Nobody', 'Here')] },
            endpoint: server.url,
        });
        assert.equal(result.items.length, 1);
        assert.equal(result.items[0].email, null);
        assert.equal(result.items[0].charged, true);
        assert.equal(result.items[0].error, undefined);
        assert.deepEqual(result.chargeCounts, { 'tomba-request': 1 });
    });

    it('does not charge Tomba error statuses and does not retry them', async () => {
        const server = await mock();
        const result = await run({ input: { requests: [person('invalid.com')] }, endpoint: server.url });
        assert.equal(result.code, 0, result.output);
        assert.equal(server.requests.length, 1);
        assert.equal(result.items[0].charged, false);
        assert.match(String(result.items[0].error), /422: Invalid domain/);
        assert.equal(totalCharges(result), 0);
    });

    it('does not charge a non-JSON body', async () => {
        const server = await mock();
        const result = await run({ input: { requests: [person('html.com')] }, endpoint: server.url });
        assert.equal(result.items[0].charged, false);
        assert.match(String(result.items[0].error), /Invalid response/);
        assert.equal(totalCharges(result), 0);
    });

    it('retries 429 and 5xx responses, then charges the success once', async () => {
        let calls = 0;
        const server = await mock(async (req) => {
            calls++;
            if (calls === 1)
                return {
                    status: 429,
                    body: { errors: { message: 'Too many requests' } },
                    headers: { 'retry-after': '1' },
                };
            if (calls === 2) return { status: 503, body: {} };
            return tomba(req);
        });
        const result = await run({ input: { requests: [person('stripe.com')], maxRetries: 3 }, endpoint: server.url });
        assert.equal(server.requests.length, 3);
        assert.equal(result.items[0].charged, true);
        assert.equal(result.items[0].email, 'john.doe@stripe.com');
        assert.deepEqual(result.chargeCounts, { 'tomba-request': 1 });
    });

    it('serves repeated runs from the cache for free', async () => {
        const server = await mock();
        const first = await run({ input: { requests: [person('stripe.com')] }, endpoint: server.url });
        const second = await run({
            input: { requests: [person('stripe.com')] },
            endpoint: server.url,
            storageDir: first.storageDir,
        });

        assert.equal(server.requests.length, 1);
        assert.equal(second.items.length, 1);
        assert.equal(second.items[0].email, 'john.doe@stripe.com');
        assert.equal(second.items[0].cached, true);
        assert.equal(second.items[0].charged, false);
        assert.equal(totalCharges(second), 0);
    });

    it('calls Tomba again when the cache is disabled', async () => {
        const server = await mock();
        const input = { requests: [person('stripe.com')], useCache: false };
        const first = await run({ input, endpoint: server.url });
        await run({ input, endpoint: server.url, storageDir: first.storageDir });
        assert.equal(server.requests.length, 2);
    });

    it('stops at the max charge limit and resumes without reprocessing', async () => {
        const server = await mock();
        const domains = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'];
        const input = { requests: domains.map((d) => person(d)), maxConcurrency: 1, useCache: false };

        // Locally every event costs $1, so a $2 budget allows two billable requests.
        const first = await run({ input, endpoint: server.url, maxTotalChargeUsd: 2 });
        assert.equal(first.code, 0, first.output);
        assert.equal(totalCharges(first), 2);
        assert.equal(server.requests.length, 2);
        assert.equal(first.items.length, 2);

        const second = await run({ input, endpoint: server.url, storageDir: first.storageDir, keepStorage: true });
        assert.equal(second.code, 0, second.output);
        // The charging log is kept with the storage, so it now holds both runs: 2 + 3 charges.
        assert.equal(totalCharges(second), 5);
        assert.equal(second.items.length, 5);
        assert.deepEqual(
            server.requests.map((r) => r.query.domain),
            domains,
        );
    });

    it('respects maxResults', async () => {
        const server = await mock();
        const result = await run({
            input: { requests: [person('a.com'), person('b.com'), person('c.com')], maxResults: 2 },
            endpoint: server.url,
        });
        assert.equal(server.requests.length, 2);
        assert.equal(result.items.length, 2);
        assert.equal(totalCharges(result), 2);
    });

    it('runs requests in parallel', async () => {
        let active = 0;
        let peak = 0;
        const server = await mock(async (req) => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((r) => {
                setTimeout(r, 100);
            });
            active--;
            return tomba(req);
        });
        const requests = Array.from({ length: 8 }, (_, i) => person(`site${i}.com`));
        await run({ input: { requests, maxConcurrency: 4 }, endpoint: server.url });
        assert.equal(server.requests.length, 8);
        assert.ok(peak > 1 && peak <= 4, `peak concurrency ${peak}`);
    });

    it('fails without Tomba credentials and never calls the API', async () => {
        const server = await mock();
        const result = await run({
            input: { requests: [person('stripe.com')] },
            endpoint: server.url,
            withCredentials: false,
        });
        assert.notEqual(result.code, 0);
        assert.match(result.output, /misconfigured/);
        assert.doesNotMatch(result.output, /ta_test_key|ts_test_secret/);
        assert.equal(server.requests.length, 0);
    });

    it('never sends requests with a missing field and does not charge them', async () => {
        const server = await mock();
        const result = await run({
            input: {
                requests: [
                    { domain: 'stripe.com', firstName: 'John' },
                    { domain: '', firstName: 'Jane', lastName: 'Smith' },
                    { firstName: '  ', lastName: 'Smith', domain: 'stripe.com' },
                    person('stripe.com', 'Jane', 'Smith'),
                ],
            },
            endpoint: server.url,
        });
        assert.equal(result.code, 0, result.output);
        assert.deepEqual(
            server.requests.map((r) => r.query),
            [{ domain: 'stripe.com', first_name: 'Jane', last_name: 'Smith' }],
        );
        const invalid = result.items.filter((i) => i.error);
        assert.equal(invalid.length, 3);
        for (const item of invalid) {
            assert.equal(item.charged, false);
            assert.match(String(item.error), /Missing required fields/);
        }
        assert.deepEqual(result.chargeCounts, { 'tomba-request': 1 });
    });

    it('sends enrich_mobile and webhook_url only when they are set', async () => {
        const server = await mock();
        await run({ input: { requests: [person('stripe.com')], enrichMobile: false }, endpoint: server.url });
        await run({
            input: {
                requests: [person('shopify.com')],
                enrichMobile: true,
                webhookUrl: 'https://hooks.example.com/tomba',
            },
            endpoint: server.url,
        });
        assert.deepEqual(
            server.requests.map((r) => r.query),
            [
                { domain: 'stripe.com', first_name: 'John', last_name: 'Doe' },
                {
                    domain: 'shopify.com',
                    first_name: 'John',
                    last_name: 'Doe',
                    enrich_mobile: 'true',
                    webhook_url: 'https://hooks.example.com/tomba',
                },
            ],
        );
    });

    it('fails on a webhook URL that is not http(s) and never calls the API', async () => {
        const server = await mock();
        const result = await run({
            input: { requests: [person('stripe.com')], webhookUrl: 'ftp://hooks.example.com' },
            endpoint: server.url,
        });
        assert.notEqual(result.code, 0);
        assert.equal(server.requests.length, 0);
    });

    it('charges 1 credit without enrichMobile and returns no phone data', async () => {
        const server = await mock();
        const result = await run({
            input: { requests: [person('stripe.com', 'Jane', 'Smith')] },
            endpoint: server.url,
        });
        assert.equal(result.items[0].phone_data, undefined);
        assert.equal(result.items[0].phoneNumbers, 0);
        assert.equal(result.items[0].chargedCredits, 1);
        assert.deepEqual(result.chargeCounts, { 'tomba-request': 1 });
    });

    it('charges 6 credits per result with phone data, whatever the number of phones', async () => {
        const server = await mock();
        const result = await run({
            input: {
                requests: [person('stripe.com', 'John', 'Doe'), person('stripe.com', 'Jane', 'Smith')],
                enrichMobile: true,
            },
            endpoint: server.url,
        });
        assert.equal(result.code, 0, result.output);
        const john = result.items.find((i) => i.firstName === 'John');
        const jane = result.items.find((i) => i.firstName === 'Jane');
        assert.deepEqual(john?.phone_data, [{ number: '+14155550123', type: 'mobile' }]);
        assert.equal(john?.phoneNumbers, 1);
        assert.equal(john?.chargedCredits, 6);
        assert.equal(john?.charged, true);
        assert.equal(jane?.phoneNumbers, 2);
        assert.equal(jane?.chargedCredits, 6);
        assert.deepEqual(result.chargeCounts, { 'tomba-request': 12 });
    });

    it('charges 1 credit with enrichMobile when no phone number is found', async () => {
        const server = await mock();
        const result = await run({
            input: { requests: [person('stripe.com', 'Phoneless', 'Person')], enrichMobile: true },
            endpoint: server.url,
        });
        assert.deepEqual(result.items[0].phone_data, []);
        assert.equal(result.items[0].phoneNumbers, 0);
        assert.equal(result.items[0].chargedCredits, 1);
        assert.deepEqual(result.chargeCounts, { 'tomba-request': 1 });
    });

    it('serves phone data from the cache for free', async () => {
        const server = await mock();
        const input = { requests: [person('stripe.com', 'Jane', 'Smith')], enrichMobile: true };
        const first = await run({ input, endpoint: server.url });
        assert.equal(totalCharges(first), 6);
        const second = await run({ input, endpoint: server.url, storageDir: first.storageDir });
        assert.equal(server.requests.length, 1);
        assert.equal(second.items[0].cached, true);
        assert.equal(second.items[0].charged, false);
        assert.equal(second.items[0].chargedCredits, 0);
        assert.equal(second.items[0].phoneNumbers, 2);
        assert.equal(totalCharges(second), 0);
    });

    it('does not reuse a cached result without phone data when enrichMobile is turned on', async () => {
        const server = await mock();
        const first = await run({ input: { requests: [person('stripe.com')] }, endpoint: server.url });
        const second = await run({
            input: { requests: [person('stripe.com')], enrichMobile: true },
            endpoint: server.url,
            storageDir: first.storageDir,
        });
        assert.equal(server.requests.length, 2);
        assert.equal(second.items[0].phoneNumbers, 1);
        assert.equal(totalCharges(second), 6);
    });

    it('accepts a company name instead of a domain and a full name instead of first and last name', async () => {
        const server = await mock();
        const result = await run({
            input: {
                requests: [
                    { company: ' Stripe ', fullName: ' John   Doe ' },
                    { domain: 'https://www.shopify.com/', fullName: 'Jane Smith' },
                    { company: 'Acme', firstName: 'Bob', lastName: 'Ray' },
                    { company: 'stripe', fullName: 'john doe' },
                ],
                maxConcurrency: 1,
            },
            endpoint: server.url,
        });
        assert.equal(result.code, 0, result.output);
        assert.deepEqual(
            server.requests.map((r) => r.query),
            [
                { company: 'Stripe', full_name: 'John Doe' },
                { domain: 'shopify.com', full_name: 'Jane Smith' },
                { company: 'Acme', first_name: 'Bob', last_name: 'Ray' },
            ],
        );
        assert.equal(result.items.length, 3);
        const john = result.items.find((i) => i.fullName === 'John Doe');
        assert.equal(john?.email, 'john.doe@stripe.com');
        assert.equal(john?.inputCompany, 'Stripe');
        assert.equal(john?.company, 'Stripe');
        assert.equal(john?.domain, '');
        const bob = result.items.find((i) => i.inputCompany === 'Acme');
        assert.equal(bob?.email, 'bob.ray@acme.com');
        assert.equal(bob?.fullName, undefined);
        assert.deepEqual(result.chargeCounts, { 'tomba-request': 3 });
    });

    it('rejects requests without a company or without a name, for free', async () => {
        const server = await mock();
        const result = await run({
            input: {
                requests: [
                    { company: 'Stripe' },
                    { fullName: 'John Doe' },
                    { company: 'Stripe', firstName: 'John' },
                    { company: '  ', domain: '', fullName: 'Jane Doe' },
                    { company: 'Stripe', fullName: '  ', lastName: 'Doe' },
                ],
            },
            endpoint: server.url,
        });
        assert.equal(result.code, 0, result.output);
        assert.equal(server.requests.length, 0);
        assert.equal(result.items.length, 5);
        for (const item of result.items) {
            assert.equal(item.charged, false);
            assert.equal(item.chargedCredits, 0);
            assert.equal(item.phoneNumbers, 0);
            assert.match(String(item.error), /Missing required fields/);
        }
        assert.equal(totalCharges(result), 0);
    });

    it('fails on empty input', async () => {
        const server = await mock();
        const result = await run({ input: { requests: [] }, endpoint: server.url });
        assert.notEqual(result.code, 0);
        assert.equal(server.requests.length, 0);
    });
});
