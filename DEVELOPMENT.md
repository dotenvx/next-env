# Development and releases

Forge is the development source of truth for `@dotenvx/next-env`. Make changes
in [dotenvx/forge, next-env](https://github.com/dotenvx/forge/tree/main/next-env).
The `dotenvx/next-env` repository is a generated distribution with prebuilt
native addons; it does not build the Rust SDK independently. `FORGE_SOURCE.json`
in each synced release records its source commit and Forge release tag.

## Release flow

1. Run `npm run test:next-env` in Forge.
2. From a clean checkout, run `npm run version:next-env patch` (or `minor` / `major`).
3. Push the resulting commit and `next-env-v<version>` tag to Forge.
4. Forge builds and tests all five platform addons, assembles the npm package,
   and syncs its contents, this document, and the publishing workflow into
   `dotenvx/next-env`. It atomically pushes `main` and `v<version>` there.
5. That tag starts `.github/workflows/publish.yml` in `dotenvx/next-env`.
   It validates the release, smoke-tests an installed tarball, and publishes it
   to npm using that repository's OIDC identity.

The package's repository link and npm publishing identity both point to
`dotenvx/next-env`. Forge never publishes this package directly to npm.
Existing tags cannot be replaced with different contents. Re-running the Forge
sync for an identical release is a no-op; retry a failed npm publish by re-running
the standalone workflow, or dispatching it with the existing `v<version>` tag.
An already published npm version is immutable; use a new version for changes.

## One-time configuration

- Forge's `GITHUB_TOKEN` in encrypted `.env.ci` needs Contents and Workflows write
  access to `dotenvx/next-env`. Use a PAT/app token so tag pushes trigger Actions.
- Create the `release` environment in `dotenvx/next-env` with the desired protections.
- Configure npm's trusted publisher for `@dotenvx/next-env`: organization `dotenvx`,
  repository `next-env`, workflow `publish.yml`, environment `release`, with direct
  publishing allowed. Once configured, remove the old Forge publisher.

With an authenticated npm CLI, add the publisher using:

```sh
npm trust github @dotenvx/next-env --repo dotenvx/next-env --file publish.yml --env release --allow-publish
```

The standalone workflow is maintained in Forge at
`next-env/.github/workflows/publish.yml` and copied on every release. Install it
in the standalone repository before configuring npm trust. No version tag is
needed for that initial workflow setup.
