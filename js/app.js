/**
 * VoteWise — Election Education Assistant  v2
 * =============================================
 * FEATURE 1: Smart Voting Journey Tracker
 * FEATURE 2: Confidence + Verification Layer
 * FEATURE 3: Decision-Based Follow-up Suggestions
 * FEATURE 4: Quick Summary (3 bullets)
 * FEATURE 5: Explain Like I'm 10 (ELI10)
 */

// ─── CONFIGURATION ──────────────────────────────────────────
const CONFIG = {
  MODEL: "claude-sonnet-4-20250514",
  MAX_TOKENS: 1000,
  MAX_HISTORY: 12,
};

// ─── STATE ──────────────────────────────────────────────────
const state = {
  conversationHistory: [],
  userContext: {
    country: null,
    userType: null,
    language: "en",
    simpleMode: false,
  },
  isTyping: false,
  journey: {
    active: false,
    currentStep: 0,
    completedSteps: new Set(),
  },
};

// ═══════════════════════════════════════════════════════════
// FEATURE 1: SMART VOTING JOURNEY TRACKER
// ═══════════════════════════════════════════════════════════

function buildJourneySteps() {
  const c = state.userContext.country;
  return [
    { id: "eligibility",   icon: "✅", label: "Check Eligibility",       prompt: `Am I eligible to vote${c ? " in " + c : ""}? What are the requirements?` },
    { id: "register",      icon: "📋", label: "Register to Vote",         prompt: `How do I register to vote${c ? " in " + c : ""}? Step-by-step please.` },
    { id: "voter-id",      icon: "🪪", label: "Get Voter ID / Documents", prompt: `What documents or voter ID do I need${c ? " in " + c : ""}?` },
    { id: "polling-booth", icon: "📍", label: "Find Polling Booth",       prompt: "How do I find my nearest polling booth or polling station?" },
    { id: "vote",          icon: "🗳", label: "Cast Your Vote",           prompt: `What happens on voting day${c ? " in " + c : ""}? Walk me through it.` },
  ];
}

function isJourneyTrigger(text) {
  return /\b(i want to vote|how do i (start|begin) voting|first.time voter|first time.*voting|where do i start|how do i vote|guide me through|voting journey|help me vote|step by step.*vote|i need to vote|ready to vote)\b/i.test(text);
}

function detectJourneyStepFromQuery(text) {
  const t = text.toLowerCase();
  if (/eligib|qualify|can i vote|age|citizen/.test(t))       return 0;
  if (/register|registration|sign up|enrol/.test(t))         return 1;
  if (/document|voter id|id card|passport|proof|bring/.test(t)) return 2;
  if (/polling|booth|station|where.*vote|nearest|map/.test(t)) return 3;
  if (/voting day|cast|ballot|how to vote/.test(t))          return 4;
  return -1;
}

function renderJourneyWidget() {
  const steps = buildJourneySteps();
  const { completedSteps, currentStep } = state.journey;
  const allDone = completedSteps.size >= steps.length;
  const progress = Math.round((completedSteps.size / steps.length) * 100);

  const stepsHTML = steps.map((step, i) => {
    const isDone    = completedSteps.has(i);
    const isCurrent = !isDone && i === currentStep && !allDone;
    const cls = isDone ? 'done' : isCurrent ? 'current' : 'future';
    return `<div class="journey-step ${cls}" data-step="${i}" role="button" tabindex="0" aria-label="${step.label}${isDone?' (completed)':isCurrent?' (current)':''}">
      <span class="jstep-check">${isDone ? '✔' : isCurrent ? '▶' : '○'}</span>
      <span class="jstep-label">${step.icon} ${step.label}</span>
      ${isCurrent ? '<span class="jstep-badge">Next</span>' : ''}
    </div>`;
  }).join('');

  const widgetHTML = `
    <div class="journey-widget" id="journeyWidget" role="region" aria-label="Voting Journey Progress">
      <div class="journey-head">
        <span class="journey-title">🧭 Your Voting Journey</span>
        <span class="journey-pct">${completedSteps.size}/${steps.length}</span>
      </div>
      <div class="journey-bar" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
        <div class="journey-fill" style="width:${progress}%"></div>
      </div>
      <div class="journey-steps">${stepsHTML}</div>
      ${allDone
        ? '<div class="journey-complete">🎉 You\'re fully prepared to vote!</div>'
        : `<button class="journey-cta" data-step="${currentStep}">
             Start: ${steps[currentStep].icon} ${steps[currentStep].label} →
           </button>`
      }
    </div>`;

  const existing = document.getElementById('journeyWidget');
  if (existing) {
    const wrapper = existing.closest('.journey-wrapper');
    if (wrapper) { wrapper.innerHTML = widgetHTML; }
  } else {
    const wrapper = document.createElement('div');
    wrapper.className = 'journey-wrapper';
    wrapper.innerHTML = widgetHTML;
    messagesEl.appendChild(wrapper);
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
  }

  document.querySelectorAll('.journey-step[data-step]').forEach(el => {
    el.addEventListener('click', () => handleJourneyStep(+el.dataset.step));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') handleJourneyStep(+el.dataset.step); });
  });
  document.querySelectorAll('.journey-cta[data-step]').forEach(el => {
    el.addEventListener('click', () => handleJourneyStep(+el.dataset.step));
  });
}

function handleJourneyStep(idx) {
  const steps = buildJourneySteps();
  if (idx >= steps.length) return;
  state.journey.currentStep = idx;
  sendMessage(steps[idx].prompt);
}

function advanceJourney(stepIdx) {
  if (!state.journey.active || stepIdx < 0) return;
  state.journey.completedSteps.add(stepIdx);
  const steps = buildJourneySteps();
  for (let i = 0; i < steps.length; i++) {
    if (!state.journey.completedSteps.has(i)) { state.journey.currentStep = i; break; }
  }
  renderJourneyWidget();
}

// ═══════════════════════════════════════════════════════════
// FEATURE 2: CONFIDENCE + VERIFICATION LAYER
// ═══════════════════════════════════════════════════════════

function scoreConfidence(query, response) {
  const q = (query + ' ' + response).toLowerCase();
  const low  = ['criminal','felony','overseas','nri','absentee','mail','proxy','disputed','lawsuit','court','prison','asylum','refugee'];
  const high = ['register','eligib','documents','voting day','how to vote','polling booth','ballot','age','citizen'];
  if (low.some(k => q.includes(k)))  return 'low';
  if (high.some(k => q.includes(k)) && state.userContext.country) return 'high';
  return 'medium';
}

function buildConfidenceFooter(query, response) {
  const level = scoreConfidence(query, response);
  const cfg = {
    high:   { label: 'High',   color: '#3BAA75', bg: 'rgba(59,170,117,0.08)',  desc: 'General, well-established process' },
    medium: { label: 'Medium', color: '#C9963A', bg: 'rgba(201,150,58,0.08)',  desc: 'May vary by country or region' },
    low:    { label: 'Low',    color: '#E05252', bg: 'rgba(224,82,82,0.08)',   desc: 'Highly jurisdiction-dependent' },
  }[level];
  return `<div class="confidence-footer" role="note">
    <div class="conf-badge" style="color:${cfg.color};background:${cfg.bg};">
      <span class="conf-dot" style="background:${cfg.color}"></span>
      <strong>Confidence: ${cfg.label}</strong>
      <span class="conf-desc">— ${cfg.desc}</span>
    </div>
    <div class="conf-verify">⚠️ Always verify with your official <strong>Election Commission</strong> website.</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// FEATURE 3: DECISION-BASED FOLLOW-UP SUGGESTIONS
// ═══════════════════════════════════════════════════════════

function buildFollowUps(query) {
  const q = (query || '').toLowerCase();
  const allSuggestions = [
    { match: /register|enrol/,              label: '📋 How do I register?',      prompt: 'How do I register to vote? Give me step-by-step instructions.' },
    { match: /document|id|bring/,           label: '🪪 What do I bring?',        prompt: 'What documents do I need to vote?' },
    { match: /eligib|qualify|age|citizen/,  label: '✅ Am I eligible?',          prompt: 'Am I eligible to vote? What are the requirements?' },
    { match: /booth|station|polling|map/,   label: '📍 Find polling booth',      prompt: 'Find my nearest polling booth.', isMap: true },
    { match: /mail|absentee|postal/,        label: '📬 How does mail-in work?',  prompt: 'Explain mail-in / absentee voting step by step.' },
    { match: /timeline|deadline|date|when/, label: '📅 Key election dates',      prompt: 'What are the key election dates and deadlines?' },
    { match: /count|result|declare/,        label: '🔢 How are votes counted?',  prompt: 'How are votes counted and results declared?' },
    { match: /ballot|how.*vote|voting day/, label: '🗳 Voting day guide',        prompt: 'Walk me through what happens on voting day.' },
  ];

  // Pick suggestions that DON'T match the current query to avoid repetition
  const picks = allSuggestions.filter(s => !s.match.test(q)).slice(0, 3);

  // Always offer journey if not active
  if (!state.journey.active) {
    picks.unshift({ label: '🧭 Start my voting journey', prompt: 'I want to vote. Guide me step by step.', isJourney: true });
  }

  return picks.slice(0, 3);
}

function renderFollowUps(query, bubble) {
  const followUps = buildFollowUps(query);
  if (!followUps.length) return;
  const row = document.createElement('div');
  row.className = 'followup-row';
  followUps.forEach(fu => {
    const btn = document.createElement('button');
    btn.className = 'followup-btn';
    btn.textContent = fu.label;
    btn.setAttribute('aria-label', fu.label);
    btn.addEventListener('click', () => {
      if (fu.isMap) { openMapModal(); return; }
      sendMessage(fu.prompt);
    });
    row.appendChild(btn);
  });
  bubble.appendChild(row);
}

// ═══════════════════════════════════════════════════════════
// FEATURE 4 + 5: ACTION PILLS (QUICK SUMMARY + ELI10)
// ═══════════════════════════════════════════════════════════

async function fetchMini(userPrompt, maxTokens = 300) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONFIG.MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const d = await r.json();
  return d.content?.[0]?.text || "";
}

function addActionPills(originalText, bubble) {
  if (originalText.length < 80) return;

  const pillRow = document.createElement('div');
  pillRow.className = 'action-pills-row';

  // ── Quick Summary Button (Feature 4) ────────────────────
  if (originalText.length >= 350) {
    const sumBtn = document.createElement('button');
    sumBtn.className = 'action-pill summary-btn';
    sumBtn.innerHTML = '⚡ Quick Summary';
    sumBtn.addEventListener('click', async () => {
      if (sumBtn.disabled) return;
      sumBtn.disabled = true; sumBtn.innerHTML = '⚡ Working…';
      try {
        const text = await fetchMini(
          `Summarise this election info into EXACTLY 3 short bullet points (✦ symbol, max 14 words each). Just the bullets, no intro:\n\n${originalText}`
        );
        const card = document.createElement('div');
        card.className = 'summary-card';
        card.innerHTML = `<strong class="card-label">⚡ Quick Summary</strong>
          <div class="summary-body">${text.replace(/✦/g, '<span class="sum-bullet">✦</span>')}</div>`;
        pillRow.replaceWith(card);
      } catch { sumBtn.innerHTML = '⚡ Quick Summary'; sumBtn.disabled = false; }
    });
    pillRow.appendChild(sumBtn);
  }

  // ── ELI10 Button (Feature 5) ─────────────────────────────
  const eli10Btn = document.createElement('button');
  eli10Btn.className = 'action-pill eli10-btn';
  eli10Btn.innerHTML = '🧒 Explain Simply';
  eli10Btn.addEventListener('click', async () => {
    if (eli10Btn.disabled) return;
    eli10Btn.disabled = true; eli10Btn.innerHTML = '🧒 Simplifying…';
    try {
      const text = await fetchMini(
        `Explain this to a 10-year-old first-time voter. Very simple words, friendly tone, max 80 words:\n\n${originalText}`
      );
      const card = document.createElement('div');
      card.className = 'eli10-card';
      card.innerHTML = `<strong class="card-label">🧒 Simple Explanation</strong><p class="eli10-body">${text}</p>`;
      pillRow.replaceWith(card);
    } catch { eli10Btn.innerHTML = '🧒 Explain Simply'; eli10Btn.disabled = false; }
  });
  pillRow.appendChild(eli10Btn);

  bubble.appendChild(pillRow);
}

// ═══════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const chatWindow   = $("chatWindow");
const messagesEl   = $("messages");
const welcomeState = $("welcomeState");
const userInput    = $("userInput");
const sendBtn      = $("sendBtn");
const sidebar      = $("sidebar");
const menuBtn      = $("menuBtn");
const sidebarClose = $("sidebarClose");
const overlayBack  = $("overlayBackdrop");
const simpleMode   = $("simpleMode");
const darkMode     = $("darkMode");
const clearChat    = $("clearChat");
const langSelect   = $("languageSelect");
const countryModal = $("countryModal");
const mapModal     = $("mapModal");
const countrySearch= $("countrySearch");
const countryList  = $("countryList");
const modalClose   = $("modalClose");
const mapClose     = $("mapClose");

// ─── COUNTRIES DATABASE ──────────────────────────────────────
const COUNTRIES = [
  { code: "IN", name: "🇮🇳 India" },         { code: "US", name: "🇺🇸 United States" },
  { code: "GB", name: "🇬🇧 United Kingdom" }, { code: "AU", name: "🇦🇺 Australia" },
  { code: "CA", name: "🇨🇦 Canada" },         { code: "DE", name: "🇩🇪 Germany" },
  { code: "FR", name: "🇫🇷 France" },         { code: "BR", name: "🇧🇷 Brazil" },
  { code: "ZA", name: "🇿🇦 South Africa" },   { code: "NG", name: "🇳🇬 Nigeria" },
  { code: "KE", name: "🇰🇪 Kenya" },          { code: "PH", name: "🇵🇭 Philippines" },
  { code: "ID", name: "🇮🇩 Indonesia" },      { code: "MX", name: "🇲🇽 Mexico" },
  { code: "JP", name: "🇯🇵 Japan" },          { code: "SG", name: "🇸🇬 Singapore" },
  { code: "NZ", name: "🇳🇿 New Zealand" },    { code: "PK", name: "🇵🇰 Pakistan" },
  { code: "BD", name: "🇧🇩 Bangladesh" },     { code: "GH", name: "🇬🇭 Ghana" },
  { code: "EG", name: "🇪🇬 Egypt" },          { code: "TR", name: "🇹🇷 Turkey" },
  { code: "AR", name: "🇦🇷 Argentina" },      { code: "CO", name: "🇨🇴 Colombia" },
  { code: "LS", name: "Other / General" },
];

// ─── SYSTEM PROMPT ───────────────────────────────────────────
function buildSystemPrompt() {
  const ctx = state.userContext;
  const countryCtx = ctx.country
    ? `User is from ${ctx.country}. Prioritize their country's election process, agencies, and terminology.`
    : "No country specified. Provide general information applicable to most democracies.";
  const userTypeCtx = ctx.userType ? `User type: ${ctx.userType}. Adapt accordingly.` : "";
  const langMode = ctx.simpleMode
    ? "SIMPLE LANGUAGE MODE: 6th-grade level. Short sentences. Define jargon. Use analogies."
    : "Clear, friendly, accessible language.";

  return `You are VoteWise — a friendly, non-partisan AI assistant helping citizens understand elections, voter registration, voting methods, eligibility, and civic participation.

CONTEXT: ${countryCtx} ${userTypeCtx}
LANGUAGE: ${langMode}

RESPONSE FORMAT:
- Use **bold** for key terms and actions
- Use numbered steps for processes (1. 2. 3.)
- Use bullet points for lists and checklists
- Keep paragraphs to 2-3 sentences
- Use emoji sparingly: 📋 forms, 📍 locations, ✅ steps, ⚠️ warnings
- End with a bold "Next step:" action summary
- For location queries: mention the "📍 Find Polling Booth" button

GUARDRAILS:
- Never recommend parties, candidates, or affiliations
- Never predict outcomes
- Use "typically" / "in most countries" when generalizing
- Add "Verify with your official Election Commission" for legal specifics

TONE: Warm, empowering civic educator. Every vote matters.`;
}

// ─── CLAUDE API CALL ─────────────────────────────────────────
async function callClaudeAPI(userMessage) {
  const messages = [
    ...state.conversationHistory.slice(-CONFIG.MAX_HISTORY),
    { role: "user", content: userMessage },
  ];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: CONFIG.MODEL, max_tokens: CONFIG.MAX_TOKENS, system: buildSystemPrompt(), messages }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }
  const data = await response.json();
  const msg = data.content?.[0]?.text || "I couldn't generate a response. Please try again.";
  state.conversationHistory.push({ role: "user", content: userMessage }, { role: "assistant", content: msg });
  return msg;
}

// ─── MESSAGE RENDERING ───────────────────────────────────────
function formatMessage(text) {
  let html = text
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^### (.+)$/gm, '<strong style="display:block;margin-top:10px;font-size:14px;">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.+)$/gm, (_, content, offset, str) => {
      const num = str.substring(0, offset).match(/^\d+\./gm)?.length + 1 || 1;
      return `<div class="step-block"><span class="step-num">${num}</span><span>${content}</span></div>`;
    })
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  return `<p>${html}</p>`;
}

function isLocationQuery(text) {
  return ['polling booth','polling station','where to vote','find my','nearest','location','map','near me'].some(k => text.toLowerCase().includes(k));
}

/**
 * Core appendMessage — enhanced with all v2 features.
 * @param {string}  role     'ai' | 'user'
 * @param {string}  content  Text or HTML string
 * @param {boolean} isHTML   If true, content is raw HTML
 * @param {string}  query    Original user message (used for confidence + follow-ups)
 */
function appendMessage(role, content, isHTML = false, query = '') {
  if (welcomeState.style.display !== 'none') welcomeState.style.display = 'none';

  const msg = document.createElement('div');
  msg.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'ai' ? '🗳' : '👤';
  avatar.setAttribute('aria-hidden', 'true');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = isHTML ? content : formatMessage(content);

  // Map button
  if (role === 'ai' && isLocationQuery(content)) {
    const mapBtn = document.createElement('button');
    mapBtn.className = 'map-btn';
    mapBtn.innerHTML = '📍 Open Polling Booth Map';
    mapBtn.onclick = openMapModal;
    bubble.appendChild(mapBtn);
  }

  if (role === 'ai' && !isHTML && content.length > 60) {
    // Feature 2: Confidence footer
    bubble.insertAdjacentHTML('beforeend', buildConfidenceFooter(query, content));

    // Feature 4 + 5: Action pills
    addActionPills(content, bubble);

    // Feature 3: Follow-up suggestions
    renderFollowUps(query, bubble);
  }

  // Source chips
  if (role === 'ai') {
    const sourceRow = document.createElement('div');
    sourceRow.className = 'source-row';
    sourceRow.innerHTML = `
      <span class="source-chip">📚 VoteWise AI</span>
      <span class="source-chip">⚖️ Non-partisan</span>
      ${state.userContext.country ? `<span class="source-chip">🌍 ${state.userContext.country}</span>` : ''}
    `;
    bubble.appendChild(sourceRow);
  }

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
  return bubble;
}

// ─── TYPING INDICATOR ────────────────────────────────────────
function showTyping() {
  const msg = document.createElement('div');
  msg.className = 'message ai'; msg.id = 'typingMsg';
  const avatar = document.createElement('div');
  avatar.className = 'avatar'; avatar.textContent = '🗳';
  const ind = document.createElement('div');
  ind.className = 'typing-indicator';
  ind.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  if (welcomeState.style.display !== 'none') welcomeState.style.display = 'none';
  msg.appendChild(avatar); msg.appendChild(ind); messagesEl.appendChild(msg);
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
}

function hideTyping() {
  const el = $("typingMsg"); if (el) el.remove();
}

// ─── SEND MESSAGE ────────────────────────────────────────────
async function sendMessage(text) {
  const trimmed = (text || userInput.value).trim();
  if (!trimmed || state.isTyping) return;

  userInput.value = ''; autoResizeTextarea();
  state.isTyping = true; sendBtn.disabled = true;
  appendMessage('user', trimmed);
  showTyping();

  // Feature 1: Detect journey trigger
  if (!state.journey.active && isJourneyTrigger(trimmed)) {
    state.journey.active = true;
    state.journey.currentStep = 0;
    state.journey.completedSteps = new Set();
  }

  try {
    const response = await callClaudeAPI(trimmed);
    hideTyping();
    const stepIdx = detectJourneyStepFromQuery(trimmed);
    if (state.journey.active) advanceJourney(stepIdx);
    appendMessage('ai', response, false, trimmed);
    if (state.journey.active) renderJourneyWidget();
  } catch (err) {
    hideTyping();
    if (state.journey.active) {
      advanceJourney(detectJourneyStepFromQuery(trimmed));
      renderJourneyWidget();
    }
    appendMessage('ai', `
      <span class="tag-pill">⚠️ Connection Issue</span>
      <p>I couldn't connect to the AI service. No API key configured — showing a demo answer.</p>
      <p><strong>Demo:</strong> ${getDemoAnswer(trimmed)}</p>
    `, true, trimmed);
    console.error('API Error:', err);
  } finally {
    state.isTyping = false; sendBtn.disabled = false; userInput.focus();
  }
}

function getDemoAnswer(q) {
  q = q.toLowerCase();
  if (/register|registration/.test(q))  return 'To register to vote: 1) Visit your Election Commission website, 2) Fill the form with photo ID + address proof, 3) Submit online or in-person. Deadline is typically 15–30 days before election day.';
  if (/document|id|bring/.test(q))      return 'Typically: Government photo ID (passport, national ID, or driving licence), proof of address, and your voter registration card if applicable.';
  if (/mail|absentee/.test(q))          return 'Mail-in voting: 1) Request ballot 30–45 days before election, 2) Receive it by post, 3) Mark privately, 4) Sign envelope, 5) Return by deadline via mail or drop box.';
  if (/eligib|qualify/.test(q))         return 'Eligibility: You need to be a citizen, 18+ years old, registered, and not legally disqualified. Check your Election Commission for exact rules.';
  return 'In the full application with an API key, I would provide detailed, country-specific guidance. Try asking about registration, eligibility, voting day, or required documents.';
}

// ─── TEXTAREA AUTO-RESIZE ────────────────────────────────────
function autoResizeTextarea() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
}

// ─── SIDEBAR CONTROLS ────────────────────────────────────────
function openSidebar()  { sidebar.classList.add('open'); overlayBack.classList.add('open'); }
function closeSidebar() {
  sidebar.classList.remove('open');
  if (!countryModal.classList.contains('open') && !mapModal.classList.contains('open'))
    overlayBack.classList.remove('open');
}

// ─── COUNTRY MODAL ───────────────────────────────────────────
function renderCountryList(filter = '') {
  const filtered = COUNTRIES.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  countryList.innerHTML = filtered.map(c =>
    `<div class="country-item" data-code="${c.code}" data-name="${c.name}" role="button" tabindex="0">${c.name}</div>`
  ).join('');
  countryList.querySelectorAll('.country-item').forEach(item => {
    item.addEventListener('click', () => selectCountry(item.dataset.code, item.dataset.name));
    item.addEventListener('keydown', e => { if (e.key === 'Enter') selectCountry(item.dataset.code, item.dataset.name); });
  });
}

function selectCountry(code, name) {
  state.userContext.country = name.replace(/^[^\s]+ /, '');
  const chip = document.querySelector('.chip[data-type="country"]');
  if (chip) { chip.textContent = name; chip.classList.add('active'); }
  closeCountryModal();
  if (state.conversationHistory.length === 0)
    appendMessage('ai', `Great! I'll personalize information for **${name}**. What would you like to know about voting and elections?`);
}

function openCountryModal() {
  renderCountryList();
  countryModal.classList.add('open'); overlayBack.classList.add('open');
  setTimeout(() => countrySearch.focus(), 100);
}

function closeCountryModal() {
  countryModal.classList.remove('open');
  if (!sidebar.classList.contains('open')) overlayBack.classList.remove('open');
}

// ─── MAP MODAL ───────────────────────────────────────────────
function openMapModal() {
  mapModal.classList.add('open'); overlayBack.classList.add('open');
  if (window.initMap) window.initMap();
}
function closeMapModal() {
  mapModal.classList.remove('open');
  if (!sidebar.classList.contains('open')) overlayBack.classList.remove('open');
}

// ─── LANGUAGE / TRANSLATION ──────────────────────────────────
function initGoogleTranslate() {
  if (window.googleTranslateLoaded) return;
  window.googleTranslateLoaded = true;
  const script = document.createElement('script');
  script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  document.head.appendChild(script);
  window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'gtranslate-container');
  };
}

langSelect.addEventListener('change', () => {
  const lang = langSelect.value;
  state.userContext.language = lang;
  if (lang !== 'en') {
    if (!$('translateNotice')) {
      const n = document.createElement('div');
      n.id = 'translateNotice';
      n.style.cssText = 'text-align:center;font-size:12px;color:var(--muted);padding:8px;margin:4px 0;';
      n.textContent = `🌐 ${langSelect.options[langSelect.selectedIndex].text} — Responses will be in your selected language.`;
      messagesEl.appendChild(n);
    }
    initGoogleTranslate();
  }
});

// ─── DARK MODE ───────────────────────────────────────────────
darkMode.addEventListener('change', () => {
  document.body.classList.toggle('dark', darkMode.checked);
  localStorage.setItem('votewise-dark', darkMode.checked ? '1' : '0');
});

// ─── SIMPLE LANGUAGE MODE ────────────────────────────────────
simpleMode.addEventListener('change', () => {
  state.userContext.simpleMode = simpleMode.checked;
  document.body.classList.toggle('simple-mode', simpleMode.checked);
  if (simpleMode.checked && state.conversationHistory.length === 0)
    appendMessage('ai', '✅ **Simple Mode ON.** I\'ll use easy words and short sentences. Ask me anything about voting!');
});

// ─── CHIP SELECTION ──────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const type = chip.dataset.type;
    if (type === 'country') { openCountryModal(); return; }
    document.querySelectorAll(`.chip[data-type="${type}"]`).forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.userContext.userType = chip.dataset.value;
    if (chip.dataset.value && state.conversationHistory.length === 0) {
      const greetings = {
        'first-time': "Welcome, first-time voter! I'll walk you through everything — from registration to casting your vote. Where would you like to start?",
        'student':    "Hey! Great that you're getting involved in democracy. I'll explain everything clearly. What do you want to know?",
        'senior':     "Welcome! I'm here to help with clear, step-by-step guidance on all voting processes. How can I assist you today?",
        'nri':        "Hello! As an overseas voter, you may have absentee or postal voting options. Let me know your country and I'll guide you.",
      };
      appendMessage('ai', greetings[chip.dataset.value]);
    }
  });
});

// ─── CLEAR CHAT ──────────────────────────────────────────────
clearChat.addEventListener('click', () => {
  state.conversationHistory = [];
  state.journey = { active: false, currentStep: 0, completedSteps: new Set() };
  messagesEl.innerHTML = '';
  welcomeState.style.display = '';
  userInput.focus();
});

// ─── TOPIC BUTTONS (sidebar) ─────────────────────────────────
document.querySelectorAll('.topic-btn').forEach(btn => {
  btn.addEventListener('click', () => { closeSidebar(); sendMessage(btn.dataset.prompt); });
});

// ─── SUGGESTION CARDS (welcome) ──────────────────────────────
document.querySelectorAll('.suggest-card').forEach(card => {
  card.addEventListener('click', () => sendMessage(card.dataset.prompt));
});

// ─── INPUT EVENTS ────────────────────────────────────────────
userInput.addEventListener('input', autoResizeTextarea);
userInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
sendBtn.addEventListener('click', () => sendMessage());

// ─── SIDEBAR / MODAL EVENTS ──────────────────────────────────
menuBtn.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
overlayBack.addEventListener('click', () => { closeSidebar(); closeCountryModal(); closeMapModal(); });
modalClose.addEventListener('click', closeCountryModal);
mapClose.addEventListener('click', closeMapModal);
countrySearch.addEventListener('input', () => renderCountryList(countrySearch.value));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSidebar(); closeCountryModal(); closeMapModal(); } });

// ─── INIT ────────────────────────────────────────────────────
(function init() {
  if (localStorage.getItem('votewise-dark') === '1') { document.body.classList.add('dark'); darkMode.checked = true; }
  userInput.focus();
  renderCountryList();
  const lang = navigator.language?.split('-')[1];
  if (lang) {
    const match = COUNTRIES.find(c => c.code === lang);
    if (match) state.userContext.country = match.name.replace(/^[^\s]+ /, '');
  }
})();
