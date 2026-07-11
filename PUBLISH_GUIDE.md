# Publish to GitHub - Step by Step

Your local repo is ready (branch `main`, one commit). Now push to GitHub.

## Option 1: Create repo on GitHub website (easiest)

1. Go to https://github.com/new
2. **Repository name:** `mcp-deep-research-server`
3. **Description:** `Non-generic Deep Research MCP Server - search, scrape, synthesize, fact-check, persistent memory`
4. **Public** or Private - your choice
5. **IMPORTANT:** Leave UNCHECKED:
   - ❌ Don't add README
   - ❌ Don't add .gitignore
   - ❌ Don't add license (we already have)
6. Click **Create repository**

GitHub will show you a page with commands. Use these:

```bash
cd /home/user/mcp-deep-research

# Replace YOUR_USERNAME with your GitHub username!
git remote add origin https://github.com/YOUR_USERNAME/mcp-deep-research-server.git
git push -u origin main
```

### If asked for password (GitHub no longer uses passwords):

You need a Personal Access Token (PAT).

**Create PAT:**
1. Go to https://github.com/settings/tokens/new
   - Select **Fine-grained personal access tokens** (recommended) or Classic
   - For classic: check `repo` scope
   - For fine-grained: Repository access: All repos or Only select repos -> choose your new repo, Permissions: Contents = Read and Write
2. Generate and copy token (starts with `github_pat_...` or `ghp_...`)

**Push with token:**
```bash
# Method A: Paste token when asked for password, username = your GitHub username

# Method B: Embed in URL (replace USERNAME and TOKEN)
git remote remove origin
git remote add origin https://USERNAME:TOKEN@github.com/USERNAME/mcp-deep-research-server.git
git push -u origin main

# Then remove token from URL for security:
git remote set-url origin https://github.com/USERNAME/mcp-deep-research-server.git
```

## Option 2: Using GitHub CLI (if you install `gh`)

```bash
gh auth login
cd /home/user/mcp-deep-research
gh repo create mcp-deep-research-server --public --source=. --remote=origin --push
```

## Option 3: I push for you

If you give me a PAT, I can push directly. Run:

```bash
# Set these env vars then tell the agent to run publish.sh
export GITHUB_USERNAME=your_username
export GITHUB_TOKEN=your_pat_token
export REPO_NAME=mcp-deep-research-server
./publish.sh
```

## After Publish - Make it discoverable

1. Add topics on GitHub repo page: `mcp`, `model-context-protocol`, `research`, `claude`, `ai`, `search`, `scraping`, `typescript`
2. Edit About section: add description and website
3. Create a release:
```bash
git tag v1.0.0
git push origin v1.0.0
# Then go to GitHub -> Releases -> Draft new release
```

4. Test installation:
```bash
npm publish (optional, if you want to put on npm)
```

Your repo is ready to publish - just replace YOUR_USERNAME!
