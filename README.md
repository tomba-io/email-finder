# Tomba Email Finder Actor

[![Actor](https://img.shields.io/badge/Apify-Actor-blue)](https://apify.com/actors)
[![Tomba API](https://img.shields.io/badge/Tomba-API-green)](https://tomba.io)
[![Rate Limit](https://img.shields.io/badge/Rate%20Limit-150%2Fmin-orange)](https://tomba.io/api)

A powerful Apify Actor that finds email addresses for specific people at companies using the **Tomba Email Finder API**. Perfect for lead generation, contact discovery, and building targeted email lists by combining company domains with first and last names.

## Key Features

- **Email Discovery**: Find email addresses by combining domain + first name + last name
- **Professional Contact Finding**: Discover business email addresses for specific individuals
- **Bulk Processing**: Process multiple email finder requests efficiently with rate limiting
- **Email Verification**: Get verification status and confidence scores for found emails
- **Rate Limited**: Respects Tomba's 150 requests per minute limit
- **Rich Data Output**: Comprehensive email information with metadata
- **Source Tracking**: Multiple sources where email information was found
- **Error Handling**: Graceful handling of invalid requests or unfound emails

## How it works

The Actor leverages Tomba's powerful Email Finder API to discover email addresses for specific people:

### Process Flow

1. **Authentication**: Connects to Tomba API using your credentials
2. **Input Processing**: Accepts array of requests with domain, first name, and last name
3. **Email Discovery**: Uses Tomba's `emailFinder` method for each request
4. **Data Validation**: Processes and validates found email information
5. **Rate Limiting**: Automatically handles 150 requests/minute limit
6. **Data Storage**: Saves results to Apify dataset

### What You Get

For each email finder request, you'll receive:

- **Input Details**: Domain, first name, last name used in the search
- **Found Email**: The discovered email address (if found)
- **Verification**: Email verification status and confidence score
- **Source Tracking**: Multiple sources where the email was found
- **Metadata**: When the email was extracted and last verified
- **Error Handling**: Clear error messages when emails cannot be found

## Quick Start

### Prerequisites

1. **Tomba Account**: Sign up at [Tomba.io](https://app.tomba.io/api) to get your API credentials

### Getting Your API Keys

1. Visit [Tomba API Dashboard](https://app.tomba.io/api)
2. Copy your **API Key** (starts with `ta_`)
3. Copy your **Secret Key** (starts with `ts_`)

## Input Configuration

### Required Parameters

| Parameter        | Type     | Description                     |
| ---------------- | -------- | ------------------------------- |
| `tombaApiKey`    | `string` | Your Tomba API key (ta_xxxx)    |
| `tombaApiSecret` | `string` | Your Tomba secret key (ts_xxxx) |
| `requests`       | `array`  | Array of email finder requests  |

### Optional Parameters

| Parameter    | Type     | Default | Description                           |
| ------------ | -------- | ------- | ------------------------------------- |
| `maxResults` | `number` | `50`    | Maximum number of requests to process |

### Request Object Structure

Each request in the `requests` array should contain:

| Field       | Type     | Description         | Example      |
| ----------- | -------- | ------------------- | ------------ |
| `domain`    | `string` | Company domain name | `stripe.com` |
| `firstName` | `string` | Person's first name | `John`       |
| `lastName`  | `string` | Person's last name  | `Doe`        |

### Example Input

```json
{
    "tombaApiKey": "ta_xxxxxxxxxxxxxxxxxxxx",
    "tombaApiSecret": "ts_xxxxxxxxxxxxxxxxxxxx",
    "requests": [
        {
            "domain": "stripe.com",
            "firstName": "John",
            "lastName": "Doe"
        },
        {
            "domain": "example.com",
            "firstName": "Jane",
            "lastName": "Smith"
        },
        {
            "domain": "company.com",
            "firstName": "Robert",
            "lastName": "Johnson"
        }
    ],
    "maxResults": 100
}
```

### Best Practices

- **Name Accuracy**: Use correct spelling and formatting for first/last names
- **Domain Format**: Use clean domain names without protocols (example.com, not https://example.com)
- **Rate Limits**: The Actor automatically handles Tomba's 150 requests/minute limit
- **Batch Size**: Process 10-50 requests at a time for optimal performance

## Output Data Structure

The Actor returns detailed information for each email finder request:

```json
{
    "domain": "stripe.com",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@stripe.com",
    "score": 95,
    "verification": {
        "date": "2025-10-17T00:00:00+02:00",
        "status": "valid"
    },
    "sources": [
        {
            "uri": "https://stripe.com/team",
            "website_url": "stripe.com",
            "extracted_on": "2024-09-17T11:26:56+02:00",
            "last_seen_on": "2025-09-06T04:51:06+02:00",
            "still_on_page": true
        }
    ],
    "source": "tomba_email_finder"
}
```

### Data Fields Explained

- **Input Echo**: `domain`, `firstName`, `lastName` - Your original request parameters
- **Found Email**: `email` - The discovered email address (null if not found)
- **Confidence Score**: `score` (0-100) indicates reliability of the found email
- **Email Verification**: `verification.status` shows email validity
- **Source Tracking**: `sources` array shows where email was found
- **Time Stamps**: Track when data was extracted and last verified

## Use Cases

- **Lead Generation**: Find contact emails for specific people at target companies
- **Sales Prospecting**: Build contact lists for outbound sales campaigns
- **Recruitment**: Find email addresses for potential candidates at specific companies
- **Partnership Outreach**: Contact specific decision-makers at partner companies
- **Investor Relations**: Find contact information for investors or executives
- **Media Outreach**: Contact specific journalists or PR contacts at media companies

## Error Handling

The Actor gracefully handles various scenarios:

- **Invalid Requests**: Records error message for missing required fields
- **No Email Found**: Logs when no email address can be discovered
- **Rate Limiting**: Automatically waits when API limits are reached
- **API Errors**: Captures and reports API-related issues

## Resources & Documentation

### API Documentation

- [Tomba API Docs](https://tomba.io/api) - Complete API reference
- [Authentication Guide](https://app.tomba.io/api) - Get your API keys
- [Pricing & Limits](https://tomba.io/pricing) - Understand rate limits and costs
- [Email Finder API](https://docs.tomba.io/api/finder#email-finder) - Specific endpoint documentation

### Rate Limiting

- Tomba limits to **150 requests per minute**
- Actor automatically handles rate limiting with delays
- Large batches may take time to complete

### Cost Considerations

- Each email finder request = 1 Tomba API request
- Monitor your Tomba usage dashboard
- Consider Tomba's pricing tiers for volume usage

## FAQ

### General Questions

**Q: How does email finding work?**
A: Email finding uses a person's name and company domain to predict and verify their email address. It combines pattern recognition, database matching, and verification to find valid email addresses.

**Q: What information do I need to find an email?**
A: You need the person's first name, last name, and company domain. The more accurate these details, the better the results.

**Q: How accurate are the found emails?**
A: Accuracy varies by company and person, but Tomba typically achieves 85-95% accuracy. The confidence score (0-100) indicates the reliability of each found email.

### Usage & Features

**Q: Can I process multiple email searches at once?**
A: Yes, provide an array of requests in the `requests` parameter. You can process up to 1000 requests per run, with 10-50 being optimal for performance.

**Q: What if an email isn't found?**
A: If no email is found, the result will show `"email": null`. This is normal - not all email addresses are publicly discoverable.

**Q: How do confidence scores work?**
A: Scores range from 0-100, where 90+ indicates high confidence, 70-89 is moderate confidence, and below 70 suggests lower reliability. Higher scores mean the email is more likely to be correct.

**Q: Can I verify the found emails?**
A: Yes! Found emails include verification status. You can also use the Email Verifier actor for additional validation of the results.

### Technical Questions

**Q: What are the rate limits?**
A: Tomba allows 150 requests per minute. The Actor automatically handles rate limiting by adding delays when needed. Large batches will take proportionally longer.

**Q: How should I format names?**
A: Use proper capitalization (e.g., "John", "Mary-Jane", "O'Connor"). The system handles various name formats, but accurate spelling is important.

**Q: What domain formats are accepted?**
A: Use clean domain names like "stripe.com" or "example.org". Don't include protocols (http/https) or subdomains unless specifically needed.

**Q: Can I find emails for personal domains?**
A: This tool is designed for business emails. Personal domains (gmail.com, yahoo.com) are not supported as they don't follow predictable patterns.

### Data & Privacy

**Q: Where does the email data come from?**
A: Tomba aggregates data from public sources like company websites, social media profiles, professional networks, and other publicly available information.

**Q: Is this GDPR compliant?**
A: Yes, Tomba follows GDPR guidelines and only uses publicly available information. All data collection complies with privacy regulations.

**Q: How fresh is the email data?**
A: Data freshness varies, but verification dates are included in results. Tomba continuously updates its database with new information.

**Q: Can I use found emails for cold outreach?**
A: Yes, but ensure you comply with local email marketing laws (CAN-SPAM, GDPR, etc.). Always include unsubscribe options and respect privacy preferences.

### Troubleshooting

**Q: Why am I getting low confidence scores?**
A: Low scores may indicate unusual company email patterns, new employees, or limited public information. Consider verifying these emails before use.

**Q: What if I get API errors?**
A: Check your API credentials, account quota, and request format. The Actor provides detailed error messages to help troubleshoot issues.

**Q: How do I handle large batches efficiently?**
A: Break large lists into smaller batches (50-100 requests). Monitor your API quota and consider upgrading your Tomba plan for higher volumes.

## Keywords

email finder, email discovery, contact finder, lead generation, email search, prospect research, email hunting, contact discovery, sales prospecting, outreach automation, business contacts, email validation

## Support

If you need any help, have questions, or encounter any issues while using Tomba.io, please don't hesitate to reach out to our support team. You can contact us via:

- **Email**: support@tomba.io
- **Live chat**: Available on the Tomba.io website during business hours

## Contributing

We welcome contributions to improve this actor. Please feel free to submit issues, feature requests, or pull requests to help make this tool even better for the community.

## About Tomba

Founded in 2020, Tomba prides itself on being the most reliable, accurate, and in-depth source of email address data available anywhere. We process terabytes of data to produce our Email finder API.

![Tomba Logo](https://tomba.io/logo.png)
