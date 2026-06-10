# GitHub Private Repository Setup

The local repository is ready to push. If GitHub CLI is installed:

```powershell
cd E:\codes\custom-ai-browser-assistant
gh repo create custom-ai-browser-assistant --private --source . --remote origin --push
```

The repository includes `.github/workflows/ci.yml`; GitHub Actions will run `npm run verify` on push and pull requests.

If GitHub CLI is not installed:

1. Create a private repository named `custom-ai-browser-assistant` on GitHub.
2. Copy the repository URL.
3. Run:

```powershell
cd E:\codes\custom-ai-browser-assistant
git remote add origin https://github.com/<owner>/custom-ai-browser-assistant.git
git branch -M main
git push -u origin main
```

If using a personal access token, use GitHub's standard HTTPS token authentication flow instead of storing tokens in the repository.
