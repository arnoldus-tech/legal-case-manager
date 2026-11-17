# User guide

## Everyday use

| Task | How |
|---|---|
| **Open a matter** | Web app → **New matter** (or the menu ⚖️ Matters → New matter…). Status **New** means an incoming request that has not been triaged yet |
| **Email about a matter** | Just reply in the conversation – replies to filed emails are filed automatically. For a brand-new email, **New email** in the matter list opens Gmail with the matter number in the subject |
| **Emails that were not filed** | **Unfiled** shows emails from your own inbox that may belong to a matter. File them with one click, open a new matter from them, or mark them as *Not a matter* |
| **Documents** | Create Google Docs/Sheets or drop files into the matter folder |
| **Status** | Use the status drop-down in the matter list or in the sheet (New, Open, On hold, Closed). The closing date is set automatically |
| **Find an email** | **Emails** – filter, sort, group by conversation, or search the content of emails and attachments |
| **Report** | **Slides report** in the web app or the menu. The charts are linked to the register and can be refreshed in Slides |

Sync runs every 15 minutes. Closed matters are synced for 30 days after closing.

## How emails find their matter

Filed automatically:
1. Replies to an email that is already filed (also when the subject has changed)
2. Emails in a conversation that carries the matter's Gmail label
3. Emails sent to the matter's plus address, e.g. `legal+COM-2026-0007@company.com`
4. Emails that mention the matter number in the subject

Suggested in **Unfiled** (only visible to you): emails from a matter's external contact, from the same company domain, or with a subject resembling the matter title.

Never touched: conversations labelled `Private`, excluded domains (see the Settings sheet), newsletters, automated mail and Google's own notifications.

## The team

- Share the root folder (as editor) with everyone in the legal team.
- Each team member opens the register once and chooses **⚖️ Matters → Enable automatic email sync for me**. The same email in several inboxes is only filed once.
- Enter the team's addresses or company domain under **Settings → Internal addresses/domains**, so incoming and outgoing emails are told apart.

## Sharing

The team members entered on a matter get edit access to its folder. To add a colleague later, use **Share** in the matter list or the menu.
External contacts are recorded on the matter only so that their emails can be recognised – nothing is shared with them.

## Customising

- **Areas:** edit the **Areas** sheet (name + code of 2–5 letters). Sub-areas are entered comma-separated in the *Sub-areas* column. Folders are created automatically.
- **Matter note template:** create a Google Doc in `03 Templates` with placeholders such as `{{MATTER_NO}}`, `{{TAG}}`, `{{TITLE}}`, `{{AREA}}`, `{{OWNER}}`, `{{CLIENT}}`, `{{DEADLINE}}`, `{{DESCRIPTION}}` and `{{OPENED}}`, and put its ID in Settings.

## Limitations

- **Several Google accounts in one browser** can cause *PERMISSION_DENIED*. Use a browser profile signed in only to the account that runs the system.
- **Gmail sync is per user.** Each team member enables it once.
- **Confidentiality:** consider whether storing matters in Google is acceptable for your matter types (data processing agreement, EU data location). For production use, Google Workspace is recommended over personal accounts.
