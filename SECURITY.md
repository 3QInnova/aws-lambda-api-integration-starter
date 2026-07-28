# Security Policy

This repository is a public reference implementation. It contains no AWS credentials, account IDs, production endpoints, customer data, or automatic deployment workflow.

## Safe use

- Run examples only in a dedicated sandbox AWS account.
- Use temporary credentials or GitHub OIDC; never commit access keys.
- Store application secrets in AWS Secrets Manager or SSM Parameter Store.
- Apply least-privilege IAM, authentication, API throttling, monitoring, budgets, and cost-anomaly alerts.
- Treat the included HTTP API routes as unauthenticated demonstration endpoints. Do not deploy them to production without an authorizer and abuse controls.
- Keep Lambda reserved concurrency and log-retention limits in place.

If a secret is exposed, revoke and rotate it immediately, then remove it from Git history. Report security concerns through a private GitHub security advisory rather than a public issue.
