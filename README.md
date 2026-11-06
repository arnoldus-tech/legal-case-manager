# Legal Case Manager for Google Workspace

A lightweight matter intake and case management system for a small in-house legal team, built entirely on Google Workspace: **Sheets** as the register, **Drive** for matter folders, **Gmail** for correspondence, **Docs** for matter notes and **Slides** for reporting – glued together with Google Apps Script.

> Status: working prototype / mock-up. The UI and documentation for end users are in Danish; code comments are mostly Danish.

## What it does

| Area | Functionality |
|---|---|
| **Intake** | Web form creates a matter with a unique number (`KON-2026-0007` = area code, year, running number), a Drive folder structure, a matter note (from an optional template) and a Gmail label |
| **Matter areas** | Configurable legal areas (contracts, employment, corporate, GDPR, …), each with its own Drive folder |
| **Email filing** | Emails with `[MATTER-NO]` in the subject are labelled, archived on the matter as PDF (+ attachments) and logged. De-duplicated across team mailboxes via `Message-ID` |
| **Documents** | Files in the matter folder are registered; Google Docs edits are counted per day |
| **Time estimate** | Effort is *estimated* from logged emails and documents using configurable rates, plus optional manual time entries |
| **Dashboard** | Open/closed matters, distribution by area, overdue deadlines, workload per lawyer, estimated time by area and activity type, most time-consuming matters |
| **Collaboration** | Team members get access to the whole matter; external parties only to the `03 Delt med eksterne` (shared with externals) subfolder |
| **Reporting** | One click builds a Google Slides deck with KPIs, charts linked to the register, and matter lists |

## Architecture

```
Google Sheet "Sagsregister" (bound Apps Script)
 ├─ Sager            one row per matter
 ├─ Områder          legal areas + Drive folder IDs
 ├─ Aktivitet        activity log (emails, documents, status changes, time)
 ├─ Indstillinger    rates and options
 └─ Rapportdata      generated chart data for Slides

Drive  Sagsstyring/
 ├─ 00 System/       the register
 ├─ 01 Sager/<Area>/<Matter-no> – <Title>/
 │     ├─ 01 Korrespondance   archived emails
 │     ├─ 02 Dokumenter
 │     └─ 03 Delt med eksterne
 ├─ 02 Rapporter/    generated Slides reports
 └─ 03 Skabeloner/   matter note templates

Gmail  label "Sager/<Matter-no>" per matter
Web app (HtmlService + Google Charts): dashboard, matter list, intake form
```

## Design principles

- **Least privilege.** Each user syncs only their own mailbox, under their own authorisation. No domain-wide delegation or service account with access to everyone's email.
- **No hard-coded IDs.** Setup discovers or creates the folder structure and stores IDs in Script Properties, so the code can be deployed to any Drive.
- **Protected tabs.** Sheet tabs listed in `BESKYTTEDE_FANER` are never read, modified or exported by the code.
- **Estimates are labelled as estimates** – everywhere they are shown.

## Roadmap

Email filing is being redesigned to work like matter-centric email management in legal DMS platforms, so that users do **not** have to remember a subject tag:

1. **Thread recognition** – replies in a filed thread are filed automatically (`In-Reply-To` / `References`)
2. **"Unfiled" queue** – suggestions for emails the system could not place, visible only to the mailbox owner
3. **Gmail add-on** – "File to matter" and "Create matter from this email" in the Gmail side panel
4. **Contact recognition** – emails to/from a matter's registered contacts, with a staged read policy (headers first, body only when there is a signal)
5. **Archive as `.eml` + PDF**, a searchable email list per matter, and **"Get this email in my Gmail"** (re-import from the archive so a colleague can reply in the original thread – e.g. during holidays), with per-matter deputies
6. **Confidential matters** – separate register and folder, access approved by the responsible lawyer and the head of legal
7. **AI triage** – suggested area, priority, deadline and summary for new matters (data governance to be defined first)

## Setup

Prerequisites: a Google account, [Node.js](https://nodejs.org/) and [clasp](https://github.com/google/clasp).

1. Create a Google Sheet (e.g. `Sagsstyring/00 System/Sagsregister`) and open **Extensions → Apps Script**. Copy the script ID from **Project Settings**.
2. Enable the Apps Script API at <https://script.google.com/home/usersettings>.
3. Clone this repo, then:
   ```bash
   npm install -g @google/clasp
   clasp login
   cp .clasp.json.example .clasp.json   # paste your script ID
   clasp push
   ```
4. Reload the sheet and run **⚖️ Sagsstyring → Opsætning (kør første gang)**. Setup creates the tabs and folders, and installs a 15-minute sync trigger.
5. Optional: **Deploy → New deployment → Web app** (execute as *user accessing*, access *anyone with a Google account*). Only users with access to the register can see any data.

`Testdata.gs` contains `opretTestsager()` / `sletTestsager()` to create and remove 20 demo matters.

End-user guide (Danish): [docs/VEJLEDNING.md](docs/VEJLEDNING.md)

## Privacy note

All matter data stays in the user's own Google account/Workspace. The repository contains code only – no register data, no email, and no IDs. `.clasp.json` (script binding) and `.clasprc.json` (credentials) are git-ignored.

## Licence

Not yet decided.
