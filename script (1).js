/* ============================================================
   AURIX AI — script.js
   Powered by Pollinations AI (https://text.pollinations.ai)
   ✅ 100% FREE · No API Key · No Signup · Works for everyone
   ============================================================ */

const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';
const POLLINATIONS_MODEL = 'openai'; // free, no key needed

const STATE = {
  mode: 'autonomous',
  messages: [],
  history: [],
  currentChatId: null,
  pdfText: '',
  pdfName: '',
  isThinking: false,
};

// ── DOM ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const sidebar       = $('sidebar');
const sidebarToggle = $('sidebarToggle');
const menuBtn       = $('menuBtn');
const minimalBtn    = $('minimalBtn');
const autonomousBtn = $('autonomousBtn');
const modeDesc      = $('modeDesc');
const toolsPanel    = $('toolsPanel');
const modeTag       = $('modeTag');
const newChatBtn    = $('newChatBtn');
const clearHistory  = $('clearHistory');
const historyList   = $('historyList');
const welcome       = $('welcome');
const messagesEl    = $('messages');
const chatArea      = $('chatArea');
const userInput     = $('userInput');
const sendBtn       = $('sendBtn');
const pdfInput      = $('pdfInput');
const pdfBar        = $('pdfBar');
const pdfFileName   = $('pdfFileName');
const pdfRemove     = $('pdfRemove');

// ── Init ───────────────────────────────────────────────────
function init() {
  STATE.mode = localStorage.getItem('aurix_mode') || 'autonomous';
  try { STATE.history = JSON.parse(localStorage.getItem('aurix_history') || '[]'); } catch { STATE.history = []; }
  setMode(STATE.mode, false);
  renderHistory();
  bindEvents();
}

// ── Events ─────────────────────────────────────────────────
function bindEvents() {
  sidebarToggle.addEventListener('click', toggleSidebar);
  menuBtn.addEventListener('click', toggleSidebar);
  minimalBtn.addEventListener('click', () => setMode('minimal'));
  autonomousBtn.addEventListener('click', () => setMode('autonomous'));
  sendBtn.addEventListener('click', handleSend);
  userInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
  userInput.addEventListener('input', () => { userInput.style.height = 'auto'; userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px'; });
  newChatBtn.addEventListener('click', startNewChat);
  clearHistory.addEventListener('click', () => { STATE.history = []; localStorage.removeItem('aurix_history'); renderHistory(); });
  pdfInput.addEventListener('change', handlePdf);
  pdfRemove.addEventListener('click', removePdf);
  document.querySelectorAll('.quick-btn').forEach(b => b.addEventListener('click', () => { userInput.value = b.dataset.prompt; handleSend(); }));
}

// ── Sidebar ────────────────────────────────────────────────
function toggleSidebar() { sidebar.classList.toggle('collapsed'); }

// ── Mode ───────────────────────────────────────────────────
function setMode(mode, persist = true) {
  STATE.mode = mode;
  if (persist) localStorage.setItem('aurix_mode', mode);
  if (mode === 'minimal') {
    minimalBtn.classList.add('active'); autonomousBtn.classList.remove('active');
    modeDesc.textContent = 'Fast Q&A — simple chatbot, no tools';
    modeTag.textContent = '⚡ Minimal Agent';
    toolsPanel.style.opacity = '0.4'; toolsPanel.style.pointerEvents = 'none';
  } else {
    autonomousBtn.classList.add('active'); minimalBtn.classList.remove('active');
    modeDesc.textContent = 'Multi-step reasoning with tools & planning';
    modeTag.textContent = '🤖 Autonomous Agent';
    toolsPanel.style.opacity = '1'; toolsPanel.style.pointerEvents = 'auto';
  }
}

// ── PDF ─────────────────────────────────────────────────────
async function handlePdf(e) {
  const file = e.target.files[0];
  if (!file) return;
  STATE.pdfName = file.name;
  pdfFileName.textContent = file.name;
  pdfBar.style.display = 'flex';
  try {
    STATE.pdfText = await extractPdfText(file);
    toast('PDF loaded — ' + Math.round(STATE.pdfText.length / 1000) + 'k chars read');
  } catch { STATE.pdfText = ''; toast('Could not read PDF text'); }
  pdfInput.value = '';
}

function extractPdfText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = new TextDecoder('latin1').decode(new Uint8Array(e.target.result));
        let text = '';
        for (const m of raw.matchAll(/BT\s*([\s\S]*?)\s*ET/g)) {
          for (const s of m[1].matchAll(/\(([^)]{1,300})\)/g)) {
            text += s[1].replace(/\\n/g,'\n').replace(/\\r/g,'').replace(/\\\\/g,'\\') + ' ';
          }
        }
        if (text.length < 100) {
          const fb = raw.match(/[A-Za-z0-9 .,;:!?'"()\-\n]{40,}/g);
          if (fb) text = fb.join('\n');
        }
        resolve(text.trim().slice(0, 40000));
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function removePdf() { STATE.pdfText = ''; STATE.pdfName = ''; pdfBar.style.display = 'none'; toast('PDF removed'); }

// ── Send ───────────────────────────────────────────────────
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || STATE.isThinking) return;

  welcome.classList.add('hidden');
  userInput.value = '';
  userInput.style.height = 'auto';
  addUserMessage(text);

  const typingId = showTyping();
  STATE.isThinking = true;
  sendBtn.disabled = true;

  try {
    let result;
    if (STATE.mode === 'minimal') {
      result = await runMinimal(text);
    } else {
      result = await runAutonomous(text);
    }
    removeTyping(typingId);
    addAiMessage(result.content, result.steps, result.toolUsed);
  } catch (err) {
    removeTyping(typingId);
    addAiMessage('Sorry, something went wrong: ' + (err.message || 'Network error. Please try again.'), [], null, true);
  } finally {
    STATE.isThinking = false;
    sendBtn.disabled = false;
    userInput.focus();
    saveChat();
  }
}

// ── Minimal Agent ──────────────────────────────────────────
async function runMinimal(userText) {
  const system = `You are AURIX AI, a helpful assistant. Be clear, accurate, and concise.${STATE.pdfText ? `\n\nUser uploaded PDF (${STATE.pdfName}):\n${STATE.pdfText.slice(0, 8000)}` : ''}`;
  const content = await callPollinations(system, buildHistory(userText));
  return { content, steps: [], toolUsed: null };
}

// ── Autonomous Agent ───────────────────────────────────────
async function runAutonomous(userText) {
  const steps = [];
  steps.push({ icon: '🧠', text: 'Analyzing request and selecting tools…' });

  // Plan
  const planSystem = `You are a planning AI. Analyze the user request and decide which tool to use.

Available tools:
- WIKIPEDIA: For facts, history, science, definitions, people, places
- PDF_QA: For questions about the uploaded PDF document
- STUDY_PLANNER: For JEE/EAMCET/exam study plans and schedules
- NOTES_GEN: For generating study notes, summaries, explanations of topics
- NONE: Answer directly from knowledge

Reply ONLY with valid JSON, no markdown:
{"tool":"WIKIPEDIA|PDF_QA|STUDY_PLANNER|NOTES_GEN|NONE","reasoning":"brief why","query":"specific query for the tool"}`;

  let plan = { tool: 'NONE', reasoning: 'Direct answer', query: userText };
  try {
    const planRaw = await callPollinations(planSystem, [{ role: 'user', content: userText }], 300);
    const cleaned = planRaw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.tool) plan = parsed;
  } catch { /* use default plan */ }

  steps.push({ icon: '🔧', text: `Tool: ${plan.tool} — ${plan.reasoning}` });

  let toolContext = '';
  let toolUsed = null;

  if (plan.tool === 'WIKIPEDIA') {
    steps.push({ icon: '🌐', text: `Searching Wikipedia: "${plan.query}"…` });
    toolUsed = '🌐 Wikipedia';
    try {
      toolContext = await searchWikipedia(plan.query);
      steps.push({ icon: '✅', text: 'Wikipedia data retrieved successfully' });
    } catch {
      toolContext = '';
      steps.push({ icon: '⚠️', text: 'Wikipedia unavailable — answering from knowledge' });
    }
  } else if (plan.tool === 'PDF_QA') {
    steps.push({ icon: '📄', text: 'Reading PDF content…' });
    toolUsed = '📄 PDF Q&A';
    if (STATE.pdfText) {
      toolContext = `PDF: ${STATE.pdfName}\n\n${STATE.pdfText.slice(0, 12000)}`;
      steps.push({ icon: '✅', text: 'PDF content loaded' });
    } else {
      toolContext = 'NOTE: No PDF has been uploaded. Please tell the user to upload a PDF first.';
      steps.push({ icon: '⚠️', text: 'No PDF found' });
    }
  } else if (plan.tool === 'STUDY_PLANNER') {
    steps.push({ icon: '📚', text: 'Generating study plan…' });
    toolUsed = '📚 Study Planner';
    toolContext = `Create a detailed, day-by-day study plan for: ${userText}. Include: daily schedule, topics per day, practice problems, revision days, exam tips.`;
  } else if (plan.tool === 'NOTES_GEN') {
    steps.push({ icon: '📝', text: `Generating notes on: "${plan.query}"…` });
    toolUsed = '📝 Notes Generator';
    toolContext = `Generate comprehensive, well-structured study notes on: ${plan.query}. Include: key concepts, definitions, important formulas, examples, quick-revision summary.`;
  }

  steps.push({ icon: '✍️', text: 'Writing final answer…' });

  const finalSystem = buildFinalSystem(plan.tool, toolContext);
  const content = await callPollinations(finalSystem, buildHistory(userText));

  steps.push({ icon: '✅', text: 'Done!' });
  return { content, steps, toolUsed };
}

function buildFinalSystem(tool, ctx) {
  const base = `You are AURIX AI — a smart, helpful assistant. Give clear, well-structured answers. Use markdown formatting (bold, bullet points, headers) for readability.`;
  if (!ctx || tool === 'NONE') return base;
  return `${base}\n\nContext for answering:\n---\n${ctx}\n---\nUse this context to give a thorough answer.`;
}

// ── Wikipedia ──────────────────────────────────────────────
async function searchWikipedia(query) {
  const search = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`);
  const sData = await search.json();
  if (!sData.query?.search?.length) return 'No Wikipedia article found.';

  const title = sData.query.search[0].title;
  const pageId = sData.query.search[0].pageid;

  const content = await fetch(`https://en.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=extracts&explaintext=true&format=json&origin=*`);
  const cData = await content.json();
  const extract = cData.query?.pages?.[pageId]?.extract || '';

  return `**${title}** (Wikipedia)\n\n${extract.slice(0, 5000)}`;
}

// ── Pollinations API call ──────────────────────────────────
async function callPollinations(system, messages, maxTokens = 1500) {
  const body = {
    model: POLLINATIONS_MODEL,
    messages: [
      { role: 'system', content: system },
      ...messages
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  };

  const res = await fetch(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${err.slice(0, 120)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from AI');
  return text;
}

function buildHistory(newUserText) {
  // Last 8 messages for context (to keep requests light)
  const recent = STATE.messages.slice(-8);
  const hist = recent.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
  hist.push({ role: 'user', content: newUserText });
  return hist;
}

// ── Render ─────────────────────────────────────────────────
function addUserMessage(text) {
  STATE.messages.push({ role: 'user', content: text });
  const msg = document.createElement('div');
  msg.className = 'msg user';
  msg.innerHTML = `<div class="avatar">👤</div><div class="msg-content"><div class="bubble">${esc(text)}</div></div>`;
  messagesEl.appendChild(msg);
  scrollBottom();
}

function addAiMessage(content, steps = [], toolUsed = null, isError = false) {
  STATE.messages.push({ role: 'ai', content, steps, toolUsed });

  const msg = document.createElement('div');
  msg.className = 'msg ai';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = '◈';

  const msgContent = document.createElement('div');
  msgContent.className = 'msg-content';

  // Steps
  if (steps.length) {
    const stepsEl = document.createElement('div');
    stepsEl.className = 'steps';
    steps.forEach(s => {
      const el = document.createElement('div');
      el.className = 'step';
      el.innerHTML = `<span>${s.icon}</span><span>${esc(s.text)}</span>`;
      stepsEl.appendChild(el);
    });
    msgContent.appendChild(stepsEl);
  }

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isError ? ' error' : '');
  bubble.innerHTML = isError ? esc(content) : md(content);
  msgContent.appendChild(bubble);

  // Tool used
  if (toolUsed) {
    const tu = document.createElement('div');
    tu.className = 'tool-used';
    tu.innerHTML = `<span>Tool used:</span> <strong>${toolUsed}</strong>`;
    msgContent.appendChild(tu);
  }

  msg.appendChild(avatar);
  msg.appendChild(msgContent);
  messagesEl.appendChild(msg);
  scrollBottom();
}

function showTyping() {
  const id = 'typing_' + Date.now();
  const msg = document.createElement('div');
  msg.className = 'msg ai'; msg.id = id;
  msg.innerHTML = `<div class="avatar">◈</div><div class="msg-content"><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
  messagesEl.appendChild(msg);
  scrollBottom();
  return id;
}
function removeTyping(id) { document.getElementById(id)?.remove(); }
function scrollBottom() { chatArea.scrollTop = chatArea.scrollHeight; }

// ── Markdown renderer ──────────────────────────────────────
function md(text) {
  let h = esc(text);
  // Code blocks
  h = h.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  // Inline code
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Headers
  h = h.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  h = h.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  // HR
  h = h.replace(/^---$/gm, '<hr>');
  // Bullets
  h = h.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>[\s\S]+?<\/li>)/g, m => `<ul>${m}</ul>`);
  // Numbered
  h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Paragraphs
  h = h.replace(/\n\n/g, '</p><p>');
  h = h.replace(/\n/g, '<br>');
  return `<p>${h}</p>`;
}

function esc(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── History ────────────────────────────────────────────────
function saveChat() {
  if (!STATE.messages.length) return;
  const first = STATE.messages.find(m => m.role === 'user');
  const title = first ? first.content.slice(0, 42) + (first.content.length > 42 ? '…' : '') : 'Chat';

  if (STATE.currentChatId) {
    const i = STATE.history.findIndex(h => h.id === STATE.currentChatId);
    if (i >= 0) STATE.history[i] = { id: STATE.currentChatId, title, messages: STATE.messages };
    else STATE.history.unshift({ id: STATE.currentChatId, title, messages: STATE.messages });
  } else {
    STATE.currentChatId = 'c' + Date.now();
    STATE.history.unshift({ id: STATE.currentChatId, title, messages: STATE.messages });
  }
  if (STATE.history.length > 30) STATE.history = STATE.history.slice(0, 30);
  localStorage.setItem('aurix_history', JSON.stringify(STATE.history));
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = '';
  if (!STATE.history.length) { historyList.innerHTML = '<p class="empty-hint">No chats yet</p>'; return; }
  STATE.history.forEach(chat => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.textContent = chat.title;
    el.title = chat.title;
    el.addEventListener('click', () => loadChat(chat));
    historyList.appendChild(el);
  });
}

function loadChat(chat) {
  STATE.messages = chat.messages;
  STATE.currentChatId = chat.id;
  messagesEl.innerHTML = '';
  welcome.classList.add('hidden');
  chat.messages.forEach(m => {
    if (m.role === 'user') addUserMessage_direct(m.content);
    else addAiMessage_direct(m.content, m.steps || [], m.toolUsed || null);
  });
}

function addUserMessage_direct(text) {
  const msg = document.createElement('div');
  msg.className = 'msg user';
  msg.innerHTML = `<div class="avatar">👤</div><div class="msg-content"><div class="bubble">${esc(text)}</div></div>`;
  messagesEl.appendChild(msg);
  scrollBottom();
}

function addAiMessage_direct(content, steps, toolUsed) {
  const msg = document.createElement('div');
  msg.className = 'msg ai';
  const avatar = document.createElement('div');
  avatar.className = 'avatar'; avatar.textContent = '◈';
  const mc = document.createElement('div'); mc.className = 'msg-content';
  if (steps?.length) {
    const se = document.createElement('div'); se.className = 'steps';
    steps.forEach(s => { const el = document.createElement('div'); el.className = 'step'; el.innerHTML = `<span>${s.icon}</span><span>${esc(s.text)}</span>`; se.appendChild(el); });
    mc.appendChild(se);
  }
  const bub = document.createElement('div'); bub.className = 'bubble'; bub.innerHTML = md(content); mc.appendChild(bub);
  if (toolUsed) { const tu = document.createElement('div'); tu.className = 'tool-used'; tu.innerHTML = `<span>Tool used:</span> <strong>${toolUsed}</strong>`; mc.appendChild(tu); }
  msg.appendChild(avatar); msg.appendChild(mc);
  messagesEl.appendChild(msg); scrollBottom();
}

function startNewChat() {
  STATE.messages = []; STATE.currentChatId = null;
  messagesEl.innerHTML = '';
  welcome.classList.remove('hidden');
  userInput.focus();
}

// ── Toast ──────────────────────────────────────────────────
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ── Boot ──────────────────────────────────────────────────
init();
