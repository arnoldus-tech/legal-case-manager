/**
 * "Ask Legal" – an AI intake assistant (showcase).
 *
 * Employees describe what they need. The assistant asks follow-up questions, opens the matter,
 * produces a draft from a template for standard requests (self-service) and hands everything
 * else to a lawyer with a prepared summary. It only acts through the tools defined below.
 *
 * Calls the Claude API over HTTPS (Apps Script has no official Anthropic SDK). The API key is
 * kept in Script Properties – never in the code.
 */

const AI = {
  URL: 'https://api.anthropic.com/v1/messages',
  VERSION: '2026-10-21',
  MODEL: 'claude-opus-5-5',
  EFFORT: 'low',              // chat: short waits; raise to 'medium' if intake quality needs it
  MAX_TOKENS: 8000,
  MAX_TOOL_ROUNDS: 6,
  // On a safety decline the API re-runs the request on Anthropic's recommended fallback model
  FALLBACK_BETA: 'server-side-fallback-2026-07-01'
};

// ---------- menu ----------

function showAskLegal() { showApp_('ask', 'Ask Legal', 900, 860); }

function setAiKey() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('AI assistant – API key',
    'Paste your Anthropic API key (starts with "sk-ant-"). It is stored in this script\'s properties, not in the code.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const key = res.getResponseText().trim();
  if (!/^sk-ant-/.test(key)) { ui.alert('That does not look like an Anthropic API key.'); return; }
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', key);
  ui.alert('The key is saved. Choose AI assistant → Test the connection.');
}

function testAiConnection() {
  const res = callClaude_([{ type: 'text', text: 'You are a connection test.' }],
    [{ role: 'user', content: 'Reply with the single word: connected' }], []);
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
  SpreadsheetApp.getUi().alert('AI assistant', 'Model ' + res.model + ' replied: ' + text, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ---------- conversation ----------

/**
 * One user turn. The client keeps the conversation (API message format) and sends it back each
 * time, so the server holds no state. Returns the updated conversation, the assistant's reply and
 * the actions taken (matter opened, draft created, handed over …) for the chat to display.
 */
function askLegal(history, text) {
  const messages = (history || []).slice();
  const last = messages[messages.length - 1];
  // After a turn that ended on tool results, the next user text joins that user message
  if (last && last.role === 'user') last.content = [].concat(last.content).concat([{ type: 'text', text: text }]);
  else messages.push({ role: 'user', content: text });

  const ctx = { requester: Session.getActiveUser().getEmail() || '', messages: messages, events: [] };
  const system = systemPrompt_();
  const replies = [];
  for (let round = 0; round < AI.MAX_TOOL_ROUNDS; round++) {
    const res = callClaude_(system, messages, TOOLS_);
    messages.push({ role: 'assistant', content: res.content });
    res.content.filter(b => b.type === 'text' && b.text.trim()).forEach(b => replies.push(b.text));
    if (res.stop_reason === 'refusal') {
      replies.push('I can\'t help with this request here. Please contact the legal team directly.');
      break;
    }
    if (res.stop_reason !== 'tool_use') break;
    const results = res.content.filter(b => b.type === 'tool_use').map(b => runTool_(b, ctx));
    messages.push({ role: 'user', content: results });
  }
  return { messages: messages, reply: replies.join('\n\n'), events: ctx.events };
}

function callClaude_(system, messages, tools) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('No API key yet. Choose ⚖️ Matters → AI assistant → Set API key…');
  const body = { model: AI.MODEL, max_tokens: AI.MAX_TOKENS, system: system, messages: messages,
    output_config: { effort: AI.EFFORT }, fallbacks: 'default' };
  if (tools.length) body.tools = tools;
  const request = { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body),
    headers: { 'x-api-key': key, 'anthropic-version': AI.VERSION, 'anthropic-beta': AI.FALLBACK_BETA } };
  for (let attempt = 0; ; attempt++) {
    const res = UrlFetchApp.fetch(AI.URL, request);
    const code = res.getResponseCode();
    if (code === 200) return JSON.parse(res.getContentText());
    // Retry once on overload, rate limits and server errors
    if ((code === 429 || code === 529 || code >= 500) && attempt < 1) { Utilities.sleep(2000); continue; }
    let message = res.getContentText();
    try { message = JSON.parse(message).error.message; } catch (e) { /* not JSON */ }
    throw new Error('The AI service returned ' + code + ': ' + message);
  }
}

// ---------- instructions ----------

function systemPrompt_() {
  const areas = areas_().map(a => '- ' + a.name + (a.subs.length ? ' (sub-areas: ' + a.subs.join(', ') + ')' : '')).join('\n');
  const templates = readTable_(SHEETS.TEMPLATES).rows.map(t => '- "' + t['Template'] + '"\n  Self-service when: ' + t['Self-service when'] +
    '\n  Fields: ' + t['Fields'] + '\n  Hand over to a lawyer if: ' + t['Hand over to a lawyer if']).join('\n');
  const rules = readTable_(SHEETS.ESCALATION).rows.map(r => '- ' + r['Rule'] + ' (' + r['Why'] + ')').join('\n');
  const text = [
    'You are "Ask Legal", the intake assistant of the in-house legal team at a listed industrial company.',
    'This is a demonstration system with fictitious data. Employees come to you instead of emailing the legal team.',
    '',
    'Your job, in this order:',
    '1. Understand the request. Ask short follow-up questions – at most three at a time – until you know what the matter is about,',
    '   who the counterparty is, what is at stake and any deadline. Do not ask for information you do not need, and never ask for',
    '   personal data beyond names and roles.',
    '2. Open exactly one matter per conversation with open_matter, once you can give it a title and an area. Choose the area and',
    '   sub-area from the list below. Do not open a matter for small talk or questions that are not legal requests.',
    '3a. If a template fits and the self-service conditions are met and no hand-over rule applies: collect every field the',
    '    template needs, create the draft with create_draft, explain in two or three sentences what the employee should do next,',
    '    then call complete_self_service.',
    '3b. Otherwise call hand_over_to_lawyer with a summary a lawyer can act on, and tell the employee what happens next.',
    '',
    'Boundaries:',
    '- You give legal information and templates, not legal advice on a specific question. When the employee needs a judgement,',
    '  hand the matter over.',
    '- You never commit the company: you do not send, sign or approve anything. Drafts are drafts.',
    '- When in doubt, hand over. Never guess facts – ask.',
    '- Reply in the language the employee writes in. Be warm, brief and practical. No legal jargon.',
    '- Mention once, early, that you are an AI assistant and that a lawyer reviews anything non-standard.',
    '',
    'Matter areas:', areas, '',
    'Templates:', templates || '- (none)', '',
    'Always hand over to a lawyer when:', rules || '- (no rules)', '',
    'Today is ' + fmt_(new Date(), 'yyyy-MM-dd') + '.'
  ].join('\n');
  return [{ type: 'text', text: text }];
}

// ---------- tools ----------

const TOOLS_ = [
  { name: 'open_matter', strict: true,
    description: 'Open the matter for this request in the matter register. Call once per conversation.',
    input_schema: { type: 'object', additionalProperties: false,
      required: ['title', 'area', 'sub_area', 'priority', 'deadline', 'summary', 'facts', 'open_questions'],
      properties: {
        title: { type: 'string', description: 'Short title, e.g. "Mutual NDA – Hansen Machining GmbH"' },
        area: { type: 'string', description: 'One of the matter areas, exactly as written' },
        sub_area: { type: 'string', description: 'A sub-area of that area, or "" if the area has none' },
        priority: { type: 'string', enum: ['High', 'Normal', 'Low'] },
        deadline: { type: 'string', description: 'YYYY-MM-DD, or "" if none' },
        summary: { type: 'string', description: 'Two or three sentences a lawyer can read in ten seconds' },
        facts: { type: 'array', items: { type: 'string' }, description: 'Key facts collected so far' },
        open_questions: { type: 'array', items: { type: 'string' }, description: 'What is still unclear' }
      } } },
  { name: 'create_draft', strict: true,
    description: 'Create a draft document from a template in the matter folder and fill in the fields.',
    input_schema: { type: 'object', additionalProperties: false, required: ['matter_no', 'template', 'fields'],
      properties: {
        matter_no: { type: 'string' },
        template: { type: 'string', description: 'Template name exactly as listed' },
        fields: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'value'],
          properties: { name: { type: 'string' }, value: { type: 'string' } } } }
      } } },
  { name: 'complete_self_service', strict: true,
    description: 'Close a matter that the employee has handled with a template, without a lawyer.',
    input_schema: { type: 'object', additionalProperties: false, required: ['matter_no', 'note'],
      properties: { matter_no: { type: 'string' }, note: { type: 'string', description: 'One sentence on what was done' } } } },
  { name: 'hand_over_to_lawyer', strict: true,
    description: 'Hand the matter to the legal team with a prepared summary.',
    input_schema: { type: 'object', additionalProperties: false, required: ['matter_no', 'reason', 'next_steps', 'urgency'],
      properties: {
        matter_no: { type: 'string' },
        reason: { type: 'string', description: 'Why a lawyer is needed – name the rule that applies, if any' },
        next_steps: { type: 'array', items: { type: 'string' }, description: 'Suggested next steps for the lawyer' },
        urgency: { type: 'string', enum: ['High', 'Normal', 'Low'] }
      } } }
];

/** Runs one tool call and returns its tool_result block. Errors go back to the model as is_error results. */
function runTool_(block, ctx) {
  try {
    const out = ({ open_matter: toolOpenMatter_, create_draft: toolCreateDraft_, complete_self_service: toolCompleteSelfService_,
      hand_over_to_lawyer: toolHandOver_ })[block.name];
    if (!out) throw new Error('Unknown tool: ' + block.name);
    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out(block.input, ctx)) };
  } catch (e) {
    return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: String(e.message || e) };
  }
}

function toolOpenMatter_(i, ctx) {
  const owner = String(settings_()[SETTING.DEFAULT_OWNER] || '').trim() || Session.getEffectiveUser().getEmail();
  const res = createMatter({
    title: i.title, area: i.area, subArea: i.sub_area, status: 'New', priority: i.priority, owner: owner,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(i.deadline) ? i.deadline : '', client: ctx.requester, requester: ctx.requester,
    description: i.summary
  });
  appendToNote_(res.noteUrl, 'Intake – AI assistant', [
    ['Requested by', ctx.requester || '(unknown)'], ['Summary', i.summary]
  ], [['Facts', i.facts], ['Open questions', i.open_questions]]);
  logActivity_(res.no, ACT.OPENED, 'Opened by the AI assistant: ' + i.title, res.folderUrl);
  ctx.events.push({ type: 'opened', no: res.no, title: i.title, area: i.area + (i.sub_area ? ' · ' + i.sub_area : ''), url: res.folderUrl });
  return { matter_no: res.no, status: 'New' };
}

function toolCreateDraft_(i, ctx) {
  const m = findMatter_(i.matter_no);
  const t = readTable_(SHEETS.TEMPLATES).rows.find(r => r['Template'] === i.template);
  if (!t) throw new Error('Unknown template: ' + i.template);
  if (!t['Doc ID']) throw new Error('The template has no document yet – run Setup.');
  const docs = subfolder_(DriveApp.getFolderById(m.matter['Folder ID']), SUBFOLDERS.DOCS);
  const file = DriveApp.getFileById(String(t['Doc ID']).trim()).makeCopy(i.matter_no + ' – ' + i.template + ' (draft)', docs);
  const doc = DocumentApp.openById(file.getId());
  const body = doc.getBody();
  i.fields.forEach(f => body.replaceText('\\{\\{' + String(f.name).toUpperCase().replace(/[^A-Z0-9_]/g, '') + '\\}\\}', f.value));
  const missing = (body.getText().match(/\{\{[A-Z0-9_]+\}\}/g) || []).filter((x, k, a) => a.indexOf(x) === k);
  doc.saveAndClose();
  logActivity_(i.matter_no, ACT.DOC_ADDED, 'Draft from template: ' + i.template, file.getUrl());
  ctx.events.push({ type: 'draft', no: i.matter_no, title: i.template, url: file.getUrl() });
  return { url: file.getUrl(), missing_fields: missing };
}

function toolCompleteSelfService_(i, ctx) {
  const m = findMatter_(i.matter_no);
  setStatus(i.matter_no, 'Closed');
  appendToNote_(noteUrlFor_(m.matter), 'Completed by self-service', [['Note', i.note]], [], transcript_(ctx.messages));
  logActivity_(i.matter_no, ACT.SELF_SERVICE, i.note, m.matter['Folder']);
  ctx.events.push({ type: 'closed', no: i.matter_no });
  return { status: 'Closed' };
}

function toolHandOver_(i, ctx) {
  const m = findMatter_(i.matter_no);
  m.sh.getRange(m.row, col_('Priority')).setValue(i.urgency);
  appendToNote_(noteUrlFor_(m.matter), 'Handed over to legal', [['Reason', i.reason], ['Urgency', i.urgency]],
    [['Suggested next steps', i.next_steps]], transcript_(ctx.messages));
  logActivity_(i.matter_no, ACT.HANDOVER, i.reason, m.matter['Folder']);
  ctx.events.push({ type: 'handover', no: i.matter_no, owner: m.matter['Owner'], reason: i.reason });
  return { status: 'With the legal team', owner: m.matter['Owner'] };
}

// ---------- helpers ----------

function logActivity_(no, type, title, link) {
  const m = findMatter_(no);
  sheet_(SHEETS.ACTIVITY).appendRow([new Date(), no, m.matter['Area'], type, title, 'AI assistant', link || '', '', 'AI assistant']);
}

/** The matter note is the Google Doc named "<no> Matter note" in the matter folder. */
function noteUrlFor_(matter) {
  const it = DriveApp.getFolderById(matter['Folder ID']).getFilesByName(matter['Matter no'] + ' Matter note');
  return it.hasNext() ? it.next().getUrl() : '';
}

/** Appends a section to the matter note: a heading, a two-column table, bullet lists and an optional transcript. */
function appendToNote_(url, heading, rows, lists, transcript) {
  if (!url) return;
  const doc = DocumentApp.openByUrl(url);
  const b = doc.getBody();
  b.appendParagraph(heading + ' · ' + fmt_(new Date(), 'yyyy-MM-dd HH:mm')).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (rows.length) b.appendTable(rows.map(r => [String(r[0]), String(r[1] || '')]));
  (lists || []).forEach(l => {
    if (!l[1] || !l[1].length) return;
    b.appendParagraph(l[0]).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    l[1].forEach(x => b.appendListItem(String(x)).setGlyphType(DocumentApp.GlyphType.BULLET));
  });
  if (transcript) {
    b.appendParagraph('Conversation').setHeading(DocumentApp.ParagraphHeading.HEADING3);
    transcript.forEach(t => b.appendParagraph(t[0] + ': ' + t[1]));
  }
  doc.saveAndClose();
}

/** The readable part of the conversation: what the employee wrote and what the assistant answered. */
function transcript_(messages) {
  const out = [];
  messages.forEach(m => {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    blocks.filter(b => b.type === 'text' && b.text.trim()).forEach(b => out.push([m.role === 'user' ? 'Employee' : 'Assistant', b.text.trim()]));
  });
  return out;
}

/** Creates the demo NDA template in "03 Templates" the first time and stores its ID in the Templates sheet. */
function ensureDemoTemplate_() {
  const sh = sheet_(SHEETS.TEMPLATES);
  const rows = readTable_(SHEETS.TEMPLATES).rows;
  const row = rows.find(r => r['Template'] === DEFAULT_TEMPLATES[0][0]);
  if (!row || row['Doc ID']) return;
  const doc = DocumentApp.create('Mutual NDA (demo template)');
  DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(prop_('TEMPLATES_FOLDER_ID')));
  const b = doc.getBody();
  b.appendParagraph('DEMO TEMPLATE – fictitious, for demonstration only. Not legal advice and not for actual use.')
    .setItalic(true).setForegroundColor('#c8553d');
  b.appendParagraph('Mutual Non-Disclosure Agreement').setHeading(DocumentApp.ParagraphHeading.TITLE);
  [
    'This agreement is made on {{EFFECTIVE_DATE}} between Example Industries A/S ("the Company") and {{COUNTERPARTY_NAME}}, ' +
      '{{COUNTERPARTY_ADDRESS}}, {{COUNTERPARTY_COUNTRY}} ("the Counterparty").',
    '1. Purpose. The parties wish to exchange confidential information for the following purpose: {{PURPOSE}} ("the Purpose").',
    '2. Confidential information. All information disclosed by one party to the other in connection with the Purpose, in any form, ' +
      'that is marked as confidential or should reasonably be understood to be confidential.',
    '3. Obligations. Each party shall use the other party\'s confidential information only for the Purpose, keep it confidential ' +
      'and disclose it only to employees and advisers who need to know it and are bound by similar obligations.',
    '4. Exceptions. The obligations do not apply to information that is or becomes public without breach, was already lawfully ' +
      'known to the receiving party, or must be disclosed by law or by order of an authority.',
    '5. Term. This agreement applies for {{TERM_YEARS}} years from the date above.',
    '6. Return of information. On request, each party shall return or destroy the other party\'s confidential information.',
    '7. No licence. No licence or other right to intellectual property is granted under this agreement.',
    '8. Governing law. This agreement is governed by Danish law, and disputes are settled by the courts of Copenhagen.',
    '',
    'For the Company: {{OUR_SIGNATORY}}                    For the Counterparty: ______________________'
  ].forEach(p => b.appendParagraph(p));
  doc.saveAndClose();
  sh.getRange(row._row, TEMPLATE_COLS.indexOf('Doc ID') + 1).setValue(doc.getId());
}
