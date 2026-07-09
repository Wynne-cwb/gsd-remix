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
	node scripts/run-tests.cjs
	npm --prefix sdk run test:unit
	npm pack --dry-run --json >/tmp/gsd-remix-pack-dry-run.json
	node -e "const pack=require('/tmp/gsd-remix-pack-dry-run.json')[0]; const files=pack.files.map(f=>f.path); if(!files.includes('sdk/dist/cli.js')) throw new Error('sdk/dist/cli.js missing from tarball — the prebuilt SDK dist did not pack (run npm --prefix sdk run build)'); if(files.some(f=>f.startsWith('sdk/src/'))) throw new Error('sdk/src/ leaked into tarball — remove it from package.json files'); console.log(JSON.stringify({name:pack.name,version:pack.version,filename:pack.filename,files:pack.files.length,sdk_dist_shipped:true}, null, 2))"

release-pack:
	npm pack --dry-run --json >/tmp/gsd-remix-pack-dry-run.json
	node -e "const pack=require('/tmp/gsd-remix-pack-dry-run.json')[0]; console.log(JSON.stringify({name:pack.name,version:pack.version,filename:pack.filename,files:pack.files.length}, null, 2))"

release-whoami: release-auth
	npm whoami --userconfig="$(NPM_USERCONFIG)"

release-publish: release-auth release-check release-whoami
	npm publish --userconfig="$(NPM_USERCONFIG)" --tag "$(NPM_TAG)" $(NPM_PUBLISH_ARGS)
