/**
 * Legal Matter Manager – configuration and constants.
 *
 * A matter intake and management system for an in-house legal team, built on
 * Google Workspace and bound to the "Matter register" spreadsheet.
 * No Drive IDs live in the code: setup() discovers or creates the folder
 * structure and stores the IDs in Script Properties.
 */

const CFG = {
  TIMEZONE: 'Europe/Copenhagen',
  LABEL_ROOT: 'Matters',                 // Gmail label: Matters/<matter no>
  MAX_RUN_MS: 4.5 * 60 * 1000,           // Apps Script stops executions after 6 minutes
  FIRST_SCAN_DAYS: 14,                   // how far back the first inbox scan looks
  MAX_UNFILED: 200,                      // max suggestions per user in the Unfiled queue
  DEMO_PREFIX: 'DEMO – '                 // marks demo matters in Client/department
};

const SHEETS = {
  MATTERS: 'Matters', AREAS: 'Areas', ACTIVITY: 'Activity', EMAILS: 'Emails',
  SETTINGS: 'Settings', REPORT: 'Report data', TEMPLATES: 'Templates', ESCALATION: 'Escalation rules'
};

const MATTER_COLS = ['Matter no', 'Title', 'Area', 'Sub-area', 'Status', 'Priority', 'Owner', 'Team', 'External contacts',
  'Client/department', 'Opened', 'Deadline', 'Closed', 'Folder', 'Folder ID', 'Description',
  'Emails', 'Documents', 'Size (MB)', 'Last sync', 'Requester'];
const AREA_COLS = ['Area', 'Code', 'Folder ID', 'Folder', 'Sub-areas'];
const ACTIVITY_COLS = ['Timestamp', 'Matter no', 'Area', 'Type', 'Title', 'Person', 'Link', 'Key', 'Source'];
/** One row per filed email – the basis for the email list. */
const EMAIL_COLS = ['Matter no', 'Date', 'Direction', 'From', 'To', 'Cc', 'Subject', 'Attachments', 'Thread',
  'Message-ID', 'PDF', 'EML', 'Source', 'Filed by', 'Size (KB)'];

const STATUSES = ['New', 'Open', 'On hold', 'Closed'];
const PRIORITIES = ['High', 'Normal', 'Low'];
const ACT = {
  EMAIL_IN: 'Email in', EMAIL_OUT: 'Email out', DOC_ADDED: 'Document added',
  DOC_EDITED: 'Document edited', STATUS: 'Status', OPENED: 'Matter opened',
  HANDOVER: 'Handed over to legal', SELF_SERVICE: 'Self-service completed'
};

/** Templates the AI assistant may offer. "Doc ID" is filled in by setup for the demo template. */
const TEMPLATE_COLS = ['Template', 'Doc ID', 'Self-service when', 'Fields', 'Hand over to a lawyer if'];
const DEFAULT_TEMPLATES = [
  ['Mutual NDA (demo)', '',
    'Both parties share confidential information for evaluating a possible cooperation, on our own template, without changes',
    'COUNTERPARTY_NAME, COUNTERPARTY_ADDRESS, COUNTERPARTY_COUNTRY, PURPOSE, TERM_YEARS, EFFECTIVE_DATE, OUR_SIGNATORY',
    'The counterparty wants its own template or changes; one-way NDA; export-controlled or classified information; the counterparty is a competitor']
];

/** Situations where the assistant must always hand the matter to a lawyer instead of completing it. */
const ESCALATION_COLS = ['Rule', 'Why'];
const DEFAULT_ESCALATION = [
  ['The counterparty is a competitor', 'Competition law – sharing information with competitors needs legal review'],
  ['Export-controlled, defence-related or classified information is involved', 'Export control and security rules'],
  ['A dispute, claim, threat of litigation or contact from an authority', 'Needs a lawyer from the first step'],
  ['Inside information, share trading or company announcements', 'Market abuse rules for listed companies'],
  ['Personal data is transferred to a new supplier or outside the EU', 'Data protection – a data processing agreement or transfer assessment is needed'],
  ['The counterparty\'s own contract terms, or any change to our template', 'Non-standard terms need legal review'],
  ['Value above EUR 250,000, unlimited liability, or exclusivity', 'Material commercial risk'],
  ['The requester is unsure, or the situation does not fit a template', 'When in doubt, a lawyer decides']
];

const SYSTEM_FOLDER = '00 System';
/** Folders that setup ensures exist in the root folder. Key = Script Property. */
const MAIN_FOLDERS = { MATTERS_FOLDER_ID: '01 Matters', REPORTS_FOLDER_ID: '02 Reports', TEMPLATES_FOLDER_ID: '03 Templates' };
const SUBFOLDERS = { MAIL: '01 Correspondence', DOCS: '02 Documents' };
/** Original emails (.eml) go into a subfolder so the correspondence folder shows only readable PDFs. */
const EML_FOLDER = 'Originals (.eml)';

/**
 * Default matter areas for the legal function of a listed company: [name, code, sub-areas].
 * A matter in an area with sub-areas must have one of them.
 */
const DEFAULT_AREAS = [
  ['Capital markets & disclosure', 'CAP', ''],
  ['Corporate', 'CORP', ''],
  ['Governance', 'GOV', ''],
  ['M&A & transactions', 'MA', ''],
  ['Commercial contracts', 'COM', 'Sales, Procurement, Collaboration'],
  ['IT & technology', 'IT', ''],
  ['Intellectual property', 'IP', 'Patents & designs, Trademarks & domains, Licensing & know-how, NDAs'],
  ['Employment & HR', 'EMP', ''],
  ['Data protection & security', 'DATA', ''],
  ['Export control & sanctions', 'EXP', ''],
  ['Compliance & ethics', 'CMP', ''],
  ['Competition law', 'ANT', ''],
  ['ESG & sustainability', 'ESG', ''],
  ['Disputes & claims', 'DIS', ''],
  ['General advice', 'GEN', '']
];

const SETTING = {
  SAVE_PDF: 'Save emails as PDF (YES/NO)',
  SAVE_EML: 'Save original .eml (YES/NO)',
  SAVE_ATTACHMENTS: 'Save attachments (YES/NO)',
  INTERNAL: 'Internal addresses/domains (comma-separated)',
  PRIVATE_LABEL: 'Gmail label for private emails (never touched)',
  EXCLUDED: 'Excluded domains/addresses (comma-separated)',
  NOTE_TEMPLATE: 'Matter note template (Doc ID, optional)',
  DEFAULT_OWNER: 'Lawyer who receives requests from the AI assistant (email)'
};
const DEFAULT_SETTINGS = [
  [SETTING.SAVE_PDF, 'YES'], [SETTING.SAVE_EML, 'YES'], [SETTING.SAVE_ATTACHMENTS, 'YES'],
  [SETTING.INTERNAL, ''], [SETTING.PRIVATE_LABEL, 'Private'], [SETTING.EXCLUDED, ''], [SETTING.NOTE_TEMPLATE, ''],
  [SETTING.DEFAULT_OWNER, '']
];

/** A matter number anywhere in a text, e.g. COM-2026-0007. */
const MATTER_NO_RE = /[A-Z]{2,5}-\d{4}-\d{4}/g;
/** Free-mail domains do not count as "same company domain" when suggesting a matter. */
const FREE_MAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.dk', 'outlook.com', 'outlook.dk',
  'live.com', 'live.dk', 'msn.com', 'yahoo.com', 'yahoo.dk', 'icloud.com', 'me.com', 'mail.dk'];
