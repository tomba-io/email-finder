import { log } from 'apify';
import { Finder } from 'tomba';

import { InputError, queryBool, queryInt, queryString, runActor } from './standby.js';
import type { RunOptions } from './tomba.js';
import {
    callTomba,
    getClient,
    hasPhoneData,
    isBillable,
    normalizeDomain,
    PHONE_CREDITS,
    phoneDataCount,
    runPool,
    unique,
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
    requests?: EmailFinderRequest[];
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

const clean = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const requestKey = (r: NormalizedRequest) =>
    [r.domain, r.company, r.fullName, r.firstName, r.lastName].map((v) => v.toLowerCase()).join('|');

/** Tomba: 1 search credit, or 6 when phone data is returned (`enrich_mobile=true`). */
const credits = (body: Record<string, unknown>) => 1 + (hasPhoneData(body.data) ? PHONE_CREDITS : 0);

await runActor<ActorInput>({
    title: 'Email Finder',
    count: (input) => input.requests?.length ?? 0,
    fromQuery: (query) => {
        const request: EmailFinderRequest = {
            domain: queryString(query, 'domain'),
            company: queryString(query, 'company'),
            firstName: queryString(query, 'firstName') ?? queryString(query, 'first_name'),
            lastName: queryString(query, 'lastName') ?? queryString(query, 'last_name'),
            fullName: queryString(query, 'fullName') ?? queryString(query, 'full_name'),
        };
        const hasRequest = Object.values(request).some(Boolean);
        return {
            requests: hasRequest ? [request] : [],
            enrichMobile: queryBool(query, 'enrichMobile'),
            webhookUrl: queryString(query, 'webhookUrl'),
            maxResults: queryInt(query, 'maxResults'),
        };
    },
    run: async (input, { push, isDone, markDone, standby }) => {
        if (!Array.isArray(input.requests) || !input.requests.length) {
            throw new InputError('Input must contain at least one request in "requests".');
        }

        const maxResults = input.maxResults ?? 50;
        const enrichMobile = input.enrichMobile ?? false;
        const webhookUrl = typeof input.webhookUrl === 'string' ? input.webhookUrl.trim() : '';
        if (webhookUrl && !/^https?:\/\//.test(webhookUrl)) {
            throw new InputError('"webhookUrl" must start with http:// or https://.');
        }

        const finder = new Finder(getClient());

        const requests = unique(
            input.requests.map(
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
        const doneCount = requests.filter((r) => isDone(requestKey(r))).length;
        const pending = requests.filter((r) => !isDone(requestKey(r))).slice(0, Math.max(0, maxResults - doneCount));
        if (doneCount > 0) {
            log.info(`Resuming: ${doneCount} requests already processed.`);
        }
        if (!standby) {
            log.info(`Finding emails for ${pending.length} requests${enrichMobile ? ' (with phone numbers)' : ''}`);
        }

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
                await push({
                    ...echo,
                    source: SOURCE,
                    phoneNumbers: 0,
                    charged: false,
                    chargedCredits: 0,
                    cached: false,
                    error: 'Missing required fields: a domain or company, and a fullName or firstName and lastName are required',
                });
                log.info(`Skipping invalid request: ${label}`);
                markDone(key);
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
                await push({
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
                await push({
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

            markDone(key);
        });
    },
});
