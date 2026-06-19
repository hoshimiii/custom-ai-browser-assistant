# Privacy and Permissions

Custom AI Browser Assistant is a BYOK browser extension. It does not include a vendor-hosted backend and does not send data to the project author.

## Data Flow

The extension sends content only to the API endpoint configured by the user in the options page:

```text
Chrome extension -> user-configured Base URL -> user-selected model provider
```

Depending on the user action, the request may include:

- Chat messages typed into the side panel.
- Current page or selected-region text when the user sends a side panel question from a webpage.
- Selected text from the active page.
- Extracted text from the active page.
- YouTube page metadata, description, visible transcript, and visible page text.
- PDF page metadata and any extractable visible text.
- Screenshot image data when the user clicks screenshot Q&A.
- Saved-page library snapshots when the user asks questions against saved content.

No page content is sent automatically on page load. User action is required. When the user sends a side panel question on a readable webpage, the extension includes the current page or selected-region context by default.

## Local Storage

The extension stores the following data in `chrome.storage.local`:

- API settings, including Base URL, API Key, model name, system prompt, and preferences.
- Recent conversation history, if enabled.
- Saved-page library snapshots.

Users can export or import this data from the options page. Backups do not include the API key by default; exporting the API key requires explicitly enabling the API-key checkbox. Users can also clear stored conversation history and delete saved pages from the side panel.

## Permissions

- `activeTab`: lets the extension interact with the current tab after user action.
- `contextMenus`: enables right-click actions for selected text and page summaries.
- `scripting`: supports controlled content-script workflows.
- `sidePanel`: provides the main assistant interface.
- `storage`: stores settings, history, and saved pages locally.
- `tabs`: supports active tab lookup and visible-tab screenshot capture.
- `host_permissions`: allows content scripts and local/API requests for user-configured sites and endpoints.

## API Keys

API keys are stored locally in Chrome extension storage. They are included only in requests sent to the configured API Base URL.

Do not configure an API endpoint you do not trust. If the endpoint is remote, page content and prompts sent through the extension may be processed by that remote service.

## Project Scope

This project does not modify Monica or bypass any third-party paid feature. It is an independent extension that implements similar browser assistant workflows with user-provided model access.
