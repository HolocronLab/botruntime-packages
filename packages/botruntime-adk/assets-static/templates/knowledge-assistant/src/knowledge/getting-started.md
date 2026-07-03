# Company Handbook

Welcome to Acme Corp! This document covers our policies, benefits, and day-to-day operations.

> **Note:** This is sample content. Replace it with your actual company docs, product documentation, or any knowledge you want your assistant to answer questions about.

## Working Hours

Our standard working hours are 9 AM to 5 PM in your local timezone. We offer flexible scheduling — as long as you're available for core hours (11 AM to 3 PM) and attend your team's standups, you can adjust your start and end times.

## Time Off Policy

- **PTO:** 20 days per year, accruing monthly
- **Sick leave:** Unlimited, no questions asked for the first 3 days. Beyond that, a doctor's note is appreciated but not required.
- **Holidays:** We follow the US federal holiday calendar. If you're outside the US, you can swap US holidays for your local ones.
- **Parental leave:** 16 weeks paid for all parents, regardless of gender.

## Expense Policy

- **Software and tools:** Pre-approved up to $100/month. Anything over needs manager approval.
- **Books and courses:** Fully covered, no cap. Submit receipts through Expensify.
- **Travel:** Book economy for flights under 5 hours, business class for longer. Hotels up to $250/night.
- **Meals:** $30/day when traveling. Team dinners covered fully with VP approval.

## Engineering Practices

### Code Review

Every PR needs at least one approval before merging. For changes touching auth, payments, or data deletion, two approvals are required. Reviewers should respond within 24 hours.

### Incident Response

1. **Severity 1 (service down):** Page the on-call engineer via PagerDuty. All hands until resolved.
2. **Severity 2 (degraded):** Notify #incidents in Slack. On-call investigates, escalates if not resolved in 1 hour.
3. **Severity 3 (minor bug):** File a ticket, fix in next sprint.

Post-incident reviews happen within 48 hours. No blame, just learnings.

### Deployment

We deploy to production twice daily (11 AM and 4 PM UTC). Feature flags are required for anything user-facing. Rollbacks are one-click via the deploy dashboard.

## Benefits

- **Health insurance:** 100% covered for employees, 80% for dependents
- **401k:** 4% match, vests immediately
- **Home office:** $1,500 one-time setup budget for new hires
- **Wellness:** $100/month for gym, therapy, or wellness apps
- **Learning:** Conference budget of $2,000/year plus 3 days off to attend
