import { Actor } from 'apify';
import { Finder, TombaClient } from 'tomba';

interface EmailFinderRequest {
    domain: string;
    firstName: string;
    lastName: string;
}

interface ActorInput {
    tombaApiKey: string;
    tombaApiSecret: string;
    requests: EmailFinderRequest[];
    maxResults?: number;
}

// Rate limiting: 150 requests per minute for Tomba API
const RATE_LIMIT_REQUESTS = 150;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds

let requestCount = 0;
let windowStart = Date.now();

async function rateLimitedRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Reset counter if window has passed
    if (now - windowStart >= RATE_LIMIT_WINDOW) {
        requestCount = 0;
        windowStart = now;
    }

    // Wait if we've hit the rate limit
    if (requestCount >= RATE_LIMIT_REQUESTS) {
        const waitTime = RATE_LIMIT_WINDOW - (now - windowStart);
        console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
        await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), waitTime);
        });

        // Reset after waiting
        requestCount = 0;
        windowStart = Date.now();
    }

    requestCount++;
    return await requestFn();
}

// The init() call configures the Actor for its environment
await Actor.init();

try {
    // Get input from the Actor
    const input = (await Actor.getInput()) as ActorInput;

    if (!input?.tombaApiKey || !input?.tombaApiSecret) {
        throw new Error('Missing required parameters: tombaApiKey and tombaApiSecret are required');
    }

    if (!input?.requests || !Array.isArray(input.requests) || input.requests.length === 0) {
        throw new Error('Missing required parameter: requests array is required and must not be empty');
    }

    console.log(`Starting Tomba email finder for ${input.requests.length} requests`);

    // Initialize Tomba client
    const client = new TombaClient();
    const finder = new Finder(client);
    client.setKey(input.tombaApiKey).setSecret(input.tombaApiSecret);

    const results: Record<string, unknown>[] = [];
    const maxResults = input.maxResults || 50;
    let processedCount = 0;

    // Process each email finder request
    for (const request of input.requests) {
        if (processedCount >= maxResults) {
            console.log(`Reached maximum results limit: ${maxResults}`);
            break;
        }

        const { domain, firstName, lastName } = request;

        if (!domain || !firstName || !lastName) {
            console.log(`Skipping invalid request: domain=${domain}, firstName=${firstName}, lastName=${lastName}`);
            results.push({
                domain,
                firstName,
                lastName,
                error: 'Missing required fields: domain, firstName, and lastName are required',
                source: 'tomba_email_finder',
            });
            continue;
        }

        try {
            console.log(`Finding email for: ${firstName} ${lastName} at ${domain}`);

            // Use Tomba's email finder method with rate limiting
            const result = finder.emailFinder(domain, firstName, lastName);

            const tombaResult = await rateLimitedRequest(async () => await result);

            if (tombaResult && tombaResult.data) {
                const emailData = {
                    ...tombaResult.data,
                    domain,
                    firstName,
                    lastName,
                    source: 'tomba_email_finder',
                };

                results.push(emailData);
                console.log(
                    `Found email for: ${firstName} ${lastName} - ${tombaResult.data.email || 'No email found'}`,
                );
            } else {
                // Add empty result if no data found
                results.push({
                    domain,
                    firstName,
                    lastName,
                    error: 'No email found for this person',
                    source: 'tomba_email_finder',
                });
            }

            processedCount++;
        } catch (error) {
            console.log(`Error processing request for ${firstName} ${lastName} at ${domain}:`, error);

            // Add error entry to results for transparency
            results.push({
                domain,
                firstName,
                lastName,
                error: error instanceof Error ? error.message : 'Unknown error',
                source: 'tomba_email_finder',
            });
        }
    }

    if (results.length > 0) {
        await Actor.pushData(results);
    }

    // Log summary
    console.log('=== SUMMARY ===');
    console.log(`Total requests processed: ${input.requests.length}`);
    console.log(`Successful email finds: ${results.length}`);
    console.log(`Failed email finds: ${results.filter((r) => 'error' in r).length}`);
} catch (error) {
    console.error('Actor failed:', error);
    throw error;
}

// Gracefully exit the Actor process
await Actor.exit();
