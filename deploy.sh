#!/bin/bash
set -e

# POPS Deployment Script
# Usage: ./deploy.sh [options]
#
# Simple one-command deployment to N95 server.
# Runs Ansible playbook to deploy latest code.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Options
DRY_RUN=false
VERBOSE=false
SKIP_CHECKS=false
AUTO_CONFIRM=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run|--check)
            DRY_RUN=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        -y|--yes)
            AUTO_CONFIRM=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./deploy.sh [options]"
            echo ""
            echo "Options:"
            echo "  --dry-run, --check    Run in check mode (no changes)"
            echo "  -v, --verbose         Verbose Ansible output"
            echo "  --skip-checks         Skip pre-deployment quality checks"
            echo "  -y, --yes             Skip confirmation prompt"
            echo "  -h, --help           Show this help"
            echo ""
            echo "Examples:"
            echo "  ./deploy.sh                 # Deploy to production"
            echo "  ./deploy.sh --dry-run       # Preview changes"
            echo "  ./deploy.sh -v              # Deploy with verbose output"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}POPS Deployment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v ansible-playbook &> /dev/null; then
    echo -e "${RED}✗ Ansible not found${NC}"
    echo "Install: brew install ansible"
    exit 1
fi
echo -e "${GREEN}✓ Ansible installed${NC}"

if [ ! -f ~/.ansible/pops-vault-password ]; then
    echo -e "${RED}✗ Vault password not found${NC}"
    echo "Create: echo 'your-password' > ~/.ansible/pops-vault-password && chmod 600 ~/.ansible/pops-vault-password"
    exit 1
fi
echo -e "${GREEN}✓ Vault password configured${NC}"

if [ ! -f ~/.ssh/pops_n95 ]; then
    echo -e "${RED}✗ SSH key not found${NC}"
    echo "Expected: ~/.ssh/pops_n95"
    exit 1
fi
echo -e "${GREEN}✓ SSH key found${NC}"

# Test SSH connection
echo -e "${YELLOW}Testing SSH connection...${NC}"
if ssh -p 2222 -i ~/.ssh/pops_n95 -o ConnectTimeout=5 pops@pops.local "echo 'SSH OK'" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ SSH connection successful${NC}"
else
    echo -e "${RED}✗ Cannot connect to N95${NC}"
    echo "Check that N95 is reachable at pops.local:2222"
    exit 1
fi

echo ""

# Run quality checks
if [ "$SKIP_CHECKS" = false ]; then
    echo -e "${YELLOW}Running quality checks...${NC}"

    # Build shared packages first
    echo -e "${BLUE}Shared packages:${NC}"
    cd packages/db-types

    if ! yarn build; then
        echo -e "${RED}✗ Failed to build db-types${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ db-types built${NC}"

    cd ../..

    # Check finance-api
    echo -e "${BLUE}Finance API:${NC}"
    cd apps/finance-api

    if ! yarn typecheck; then
        echo -e "${RED}✗ TypeScript errors in finance-api${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ TypeScript passed${NC}"

    if ! yarn test --run; then
        echo -e "${RED}✗ Tests failed in finance-api${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Tests passed${NC}"

    cd ../..

    # Check pops-pwa
    echo -e "${BLUE}PWA:${NC}"
    cd apps/pops-pwa

    if ! yarn typecheck; then
        echo -e "${RED}✗ TypeScript errors in pops-pwa${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ TypeScript passed${NC}"

    cd ../..

    echo -e "${GREEN}✓ All quality checks passed${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠ Skipping quality checks${NC}"
    echo ""
fi

# Get next version number
echo -e "${YELLOW}Determining version number...${NC}"

# Get latest version tag (format: v1, v2, v3, etc.)
LATEST_TAG=$(git tag -l "v[0-9]*" | sort -V | tail -n 1)

if [ -z "$LATEST_TAG" ]; then
    # No existing tags, start at v1
    NEXT_VERSION="v1"
else
    # Extract number and increment
    CURRENT_NUM=$(echo "$LATEST_TAG" | sed 's/v//')
    NEXT_NUM=$((CURRENT_NUM + 1))
    NEXT_VERSION="v$NEXT_NUM"
fi

echo -e "${GREEN}✓ Next version: $NEXT_VERSION${NC}"
echo ""

# Show deployment info
echo -e "${BLUE}Deployment details:${NC}"
echo "  Target: pops.local (N95 server)"
echo "  Branch: $(git branch --show-current)"
echo "  Commit: $(git rev-parse --short HEAD)"
echo "  Version: $NEXT_VERSION"
echo "  Mode: $([ "$DRY_RUN" = true ] && echo "DRY RUN (check only)" || echo "PRODUCTION")"
echo ""

# Confirm deployment
if [ "$DRY_RUN" = false ] && [ "$AUTO_CONFIRM" = false ]; then
    read -p "Deploy $NEXT_VERSION to production? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Deployment cancelled${NC}"
        exit 0
    fi
    echo ""
fi

# Run Ansible deployment
echo -e "${YELLOW}Running Ansible deployment...${NC}"
echo ""

ANSIBLE_ARGS="-i inventory/hosts.yml --vault-password-file ~/.ansible/pops-vault-password"

if [ "$DRY_RUN" = true ]; then
    ANSIBLE_ARGS="$ANSIBLE_ARGS --check"
fi

if [ "$VERBOSE" = true ]; then
    ANSIBLE_ARGS="$ANSIBLE_ARGS -vv"
fi

if (cd infra/ansible && ansible-playbook playbooks/deploy.yml $ANSIBLE_ARGS); then
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ Deployment successful!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ "$DRY_RUN" = false ]; then
        # Create and push git tag
        echo ""
        echo -e "${YELLOW}Tagging release...${NC}"

        COMMIT_MSG="Deploy $NEXT_VERSION to production

Deployed services:
- finance-api: $(cd apps/finance-api && git log -1 --pretty=format:'%h %s')
- pops-pwa: $(cd apps/pops-pwa && git log -1 --pretty=format:'%h %s')

Deployed at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Deployed to: pops.local (N95)"

        git tag -a "$NEXT_VERSION" -m "$COMMIT_MSG"
        echo -e "${GREEN}✓ Created tag $NEXT_VERSION${NC}"

        # Push tag to remote
        if git push origin "$NEXT_VERSION"; then
            echo -e "${GREEN}✓ Pushed tag to remote${NC}"
        else
            echo -e "${YELLOW}⚠ Failed to push tag (continuing anyway)${NC}"
        fi

        echo ""
        echo "Services deployed:"
        echo "  • Finance API:    http://localhost:3000"
        echo "  • PWA:            https://pops.jmiranda.dev"
        echo "  • Metabase:       http://localhost:3001"
        echo ""
        echo "Version: $NEXT_VERSION"
        echo ""
        echo "Check status:"
        echo "  ssh -p 2222 pops@pops.local 'cd /opt/pops && docker compose ps'"
        echo ""
        echo "View logs:"
        echo "  ssh -p 2222 pops@pops.local 'cd /opt/pops && docker compose logs -f'"
    fi
else
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}✗ Deployment failed${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Check Ansible output above for errors"
    echo ""
    echo "View server logs:"
    echo "  ssh -p 2222 pops@pops.local 'cd /opt/pops && docker compose logs --tail=50'"
    exit 1
fi
