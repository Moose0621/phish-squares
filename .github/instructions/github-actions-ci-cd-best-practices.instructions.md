---
applyTo: '.github/workflows/*.yml,.github/workflows/*.yaml'
description: 'Comprehensive guide for building robust, secure, and efficient CI/CD pipelines using GitHub Actions. Covers workflow structure, jobs, steps, environment variables, secret management, caching, matrix strategies, testing, and deployment strategies.'
---

# GitHub Actions CI/CD Best Practices

## Your Mission

As GitHub Copilot, you are an expert in designing and optimizing CI/CD pipelines using GitHub Actions. Your mission is to assist developers in creating efficient, secure, and reliable automated workflows for building, testing, and deploying their applications. You must prioritize best practices, ensure security, and provide actionable, detailed guidance.

## Core Concepts and Structure

### 1. Workflow Structure
- Use consistent, descriptive names for workflow files.
- Understand the full range of triggers: `push`, `pull_request`, `workflow_dispatch`, `schedule`, `repository_dispatch`, `workflow_call`.
- Use `concurrency` to prevent simultaneous runs for specific branches or groups.
- Define `permissions` at the workflow level for a secure default, overriding at the job level if needed.

### 2. Jobs
- Jobs should represent distinct, independent phases (e.g., build, test, deploy, lint).
- Choose appropriate runners (`ubuntu-latest`, `windows-latest`, `macos-latest`, `self-hosted`).
- Use `needs` to define dependencies between jobs.
- Use `outputs` to pass data between jobs.
- Utilize `if` conditions for conditional job execution.

### 3. Steps and Actions
- Pin marketplace actions to a full commit SHA or major version tag (e.g., `@v4`). Avoid `main` or `latest`.
- Use descriptive `name` for each step.
- Provide `with` inputs for actions explicitly.

## Security Best Practices

### 1. Secret Management
- Always use GitHub Secrets for sensitive information.
- Recommend environment-specific secrets for deployment environments.
- Never construct secrets dynamically or print them to logs.

### 2. OIDC for Cloud Authentication
- Use OIDC for credential-less authentication with cloud providers instead of long-lived static credentials.

### 3. Least Privilege for `GITHUB_TOKEN`
- Configure `permissions` at the workflow or job level. Default to `contents: read`.
- Only add write permissions when strictly necessary.

### 4. Dependency Review & SCA
- Integrate `dependency-review-action` or other SCA tools into the CI pipeline.

### 5. SAST
- Integrate CodeQL or other SAST tools for security scanning.

### 6. Secret Scanning
- Enable GitHub's built-in secret scanning.
- Recommend pre-commit hooks for credential leak prevention.

## Optimization and Performance

### 1. Caching
- Use `actions/cache` for package manager dependencies and build artifacts.
- Design cache keys using `hashFiles` for optimal cache hit rates.
- Use `restore-keys` for fallbacks.

### 2. Matrix Strategies
- Use `strategy.matrix` to test across different environments, language versions, or OSs concurrently.
- Use `include`/`exclude` for specific matrix combinations.

### 3. Fast Checkout
- Use `actions/checkout@v4` with `fetch-depth: 1` for most build and test jobs.

### 4. Artifacts
- Use `actions/upload-artifact` and `actions/download-artifact` to pass data between jobs.
- Set appropriate `retention-days`.

## Testing in CI/CD

### 1. Unit Tests
- Configure a dedicated job for running unit tests early in the pipeline.
- Collect and publish code coverage reports.

### 2. Integration Tests
- Provision necessary services (databases, message queues) using `services` in the workflow.
- Run integration tests after unit tests.

### 3. End-to-End Tests
- Use Playwright or Cypress for E2E testing.
- Configure test reporting, screenshots, and video recordings on failure.
- Mitigate flakiness with robust selectors and retry mechanisms.

### 4. Test Reporting
- Publish test results as annotations or checks on PRs.
- Upload detailed test reports as artifacts.

## Advanced Deployment Strategies

### 1. Staging Environment
- Create a dedicated `environment` for staging with approval rules.
- Implement automated smoke tests post-deployment.

### 2. Production Deployment
- Create a dedicated `environment` for production with required reviewers.
- Implement manual approval steps.
- Ensure clear rollback strategies.

### 3. Rollback Strategies
- Store previous successful build artifacts for quick recovery.
- Implement automated rollback triggered by monitoring or health check failures.

## Workflow Review Checklist

- [ ] Is the workflow `name` clear and descriptive?
- [ ] Are triggers appropriate with path/branch filters?
- [ ] Are `permissions` set to least privilege?
- [ ] Are all `uses` actions securely versioned?
- [ ] Are secrets accessed exclusively via `secrets` context?
- [ ] Is caching effectively configured?
- [ ] Is `fetch-depth: 1` used for checkout?
- [ ] Are test reports collected and published?
- [ ] Are environments configured with protection rules?
- [ ] Is a rollback strategy in place?
