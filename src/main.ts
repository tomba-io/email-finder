import { Actor, log } from 'apify';
import { Finder } from 'tomba';

import type { RunOptions } from './tomba.js';
import {
    callTomba,
    hasPhoneData,
    isBillable,
    logSummary,
    normalizeDomain,
    PHONE_CREDITS,
    phoneDataCount,
    runPool,
    setupTomba,
    unique,
    useRunState,
} from './tomba.js';

interface EmailFinderRequest {
    domain?: string;
    company?: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
}

type NormalizedRequest = Required<EmailFinderRequest>;

interface ActorInput extends RunOptions {
    requests: EmailFinderRequest[];
    maxResults?: number;
    enrichMobile?: boolean;
    webhookUrl?: string;
}

/** Parameters accepted by `Finder.emailFinder()` in tomba 1.1.1. */
interface EmailFinderParams extends EmailFinderRequest {
    enrichMobile?: boolean;
    webhook_url?: string;
}

const SOURCE = 'tomba_email_finder';

await Actor.init();

const input = await Actor.getInput<ActorInput>();
if (!input?.requests?.length) {
    await Actor.fail('Input must contain at least one request in "requests".');
}

const {
    requests: rawRequests,
    maxResults = 50,
    enrichMobile = false,
    webhookUrl: rawWebhookUrl,
    ...runOptions
} = input!;
const webhookUrl = typeof rawWebhookUrl === 'string' ? rawWebhookUrl.trim() : '';
if (webhookUrl && !/^https?:\/\//.test(webhookUrl)) {
    await Actor.fail('"webhookUrl" must start with http:// or https://.');
}

const client = await setupTomba(runOptions);
const finder = new Finder(client);
const state = await useRunState();

const clean = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const requestKey = (r: NormalizedRequest) =>
    [r.domain, r.company, r.fullName, r.firstName, r.lastName].map((v) => v.toLowerCase()).join('|');

const requests = unique(
    rawRequests.map(
        (r): NormalizedRequest => ({
            domain: normalizeDomain(clean(r?.domain)),
            company: clean(r?.company),
            fullName: clean(r?.fullName),
            firstName: clean(r?.firstName),
            lastName: clean(r?.lastName),
        }),
    ),
    requestKey,
);
const doneCount = requests.filter((r) => state.done[requestKey(r)]).length;
const pending = requests.filter((r) => !state.done[requestKey(r)]).slice(0, Math.max(0, maxResults - doneCount));
if (doneCount > 0) {
    log.info(`Resuming: ${doneCount} requests already processed.`);
}

const startedAt = Date.now();
log.info(`Finding emails for ${pending.length} requests${enrichMobile ? ' (with phone numbers)' : ''}`);

/** Tomba: 1 search credit, or 6 when phone data is returned (`enrich_mobile=true`). */
const credits = (body: Record<string, unknown>) => 1 + (hasPhoneData(body.data) ? PHONE_CREDITS : 0);

await runPool(pending, async (request) => {
    const key = requestKey(request);
    const { domain, company, fullName, firstName, lastName } = request;

    // Input echo. The input company is `inputCompany` because `company` is Tomba's own output field.
    const echo = {
        domain,
        firstName,
        lastName,
        ...(fullName ? { fullName } : {}),
        ...(company ? { inputCompany: company } : {}),
    };
    const label = `${fullName || `${firstName} ${lastName}`.trim()} @ ${domain || company}`;

    if (!(domain || company) || !(fullName || (firstName && lastName))) {
        await Actor.pushData({
            ...echo,
            source: SOURCE,
            phoneNumbers: 0,
            charged: false,
            chargedCredits: 0,
            cached: false,
            error: 'Missing required fields: a domain or company, and a fullName or firstName and lastName are required',
        });
        log.info(`Skipping invalid request: ${label}`);
        state.done[key] = true;
        return;
    }

    const params: EmailFinderParams = {};
    if (domain) params.domain = domain;
    if (company) params.company = company;
    if (fullName) params.fullName = fullName;
    if (firstName) params.firstName = firstName;
    if (lastName) params.lastName = lastName;
    if (enrichMobile) params.enrichMobile = true;
    if (webhookUrl) params.webhook_url = webhookUrl;

    const res = await callTomba(
        'email-finder',
        { ...params },
        async () => finder.emailFinder(params),
        undefined,
        credits,
    );
    if (res.skipped) return;

    const chargedCredits = res.chargedCount ?? 0;
    if (isBillable(res.body)) {
        const data = res.data as Record<string, unknown>;
        const phoneNumbers = phoneDataCount(data);
        await Actor.pushData({
            ...data,
            ...echo,
            source: SOURCE,
            phoneNumbers,
            charged: res.charged,
            chargedCredits,
            cached: res.cached,
        });
        const email = typeof data.email === 'string' && data.email ? data.email : 'no email found';
        const phones = phoneNumbers ? `, ${phoneNumbers} phone numbers` : '';
        log.info(`${label}: ${email}${phones}${res.cached ? ' (cached)' : ''}`);
    } else {
        await Actor.pushData({
            ...echo,
            source: SOURCE,
            phoneNumbers: 0,
            charged: res.charged,
            chargedCredits,
            cached: res.cached,
            error: res.error ?? 'No email found for this person',
        });
        log.info(`${label}: ${res.error ?? 'no email found'}`);
    }

    state.done[key] = true;
});

logSummary('Email Finder', requests.length, startedAt);

await Actor.exit();
