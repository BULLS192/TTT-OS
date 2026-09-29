# TTT-OS Deployment Guardrails

TTT-OS uses defense-in-depth checks so a syntactically broken client-side update cannot replace the working production deployment.

## Production gate

Vercel runs `node tests/predeploy-gate-v01.cjs` as the project build command. If the gate fails, the deployment fails before it can become the new production version, leaving the previous working production deployment in place.

The gate follows the scripts actually loaded by TTT-OS from HTML and bootstrap script tags, parses each deployed JavaScript file with Node, verifies referenced local scripts exist, checks critical modern TTT-OS modules and navigation sentinels, and validates key JSON configuration files.

## GitHub regression

The same gate runs in `.github/workflows/ttt-regression.yml` for every push and pull request to `main`, alongside the existing functional regression suite.

## Post-deployment smoke

The Playwright public smoke test runs after successful main deployments. In addition to checking the login flow and browser errors, it verifies that the current CRM, Tessa, Product Master, Website Analytics, and modern navigation shell actually bootstrapped.

## Deployment discipline

Feature-branch Vercel builds remain disabled. Production remains tied to `main`, and the deployment-discipline regression verifies that these guardrails remain configured.
