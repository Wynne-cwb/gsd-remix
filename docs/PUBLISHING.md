# Publishing `gsd-remix`

This repo publishes a single npm package: `gsd-remix`.

The bundled SDK is shipped inside the main package and rebuilt from bundled source by the installer or `/gsd-health --runtime --repair`. Do not publish a separate SDK package for the current release model.

## Auth

Use a local npm userconfig so publishing `gsd-remix` does not change your global npm login:

```bash
cat > .npmrc.local <<'EOF'
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=YOUR_NPM_TOKEN
EOF
chmod 600 .npmrc.local
```

`.npmrc.local` is intentionally gitignored.

## Preflight

```bash
make release-whoami
make release-check
make release-pack
```

Expected identity for the first public release:

```text
wayne_chen
```

Expected pack metadata:

```json
{
  "name": "gsd-remix",
  "version": "1.0.0"
}
```

## Publish

```bash
make release-publish
```

The publish target runs the same checks first, verifies npm identity with `.npmrc.local`, then executes:

```bash
NPM_CONFIG_USERCONFIG=$PWD/.npmrc.local npm publish --tag latest
```

For a non-latest dist-tag:

```bash
make release-publish NPM_TAG=next
```

For extra npm publish flags:

```bash
make release-publish NPM_PUBLISH_ARGS="--otp 123456"
```
