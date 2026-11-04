const $ = (selector) => document.querySelector(selector);
const intro = $('#intro');
const game = $('#game');
const story = $('#story');
const composer = $('#composer');
const action = $('#action');
const send = $('#send');
const thinking = $('#thinking');
const messages = [];
const settingsModal = $('#settings-modal');
const guideModal = $('#guide-modal');
const summaryModal = $('#summary-modal');
let gameSummary = null;
let summaryTurn = 0;
let gameOver = false;

$('#open-guide').addEventListener('click', () => guideModal.classList.remove('hidden'));
$('#close-guide').addEventListener('click', () => guideModal.classList.add('hidden'));
guideModal.addEventListener('click', (event) => {
  if (event.target === guideModal) guideModal.classList.add('hidden');
});
$('#open-summary').addEventListener('click', () => {
  summaryModal.classList.remove('hidden');
  $('#open-summary').classList.remove('has-new-summary');
});
$('#close-summary').addEventListener('click', () => summaryModal.classList.add('hidden'));
summaryModal.addEventListener('click', (event) => {
  if (event.target === summaryModal) summaryModal.classList.add('hidden');
});

function renderSummary(summary) {
  if (!summary || typeof summary !== 'object') return;
  gameSummary = summary;
  summaryTurn += 1;
  $('#summary-story').textContent = typeof summary.story_so_far === 'string' ? summary.story_so_far : 'AI ยังไม่ได้สรุปเหตุการณ์';
  $('#summary-objective').textContent = typeof summary.current_objective === 'string' ? summary.current_objective : 'AI ยังไม่ได้ระบุเป้าหมายปัจจุบัน';
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
    if (data.configured) loadModels();
  } catch {
    status.textContent = 'ตรวจสอบสถานะ API ไม่สำเร็จ';
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

$('#open-settings').addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
  $('#api-key').focus();
  refreshSettingsStatus();
});
$('#close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) settingsModal.classList.add('hidden');
});
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
    loadModels();
    setTimeout(() => settingsModal.classList.add('hidden'), 700);
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
  label.textContent = kind === 'gm' ? 'GAME MASTER' : 'คุณ';
  const body = document.createElement('div');
  body.textContent = text;
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
        const row = document.createElement('div');
        row.className = 'status-row';
        const term = document.createElement('dt');
        term.textContent = label;
        const detail = document.createElement('dd');
        detail.textContent = typeof value === 'string' ? value : JSON.stringify(value);
        row.append(term, detail);
        list.append(row);
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

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = action.value.trim();
  if (!text || send.disabled || gameOver) return;
  action.value = '';
  action.style.height = 'auto';
  takeTurn(text);
});

action.addEventListener('input', () => {
  action.style.height = 'auto';
  action.style.height = `${Math.min(action.scrollHeight, 120)}px`;
});
action.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

$('#new-game').addEventListener('click', () => location.reload());
