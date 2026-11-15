const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const intro = $('#intro');
const game = $('#game');
const story = $('#story');
const composer = $('#composer');
const action = $('#action');
const send = $('#send');
const thinking = $('#thinking');
const charCount = $('#char-count');
const quickChips = $('#quick-chips');
const apiBadge = $('#api-badge');
const liveObjective = $('#live-objective');

const settingsModal = $('#settings-modal');
const guideModal = $('#guide-modal');
const summaryModal = $('#summary-modal');
const lightboxModal = $('#lightbox-modal');

const messages = [];
let gameSummary = null;
let summaryTurn = 0;
let gameOver = false;

function openModal(modal) {
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modal) {
  if (modal) modal.classList.add('hidden');
}

function bindModal(modal, openTrigger, closeTrigger) {
  if (openTrigger) {
    openTrigger.addEventListener('click', () => openModal(modal));
  }
  if (closeTrigger) {
    closeTrigger.addEventListener('click', () => closeModal(modal));
  }
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal(modal);
    });
  }
}

bindModal(guideModal, $('#open-guide'), $('#close-guide'));
bindModal(guideModal, $('#intro-guide-btn'), null);
bindModal(lightboxModal, $('#open-lightbox'), $('#close-lightbox'));

const introVisual = $('#intro-visual');
if (introVisual) {
  introVisual.addEventListener('click', () => openModal(lightboxModal));
  introVisual.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openModal(lightboxModal);
    }
  });
}

const openLightbox = $('#open-lightbox');
if (openLightbox) {
  openLightbox.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openModal(lightboxModal);
    }
  });
}

$('#open-summary').addEventListener('click', () => {
  openModal(summaryModal);
  $('#open-summary').classList.remove('has-new-summary');
});
bindModal(summaryModal, null, $('#close-summary'));

$('#open-settings').addEventListener('click', () => {
  openModal(settingsModal);
  $('#api-key').focus();
  refreshSettingsStatus();
});
bindModal(settingsModal, null, $('#close-settings'));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeModal(settingsModal);
    closeModal(guideModal);
    closeModal(summaryModal);
    closeModal(lightboxModal);
  }
});

function updateApiBadge(configured, modelName) {
  if (!apiBadge) return;
  apiBadge.classList.remove('is-ready', 'is-unconfigured');
  if (configured) {
    apiBadge.classList.add('is-ready');
    apiBadge.textContent = modelName ? `API พร้อมใช้งาน` : 'พร้อมใช้งาน';
    apiBadge.title = modelName ? `โมเดลปัจจุบัน: ${modelName}` : 'เชื่อมต่อ Groq API แล้ว';
  } else {
    apiBadge.classList.add('is-unconfigured');
    apiBadge.textContent = 'ยังไม่ได้ตั้งค่า API';
    apiBadge.title = 'กดตั้งค่า API เพื่อใส่ Groq API key';
  }
}

function renderSummary(summary) {
  if (!summary || typeof summary !== 'object') return;
  gameSummary = summary;
  summaryTurn += 1;
  const objectiveText = typeof summary.current_objective === 'string' && summary.current_objective.trim()
    ? summary.current_objective
    : 'AI ยังไม่ได้ระบุเป้าหมายปัจจุบัน';
  $('#summary-story').textContent = typeof summary.story_so_far === 'string' ? summary.story_so_far : 'AI ยังไม่ได้สรุปเหตุการณ์';
  $('#summary-objective').textContent = objectiveText;
  if (liveObjective) {
    liveObjective.textContent = objectiveText;
  }

  const changes = $('#summary-changes');
  changes.replaceChildren();
  const items = Array.isArray(summary.latest_changes) ? summary.latest_changes : [];
  if (!items.length) {
    const item = document.createElement('li');
    item.textContent = 'ไม่มีการเปลี่ยนแปลงสำคัญในเทิร์นนี้';
    changes.append(item);
  } else {
    for (const value of items) {
      const item = document.createElement('li');
      item.textContent = String(value);
      changes.append(item);
    }
  }
  $('#summary-updated').textContent = `อัปเดตหลัง Game Master ตอบ · เทิร์น ${summaryTurn}`;
  if (summaryModal.classList.contains('hidden')) $('#open-summary').classList.add('has-new-summary');
}

async function refreshSettingsStatus() {
  const status = $('#settings-status');
  try {
    const response = await fetch('/api/settings');
    const data = await response.json();
    status.textContent = data.configured ? `พร้อมใช้งาน · โมเดล ${data.model}` : 'ยังไม่ได้ตั้งค่า API key';
    updateApiBadge(Boolean(data.configured), data.model);
    if (data.configured) loadModels();
  } catch {
    status.textContent = 'ตรวจสอบสถานะ API ไม่สำเร็จ';
    updateApiBadge(false);
  }
}

async function loadModels() {
  const select = $('#model-select');
  const status = $('#model-status');
  const saveButton = $('#save-model');
  select.disabled = true;
  saveButton.disabled = true;
  status.classList.remove('error');
  status.textContent = 'กำลังดึงโมเดลที่ API key ใช้งานได้…';
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'ดึงรายการโมเดลไม่สำเร็จ');
    select.replaceChildren();
    for (const model of data.models) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.id}${model.owned_by ? ` · ${model.owned_by}` : ''}`;
      select.append(option);
    }
    if (!data.models.length) throw new Error('ไม่พบโมเดลสำหรับสนทนาใน API key นี้');
    const currentAvailable = data.models.some((item) => item.id === data.selected);
    if (currentAvailable) select.value = data.selected;
    select.disabled = false;
    saveButton.disabled = false;
    status.textContent = currentAvailable
      ? `${data.models.length} โมเดลที่ API key นี้เรียกใช้ได้`
      : `โมเดลเดิม ${data.selected} ใช้ไม่ได้กับคีย์นี้ · เลือกโมเดลแล้วกดใช้โมเดลนี้`;
  } catch (error) {
    select.replaceChildren(new Option('ดึงรายการโมเดลไม่สำเร็จ', ''));
    status.textContent = error.message;
    status.classList.add('error');
  }
}

$('#toggle-key').addEventListener('click', (event) => {
  const input = $('#api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
  event.currentTarget.textContent = input.type === 'password' ? 'แสดง' : 'ซ่อน';
});

$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#save-key');
  const status = $('#settings-status');
  button.disabled = true;
  status.classList.remove('error');
  status.textContent = 'กำลังบันทึก…';
  try {
    const response = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: $('#api-key').value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'บันทึกคีย์ไม่สำเร็จ');
    $('#api-key').value = '';
    status.textContent = 'บันทึกแล้ว พร้อมเริ่มเล่น';
    updateApiBadge(true);
    loadModels();
    setTimeout(() => closeModal(settingsModal), 700);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error');
  } finally {
    button.disabled = false;
  }
});

$('#refresh-models').addEventListener('click', loadModels);
$('#save-model').addEventListener('click', async () => {
  const button = $('#save-model');
  const status = $('#model-status');
  button.disabled = true;
  status.classList.remove('error');
  status.textContent = 'กำลังบันทึกโมเดล…';
  try {
    const response = await fetch('/api/settings/model', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: $('#model-select').value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'บันทึกโมเดลไม่สำเร็จ');
    status.textContent = `กำลังใช้ ${data.model}`;
    $('#settings-status').textContent = `พร้อมใช้งาน · โมเดล ${data.model}`;
    updateApiBadge(true, data.model);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error');
  } finally {
    button.disabled = false;
  }
});

function addEntry(kind, text) {
  const entry = document.createElement('article');
  entry.className = `entry ${kind}`;
  const label = document.createElement('div');
  label.className = 'entry-label';
  const currentTurn = Math.max(1, Math.ceil(messages.length / 2));
  label.textContent = kind === 'gm'
    ? `GAME MASTER // บันทึกเหตุการณ์ · เทิร์น ${currentTurn}`
    : `FRAGMENT AUDITOR // การกระทำของคุณ`;

  const body = document.createElement('div');
  body.className = 'entry-body';
  const paragraphs = String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!paragraphs.length) {
    const p = document.createElement('p');
    p.textContent = String(text || '');
    body.append(p);
  } else {
    for (const paragraph of paragraphs) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      body.append(p);
    }
  }

  entry.append(label, body);
  story.append(entry);
  entry.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return entry;
}

function renderList(container, values, emptyText) {
  container.replaceChildren();
  if (!values.length) {
    const empty = document.createElement('p');
    empty.className = 'state-empty';
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'state-list';
  for (const value of values) {
    const item = document.createElement('li');
    item.textContent = String(value);
    list.append(item);
  }
  container.append(list);
}

function getMeterVariant(label, percent) {
  if (/transparency|ความโปร่งแสง/i.test(label)) {
    return percent >= 70 ? 'danger' : 'cyan';
  }
  if (/shadow|เงาสะท้อน/i.test(label)) {
    return 'violet';
  }
  return 'amber';
}

function applyGameMasterReply(rawReply) {
  let data;
  try {
    const clean = rawReply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    data = JSON.parse(clean);
  } catch {
    addEntry('gm', rawReply);
    return;
  }

  addEntry('gm', typeof data.story === 'string' ? data.story : 'Game Master ยังไม่ได้บรรยายเหตุการณ์');
  if (Array.isArray(data.inventory) && data.inventory.every((item) => typeof item === 'string')) {
    renderList($('#inventory-state'), data.inventory, 'Game Master ระบุว่าตอนนี้ไม่มีสิ่งของ');
  }
  if (data.status && typeof data.status === 'object' && !Array.isArray(data.status)) {
    const entries = Object.entries(data.status);
    const container = $('#character-state');
    container.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'state-empty';
      empty.textContent = 'ยังไม่มีสถานะที่ Game Master ระบุ';
      container.append(empty);
    } else {
      const list = document.createElement('dl');
      list.className = 'status-list';
      for (const [label, value] of entries) {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        const item = document.createElement('div');
        item.className = 'status-item';

        const row = document.createElement('div');
        row.className = 'status-row';
        const term = document.createElement('dt');
        term.textContent = label;
        const detail = document.createElement('dd');
        detail.textContent = valueStr;
        row.append(term, detail);
        item.append(row);

        const percentMatch = valueStr.match(/(\d+(?:\.\d+)?)\s*%/);
        if (percentMatch) {
          const percent = Math.min(100, Math.max(0, Number(percentMatch[1])));
          const track = document.createElement('div');
          track.className = 'meter-track';
          const fill = document.createElement('div');
          fill.className = `meter-fill ${getMeterVariant(label, percent)}`;
          fill.style.width = `${percent}%`;
          track.append(fill);
          item.append(track);
        }

        list.append(item);
      }
      container.append(list);
    }
    const transparency = entries.find(([label]) => /transparency|ความโปร่งแสง/i.test(label));
    if (transparency) {
      const value = String(transparency[1]);
      const percent = Number(value.match(/\d+(?:\.\d+)?/)?.[0]);
      if (percent >= 100 && !gameOver) {
        gameOver = true;
        const ending = document.createElement('p');
        ending.className = 'game-over-banner';
        ending.textContent = 'ตัวตนของคุณถูกลบเลือน · GAME OVER';
        story.append(ending);
      }
    }
  }
  renderSummary(data.summary);
  renderQuickChips(data.choices);
}

function bindChipClick(chip) {
  chip.addEventListener('click', () => {
    if (action.disabled || gameOver) return;
    action.value = chip.dataset.prompt || chip.textContent || '';
    action.style.height = 'auto';
    action.style.height = `${Math.min(action.scrollHeight, 130)}px`;
    if (charCount) charCount.textContent = `${action.value.length} / 500`;
    action.focus();
  });
}

function renderQuickChips(choices) {
  if (!quickChips) return;
  if (gameOver) {
    quickChips.replaceChildren();
    quickChips.classList.add('hidden');
    return;
  }
  if (!Array.isArray(choices) || !choices.length) return;

  const buttons = [];
  for (const choice of choices.slice(0, 4)) {
    let label = '';
    let prompt = '';
    if (typeof choice === 'string') {
      label = choice.trim();
      prompt = label;
    } else if (choice && typeof choice === 'object') {
      label = String(choice.label || choice.text || choice.action || choice.prompt || '').trim();
      prompt = String(choice.action || choice.prompt || choice.text || label).trim();
    }
    if (!label || !prompt) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'quick-chip';
    chip.dataset.prompt = prompt;
    chip.textContent = label;
    bindChipClick(chip);
    buttons.push(chip);
  }

  if (!buttons.length) return;
  quickChips.replaceChildren(...buttons);
  quickChips.classList.remove('hidden');
}

async function takeTurn(text, { displayPlayer = true, includeInHistory = true } = {}) {
  if (includeInHistory) {
    messages.push({ role: 'user', content: text });
  }
  if (displayPlayer) {
    addEntry('player', text);
  }
  send.disabled = true;
  action.disabled = true;
  thinking.classList.remove('hidden');
  $('#turn-count').textContent = `เทิร์น ${Math.ceil(messages.length / 2)}`;
  try {
    const response = await fetch('/api/turn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.slice(-16), previousSummary: gameSummary })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
    messages.push({ role: 'assistant', content: data.reply });
    applyGameMasterReply(data.reply);
  } catch (error) {
    const errorEntry = addEntry('gm', `เกิดปัญหา: ${error.message} ลองส่งการกระทำอีกครั้งได้เลย`);
    errorEntry.classList.add('error');
    if (includeInHistory) messages.pop();
  } finally {
    thinking.classList.add('hidden');
    send.disabled = gameOver;
    action.disabled = gameOver;
    if (!gameOver) action.focus();
  }
}

$('#begin').addEventListener('click', () => {
  intro.classList.add('hidden');
  game.classList.remove('hidden');
  composer.classList.remove('hidden');
  takeTurn('เริ่มเกมตามฉากเปิดของโลกนี้ บรรยายสถานการณ์ตรงหน้าและรอให้ฉันตัดสินใจ อย่าเปิดเผยความลับเริ่มต้น', { displayPlayer: false, includeInHistory: true });
});

for (const chip of $$('.quick-chip')) {
  bindChipClick(chip);
}

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = action.value.trim();
  if (!text || send.disabled || gameOver) return;
  action.value = '';
  action.style.height = 'auto';
  if (charCount) charCount.textContent = '0 / 500';
  takeTurn(text);
});

action.addEventListener('input', () => {
  action.style.height = 'auto';
  action.style.height = `${Math.min(action.scrollHeight, 130)}px`;
  if (charCount) charCount.textContent = `${action.value.length} / 500`;
});

action.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

$('#new-game').addEventListener('click', () => location.reload());

refreshSettingsStatus();
