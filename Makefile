SHELL := /bin/bash

NPM_USERCONFIG ?= $(CURDIR)/.npmrc.local
NPM_TAG ?= latest
NPM_PUBLISH_ARGS ?=

.PHONY: help release-auth release-check release-pack release-whoami release-publish

help:
	@echo "Release targets:"
	@echo "  make release-check      Run release validation without publishing"
	@echo "  make release-pack       Show npm pack dry-run metadata"
	@echo "  make release-whoami     Verify npm identity using local .npmrc.local"
	@echo "  make release-publish    Run checks, verify identity, publish to npm"
	@echo ""
	@echo "Config:"
	@echo "  NPM_USERCONFIG=$(NPM_USERCONFIG)"
	@echo "  NPM_TAG=$(NPM_TAG)"

release-auth:
	@test -f "$(NPM_USERCONFIG)" || (echo "Missing $(NPM_USERCONFIG). Create it from .npmrc.local template first." && exit 1)
	@! grep -q "PASTE_NPM_TOKEN_HERE" "$(NPM_USERCONFIG)" || (echo "$(NPM_USERCONFIG) still contains the placeholder token." && exit 1)

release-check:
	git diff --check
	git diff --quiet
	git diff --cached --quiet
	npm --prefix sdk run build
	node --test \
		tests/runtime-health-command.test.cjs \
		tests/runtime-health-preflight.test.cjs \
		tests/bug-2334-quick-gsd-sdk-preflight.test.cjs \
		tests/bug-2439-set-profile-gsd-sdk-preflight.test.cjs \
		tests/bugs-1656-1657.test.cjs \
		tests/bug-2453-sdk-cli-chmod.test.cjs
	npx vitest run sdk/src/runtime-health.test.ts sdk/src/query/registry.test.ts
	npm pack --dry-run --json >/tmp/gsd-remix-pack-dry-run.json
	node -e "const pack=require('/tmp/gsd-remix-pack-dry-run.json')[0]; console.log(JSON.stringify({name:pack.name,version:pack.version,filename:pack.filename,files:pack.files.length}, null, 2))"

release-pack:
	npm pack --dry-run --json >/tmp/gsd-remix-pack-dry-run.json
	node -e "const pack=require('/tmp/gsd-remix-pack-dry-run.json')[0]; console.log(JSON.stringify({name:pack.name,version:pack.version,filename:pack.filename,files:pack.files.length}, null, 2))"

release-whoami: release-auth
	NPM_CONFIG_USERCONFIG="$(NPM_USERCONFIG)" npm whoami

release-publish: release-auth release-check release-whoami
	NPM_CONFIG_USERCONFIG="$(NPM_USERCONFIG)" npm publish --tag "$(NPM_TAG)" $(NPM_PUBLISH_ARGS)
