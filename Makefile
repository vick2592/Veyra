# Veyra — developer shortcuts
#
# Quick start:
#   make setup     install all deps + create env files from the examples
#   make dev       run frontend (3000) + backend (3001) together
#   make help      list every target
#
# Override any variable on the command line, e.g.:
#   make deploy-base-sepolia DEPLOYER_PRIVATE_KEY=0xabc...

SHELL := /bin/bash

ROOT          := $(CURDIR)
FRONTEND_DIR  := $(ROOT)/apps/frontend
BACKEND_DIR   := $(ROOT)/apps/backend
CONTRACTS_DIR := $(ROOT)/blockchain/packages/contracts
BROKER_DIR    := $(ROOT)/blockchain/packages

FRONTEND_PORT ?= 3000
BACKEND_PORT  ?= 3001
ANVIL_PORT    ?= 8545

# Chain defaults (Base Sepolia). Override on the command line as needed.
RPC_URL          ?= https://sepolia.base.org
CHAIN_ID         ?= 84532
REGISTRY_ADDRESS ?= 0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC
WORLD_ID_ADDRESS ?= 0x42FF98C4E85212a5D31358ACbFe76a621b50fC02

# Anvil account #0 — local testing only, never a real key.
ANVIL_PK ?= 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Defaults for the demo secret used by `make store-secret`.
SECRET_ID    ?= 0xb7c13b673a2c35d90c6173b5f0840fb89b35ea037ec004e2dc888c43eb082896
SECRET_NAME  ?= openai-key
SECRET_VALUE ?= 0x12345678

.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
##@ Help

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nVeyra make targets\n"} \
		/^[a-zA-Z_-]+:.*?##/ {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2} \
		/^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)
	@echo ""

# ---------------------------------------------------------------------------
##@ Install & setup

setup: install env ## Install every dependency and create env files (start here)
	@echo ""
	@echo "Setup complete. Next:"
	@echo "  1. Fill in apps/backend/.env and apps/frontend/.env.local"
	@echo "  2. make dev"

install: install-frontend install-backend install-contracts ## Install frontend + backend + contract deps

install-frontend: ## npm install in apps/frontend
	cd $(FRONTEND_DIR) && npm install

install-backend: ## npm install in apps/backend
	cd $(BACKEND_DIR) && npm install

install-contracts: ## Fetch Foundry deps (forge-std git submodule)
	git submodule update --init --recursive

install-broker: ## Install the optional blockchain/packages broker workspace (needs pnpm)
	@command -v pnpm >/dev/null 2>&1 || { echo "pnpm not installed. Run: npm i -g pnpm"; exit 1; }
	cd $(BROKER_DIR) && pnpm install

env: env-frontend env-backend ## Create .env files from the examples (never overwrites)

env-frontend: ## Create apps/frontend/.env.local from .env.example
	@if [ -f $(FRONTEND_DIR)/.env.local ]; then \
		echo "apps/frontend/.env.local already exists — left untouched"; \
	else \
		cp $(FRONTEND_DIR)/.env.example $(FRONTEND_DIR)/.env.local; \
		echo "created apps/frontend/.env.local"; \
	fi

env-backend: ## Create apps/backend/.env from .env.example
	@if [ -f $(BACKEND_DIR)/.env ]; then \
		echo "apps/backend/.env already exists — left untouched"; \
	else \
		cp $(BACKEND_DIR)/.env.example $(BACKEND_DIR)/.env; \
		echo "created apps/backend/.env"; \
	fi

doctor: ## Check that node, npm, forge, cast and anvil are installed
	@for c in node npm forge cast anvil; do \
		printf "  %-6s %s\n" "$$c" "$$(command -v $$c || echo 'NOT INSTALLED')"; \
	done
	@echo ""
	@echo "  Foundry missing? curl -L https://foundry.paradigm.xyz | bash && foundryup"

# ---------------------------------------------------------------------------
##@ Run

dev: ## Run frontend (3000) + backend (3001) together; Ctrl-C stops both
	@echo "frontend -> http://localhost:$(FRONTEND_PORT)"
	@echo "backend  -> http://localhost:$(BACKEND_PORT)"
	@trap 'kill 0' EXIT INT TERM; \
		( cd $(BACKEND_DIR) && npm run dev ) & \
		( cd $(FRONTEND_DIR) && npm run dev ) & \
		wait

dev-frontend: ## Run only the Next.js frontend on :3000
	cd $(FRONTEND_DIR) && npm run dev

dev-backend: ## Run only the Express broker on :3001
	cd $(BACKEND_DIR) && npm run dev

anvil: ## Start a local anvil chain on :8545
	anvil --port $(ANVIL_PORT)

start: ## Run production builds of frontend + backend (run `make build` first)
	@trap 'kill 0' EXIT INT TERM; \
		( cd $(BACKEND_DIR) && npm start ) & \
		( cd $(FRONTEND_DIR) && npm start ) & \
		wait

open: ## Open the running frontend in a browser
	@open http://localhost:$(FRONTEND_PORT)

sandbox: ## Open the /sandbox demo route in a browser
	@open http://localhost:$(FRONTEND_PORT)/sandbox

# ---------------------------------------------------------------------------
##@ Build, typecheck & test

build: build-frontend build-backend build-contracts ## Build everything

build-frontend: ## next build
	cd $(FRONTEND_DIR) && npm run build

build-backend: ## tsc build of the backend
	cd $(BACKEND_DIR) && npm run build

build-contracts: ## forge build
	forge build --root $(CONTRACTS_DIR)

typecheck: typecheck-frontend typecheck-backend ## Typecheck both apps

typecheck-frontend: ## tsc --noEmit in apps/frontend
	cd $(FRONTEND_DIR) && npm run typecheck

typecheck-backend: ## tsc --noEmit in apps/backend
	cd $(BACKEND_DIR) && npm run typecheck

test: test-backend test-contracts ## Run backend (vitest) + contract (forge) tests

test-backend: ## vitest run in apps/backend
	cd $(BACKEND_DIR) && npm test

test-contracts: ## forge test -vv
	forge test --root $(CONTRACTS_DIR) -vv

test-gas: ## forge test with a gas report
	forge test --root $(CONTRACTS_DIR) --gas-report

fmt: ## forge fmt the Solidity sources
	forge fmt --root $(CONTRACTS_DIR)

fmt-check: ## Verify Solidity formatting without writing
	forge fmt --check --root $(CONTRACTS_DIR)

check: typecheck test build ## Full validation sweep (typecheck + tests + builds)

# ---------------------------------------------------------------------------
##@ Contracts & chain

deploy-local: ## Deploy the registry to local anvil using the anvil #0 key
	cd $(CONTRACTS_DIR) && \
		WORLD_ID_ADDRESS=$(WORLD_ID_ADDRESS) DEPLOYER_PRIVATE_KEY=$(ANVIL_PK) \
		forge script script/DeployVeyraRegistry.s.sol:DeployVeyraRegistry \
			--rpc-url http://127.0.0.1:$(ANVIL_PORT) --broadcast -vv

deploy-base-sepolia: ## Deploy to Base Sepolia — broadcasts a real tx. Needs DEPLOYER_PRIVATE_KEY
	@[ -n "$$DEPLOYER_PRIVATE_KEY" ] || { echo "DEPLOYER_PRIVATE_KEY is not set"; exit 1; }
	cd $(CONTRACTS_DIR) && \
		WORLD_ID_ADDRESS=$(WORLD_ID_ADDRESS) \
		forge script script/DeployVeyraRegistry.s.sol:DeployVeyraRegistry \
			--rpc-url $(RPC_URL) --broadcast -vvv

register-user: ## Register your wallet in the registry. Needs PRIVATE_KEY=0x...
	@[ -n "$(PRIVATE_KEY)" ] || { echo "usage: make register-user PRIVATE_KEY=0x..."; exit 1; }
	cast send $(REGISTRY_ADDRESS) "registerUser(bytes,uint32)" 0x00 0 \
		--rpc-url $(RPC_URL) --private-key $(PRIVATE_KEY)

store-secret: ## Store a secret payload. Needs PRIVATE_KEY=0x... [SECRET_ID= SECRET_NAME= SECRET_VALUE=]
	@[ -n "$(PRIVATE_KEY)" ] || { echo "usage: make store-secret PRIVATE_KEY=0x..."; exit 1; }
	cast send $(REGISTRY_ADDRESS) "storeSecret(bytes32,string,bytes)" \
		$(SECRET_ID) "$(SECRET_NAME)" $(SECRET_VALUE) \
		--rpc-url $(RPC_URL) --private-key $(PRIVATE_KEY)

block: ## Print the latest chain block — handy for LISTENER_STARTING_BLOCK
	@cast block-number --rpc-url $(RPC_URL)

abi: ## Print the VeyraRegistry ABI (requires `make build-contracts` first)
	@cat $(CONTRACTS_DIR)/out/VeyraRegistry.sol/VeyraRegistry.json | \
		node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).abi,null,2)))"

# ---------------------------------------------------------------------------
##@ Bazantic (agent gateway)

NGROK_URL ?= https://yoga-delouse-thread.ngrok-free.dev

bazantic-login: ## Sign in to Bazantic (opens a browser approval URL)
	baz login

bazantic-whoami: ## Show the signed-in Bazantic account and scopes
	@baz whoami

bazantic-spec: ## Check the OpenAPI spec Bazantic will fetch is reachable
	@curl -s -o /dev/null -w "  $(NGROK_URL)/openapi.yaml  status=%{http_code}\n" --max-time 20 $(NGROK_URL)/openapi.yaml
	@echo "  (must be 200 before bazantic-gateway — the spec is fetched server-side)"

bazantic-gateway: ## Register the Veyra gateway. Needs login + a live NGROK_URL
	baz gateway add \
		--spec-url $(NGROK_URL)/openapi.yaml \
		--endpoint $(NGROK_URL) \
		--name "Veyra Agent Capability Broker" \
		--auth-type api-key \
		--status active --json

bazantic-slug: ## Print your gateway slugs (the 26-char base32 IDs the recipe needs)
	@baz gateway list --json

bazantic-recipe: ## Create the recipe draft from bazantic-recipe.json
	@grep -q REPLACE_WITH bazantic-recipe.json \
		&& { echo "bazantic-recipe.json still has placeholder slugs — run 'make bazantic-slug' and fill them in"; exit 1; } \
		|| baz recipe create bazantic-recipe.json --json

bazantic-publish: ## Publish the recipe draft. Needs HANDLE=<handle>
	@[ -n "$(HANDLE)" ] || { echo "usage: make bazantic-publish HANDLE=<handle>"; exit 1; }
	baz recipe publish $(HANDLE) --json

# ---------------------------------------------------------------------------
##@ Housekeeping

status: ## Show what is installed, configured and currently running
	@echo "deps:"
	@for d in apps/frontend apps/backend blockchain/packages; do \
		printf "  %-24s node_modules=%s\n" "$$d" "$$([ -d $(ROOT)/$$d/node_modules ] && echo yes || echo NO)"; \
	done
	@echo "env:"
	@printf "  %-24s %s\n" "apps/frontend/.env.local" "$$([ -f $(FRONTEND_DIR)/.env.local ] && echo present || echo MISSING)"
	@printf "  %-24s %s\n" "apps/backend/.env" "$$([ -f $(BACKEND_DIR)/.env ] && echo present || echo MISSING)"
	@echo "ports:"
	@for p in $(FRONTEND_PORT) $(BACKEND_PORT) $(ANVIL_PORT); do \
		pid=$$(lsof -ti tcp:$$p -sTCP:LISTEN 2>/dev/null | head -1); \
		printf "  %-24s %s\n" ":$$p" "$$([ -n "$$pid" ] && echo "listening (pid $$pid)" || echo free)"; \
	done

kill: ## Free ports 3000, 3001 and 8545
	@for p in $(FRONTEND_PORT) $(BACKEND_PORT) $(ANVIL_PORT); do \
		pid=$$(lsof -ti tcp:$$p -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$pid" ]; then kill $$pid && echo "killed pid $$pid on :$$p"; else echo ":$$p already free"; fi; \
	done

clean: ## Remove build output (.next, dist, forge out/cache)
	rm -rf $(FRONTEND_DIR)/.next $(BACKEND_DIR)/dist
	forge clean --root $(CONTRACTS_DIR)

clean-deps: ## Remove every node_modules directory
	rm -rf $(FRONTEND_DIR)/node_modules $(BACKEND_DIR)/node_modules $(BROKER_DIR)/node_modules

reinstall: clean-deps install ## Nuke node_modules and reinstall

.PHONY: help setup install install-frontend install-backend install-contracts \
	install-broker env env-frontend env-backend doctor dev dev-frontend dev-backend \
	anvil start open sandbox build build-frontend build-backend build-contracts \
	typecheck typecheck-frontend typecheck-backend test test-backend test-contracts \
	test-gas fmt fmt-check check deploy-local deploy-base-sepolia register-user \
	store-secret block abi bazantic-login bazantic-whoami bazantic-spec \
	bazantic-gateway bazantic-slug bazantic-recipe bazantic-publish \
	status kill clean clean-deps reinstall
