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
  SETTINGS: 'Settings', REPORT: 'Report data'
};

const MATTER_COLS = ['Matter no', 'Title', 'Area', 'Sub-area', 'Status', 'Priority', 'Owner', 'Team', 'External contacts',
  'Client/department', 'Opened', 'Deadline', 'Closed', 'Folder', 'Folder ID', 'Description',
  'Emails in', 'Emails out', 'Documents', 'Size (MB)', 'Last sync'];
const AREA_COLS = ['Area', 'Code', 'Folder ID', 'Folder', 'Sub-areas'];
const ACTIVITY_COLS = ['Timestamp', 'Matter no', 'Area', 'Type', 'Title', 'Person', 'Link', 'Key', 'Source'];
/** One row per filed email – the basis for the email list. */
const EMAIL_COLS = ['Matter no', 'Date', 'Direction', 'From', 'To', 'Cc', 'Subject', 'Attachments', 'Thread',
  'Message-ID', 'PDF', 'EML', 'Source', 'Filed by', 'Size (KB)'];

const STATUSES = ['New', 'Open', 'On hold', 'Closed'];
const PRIORITIES = ['High', 'Normal', 'Low'];
const ACT = {
  EMAIL_IN: 'Email in', EMAIL_OUT: 'Email out', DOC_ADDED: 'Document added',
  DOC_EDITED: 'Document edited', STATUS: 'Status', OPENED: 'Matter opened'
};

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
  NOTE_TEMPLATE: 'Matter note template (Doc ID, optional)'
};
const DEFAULT_SETTINGS = [
  [SETTING.SAVE_PDF, 'YES'], [SETTING.SAVE_EML, 'YES'], [SETTING.SAVE_ATTACHMENTS, 'YES'],
  [SETTING.INTERNAL, ''], [SETTING.PRIVATE_LABEL, 'Private'], [SETTING.EXCLUDED, ''], [SETTING.NOTE_TEMPLATE, '']
];

/** A matter number anywhere in a text, e.g. COM-2026-0007. */
const MATTER_NO_RE = /[A-Z]{2,5}-\d{4}-\d{4}/g;
/** Free-mail domains do not count as "same company domain" when suggesting a matter. */
const FREE_MAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.dk', 'outlook.com', 'outlook.dk',
  'live.com', 'live.dk', 'msn.com', 'yahoo.com', 'yahoo.dk', 'icloud.com', 'me.com', 'mail.dk'];
