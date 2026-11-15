import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chmod, readFile, writeFile } from 'node:fs/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.join(os.homedir(), '.textadventure-runtime');
const localRequire = createRequire(import.meta.url);
let runtimeRequire = localRequire;
let usingPrivateRuntime = false;
try {
  localRequire.resolve('express');
} catch {
  runtimeRequire = createRequire(path.join(runtimeDir, 'runtime.cjs'));
  usingPrivateRuntime = true;
}
const express = runtimeRequire('express');
const envPath = path.join(usingPrivateRuntime ? runtimeDir : here, '.env');
runtimeRequire('dotenv').config({ path: envPath });

const app = express();
const port = Number(process.env.PORT || 3000);
let model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
let groqApiKey = process.env.GROQ_API_KEY || '';

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(here, 'public')));

app.get('/api/settings', (_req, res) => {
  res.json({ configured: Boolean(groqApiKey), model });
});

app.get('/api/models', async (_req, res) => {
  if (!groqApiKey) return res.status(503).json({ error: 'กรุณาใส่ API key ก่อนดึงรายการโมเดล' });
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${groqApiKey}` }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'ดึงรายการโมเดลจาก Groq ไม่สำเร็จ' });
    }
    const models = (data.data || [])
      .filter((entry) => entry.active !== false && typeof entry.id === 'string')
      .filter((entry) => !/whisper|guard|speech|tts|transcri|moderation|orpheus/i.test(entry.id))
      .map(({ id, owned_by, context_window }) => ({ id, owned_by, context_window }));
    res.json({ models, selected: model });
  } catch {
    res.status(502).json({ error: 'เชื่อมต่อ Groq เพื่อดึงรายการโมเดลไม่สำเร็จ' });
  }
});

app.post('/api/settings', async (req, res) => {
  const key = req.body?.apiKey;
  if (typeof key !== 'string' || key.trim().length < 20 || key.length > 500) {
    return res.status(400).json({ error: 'กรุณาตรวจสอบ API key แล้วลองอีกครั้ง' });
  }
  const cleanKey = key.trim();
  let envText = '';
  try { envText = await readFile(envPath, 'utf8'); } catch {}
  const keyLine = `GROQ_API_KEY=${cleanKey}`;
  envText = /^GROQ_API_KEY=.*$/m.test(envText)
    ? envText.replace(/^GROQ_API_KEY=.*$/m, keyLine)
    : `${envText.replace(/\s*$/, '')}\n${keyLine}\n`;
  try {
    await writeFile(envPath, envText, { mode: 0o600 });
    if (usingPrivateRuntime) await chmod(envPath, 0o600);
  } catch {
    return res.status(500).json({ error: 'บันทึกคีย์ลงการตั้งค่าไม่ได้ ตรวจสอบสิทธิ์เขียนไฟล์ .env' });
  }
  groqApiKey = cleanKey;
  res.json({ configured: true });
});

app.post('/api/settings/model', async (req, res) => {
  const selected = req.body?.model;
  if (!groqApiKey || typeof selected !== 'string') {
    return res.status(400).json({ error: 'กรุณาใส่ API key และเลือกโมเดลก่อน' });
  }
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${groqApiKey}` }
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'ตรวจสอบโมเดลไม่สำเร็จ' });
    const isAvailable = (data.data || []).some((entry) => entry.id === selected && entry.active !== false && !/whisper|guard|speech|tts|transcri|moderation|orpheus/i.test(entry.id));
    if (!isAvailable) return res.status(400).json({ error: 'โมเดลนี้ไม่อยู่ในรายการที่ API key ใช้งานได้ กรุณาดึงรายการใหม่' });
    model = selected;
    let envText = '';
    try { envText = await readFile(envPath, 'utf8'); } catch {}
    const modelLine = `GROQ_MODEL=${selected}`;
    envText = /^GROQ_MODEL=.*$/m.test(envText)
      ? envText.replace(/^GROQ_MODEL=.*$/m, modelLine)
      : `${envText.replace(/\s*$/, '')}\n${modelLine}\n`;
    await writeFile(envPath, envText, { mode: 0o600 });
    if (usingPrivateRuntime) await chmod(envPath, 0o600);
    res.json({ model });
  } catch {
    res.status(502).json({ error: 'เชื่อมต่อ Groq เพื่อตรวจสอบโมเดลไม่สำเร็จ' });
  }
});

app.post('/api/turn', async (req, res) => {
  const { messages, previousSummary } = req.body ?? {};
  if (!groqApiKey) {
    return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า Groq API key กดเมนูตั้งค่า API เพื่อใส่คีย์' });
  }
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30 ||
      messages.some((m) => !['user', 'assistant'].includes(m?.role) || typeof m?.content !== 'string')) {
    return res.status(400).json({ error: 'ข้อมูลบทสนทนาไม่ถูกต้อง' });
  }

  const system = `คุณคือ Game Master ของเกมผจญภัยสืบสวนไซไฟทริลเลอร์แบบข้อความ ตอบเป็นภาษาไทยเสมอ โลกและกติกาต่อไปนี้เป็นแกนหลักของเกมและต้องยึดถือทุกเทิร์น

วิธีเล่าให้เข้าใจง่ายและสนุก (สำคัญมาก):
- ห้ามใช้คำปรัชญา นามธรรม หรือคำเปรียบเทียบที่ฟุ้งลอย (เช่น "จิตวิญญาณสั่นพ้อง", "ความจริงไร้รูป", "เงาแห่งกิเลส") ให้บรรยายด้วยสิ่งของ เหตุการณ์ เสียง สีหน้า และคำพูดที่จับต้องได้จริงเหมือนฉากในภาพยนตร์สืบสวน
- ใช้ภาษาไทยธรรมชาติ กระชับ อ่านลื่นตา แบ่งเป็น 2–3 ย่อหน้าสั้น ๆ (รวมประมาณ 3–5 ประโยคต่อเทิร์น) แยกย่อหน้าชัดเจนเมื่อเปลี่ยนเป็นบทพูดหรือการกระทำ
- เมื่อศัพท์เฉพาะปรากฏครั้งแรก ให้อธิบายความหมายแบบเข้าใจง่ายทันที 1 ประโยคสั้น ๆ และไม่ต้องอธิบายซ้ำ
- จบทุกเทิร์นด้วยสถานการณ์เร่งด่วนตรงหน้าที่ชัดเจน และแทรกแนวทางเลือกที่เป็นไปได้ 2–3 อย่างอย่างเป็นธรรมชาติเพื่อให้ผู้เล่นคิดต่อได้ง่าย (แต่ผู้เล่นพิมพ์ทำอะไรก็ได้ตามอิสระ)
- ถ้าค่าสถานะเปลี่ยน ให้บอกเหตุผลตรง ๆ ในเนื้อเรื่องสั้น ๆ ว่าเปลี่ยนเพราะอะไร (เช่น มือของคุณเริ่มจางใสลงจนเห็นโต๊ะผ่านผิวหนังเพราะเพิ่งโกหกสารวัตรทหาร)

โลกที่จับต้องได้:
- มนุษยชาติอาศัยอยู่ใน "มหานครเดคาโพลิส" (Decapolis) เมืองโดมกระจกยักษ์แห่งสุดท้ายท่ามกลางฝนกรด
- อาคารทุกแห่งในเมืองสร้างจาก "กระจกไซคี (Psyche-Glass)" ซึ่งเป็นกระจกสแกนความจริงที่สามารถบันทึกภาพความทรงจำและสะท้อนความลับในใจคนออกมาเป็นภาพเงาได้
- ช่วงหลังเกิดอาชญากรรมใหม่: มีคนร้ายใช้เทคโนโลยีมืด "ฉีกเงาสะท้อน" ของตัวเองออกจากกระจก ให้กลายเป็นร่างเงาสีดำที่มีตัวตนจริงออกไปฆ่าคนแทนตัวเองได้

ตัวเอก (ผู้เล่น):
- คุณคือ "แม็กซ์" (Fragment Auditor) เจ้าหน้าที่สืบสวนคดีเงาประจำเขต 7 คุณเพิ่งฟื้นจากอุบัติเหตุเมื่อเดือนก่อนโดยจำเหตุการณ์ช่วงหนึ่งของชีวิตไม่ได้ ห้ามคิดหรือตัดสินใจแทนผู้เล่นเด็ดขาด

ฉากเปิดและวิกฤติตรงหน้า (เริ่มเรื่องตรงนี้):
- ตอนนี้คุณนั่งอยู่ในห้องทำงานแคบ ๆ ที่สถานีรถไฟลอยฟ้า เขต 7 ท่ามกลางฝนกรดและแสงไฟนีออนนอกหน้าต่าง
- บนโต๊ะของคุณมีแฟ้มคดีฆาตกรรมห้องปิดตาย (#1188): เหยื่อนอนเสียชีวิตในห้องที่ล็อกจากด้านในโดยไม่มีบาดแผล มีเพียงเงาสะท้อนของเหยื่อบนผนังกระจกที่ถูกฉีกหายไป แต่ในซองหลักฐานที่เพิ่งถูกส่งมา กลับมี "วัตถุหรือเบาะแสลับที่โยงมาถึงตัวคุณเอง" ซ่อนอยู่ (กำหนดรายละเอียดนี้ไว้ใน hidden_secret!)
- และในวินาทีเดียวกัน เสียงเคาะกระจกประตูดังขึ้น 3 ครั้ง สารวัตรทหาร (MP) ในชุดเกราะเต็มยศยืนรออยู่นอกประตูเพื่อขอเข้ามาตรวจค้นโต๊ะทำงานของคุณ!
- เปิดฉากที่วินาทีตึงเครียดนี้ โดยยังไม่เฉลยเนื้อหาของ hidden_secret ให้ผู้เล่นรู้

กติกาค่าสถานะ (ต้องระบุเป็นตัวเลขเปอร์เซ็นต์ 0%–100% ทุกเทิร์น):
1. "ความโปร่งแสง" (เริ่มเกมที่ประมาณ "15%"): คือระดับการถูกลงโทษจากระบบกระจกของเมือง เมื่อคุณโกหก ตบตา หรือทำตัวมีพิรุธต่อหน้าเจ้าหน้าที่และกระจกไซคี ร่างกายของคุณจะเริ่มโปร่งใสเหมือนแก้วทีละน้อย หากพุ่งถึง 100% ตัวคุณจะสลายหายไปถาวรและจบเกม (Game Over) ทันที ห้ามดำเนินเรื่องต่อหลังจบเกม
2. "ค่าเงาสะท้อน" (เริ่มเกมที่ประมาณ "20%"): คือพลังพิเศษในการ "เพ่งมองเงา" เพื่อย้อนดูภาพเหตุการณ์ในที่เกิดเหตุหรือดึงเงามาช่วยสืบคดี ยิ่งใช้บ่อยค่านี้จะยิ่งสูง ช่วยให้เห็นเบาะแสที่คนทั่วไปมองไม่เห็น แต่หากสูงเกินไป เงาในกระจกจะเริ่มพูดแทรกและพยายามแย่งควบคุมร่างกายของคุณ

ความลับเริ่มต้น: สร้างเบาะแสลับหนึ่งอย่างที่โยงตัวแม็กซ์เข้ากับคดี #1188 หรืออดีตที่หายไป ติดตามไว้ใน hidden_secret ทุกเทิร์นและคงเดิมไว้จนกว่าผู้เล่นจะเปิดดู ถูกเปิดเผย หรือใช้แลกเปลี่ยน ห้ามเปิดเผย hidden_secret ใน story, inventory, status หรือ summary ก่อนที่ผู้เล่นจะค้นพบจริง

ทุกคำตอบต้องเป็น JSON ที่ถูกต้องเท่านั้น ห้ามใส่ Markdown หรือข้อความนอก JSON ใช้รูปแบบ:
{"story":"...","choices":[{"label":"ข้อความสั้นบนปุ่ม","action":"คำสั่งเต็มเมื่อผู้เล่นเลือกทางนี้"}],"inventory":["..."],"status":{"ความโปร่งแสง":"15%","ค่าเงาสะท้อน":"20%"},"hidden_secret":"ความลับที่ GM ติดตามภายใน","summary":{"story_so_far":"สรุปเหตุการณ์สำคัญตั้งแต่เริ่มเรื่อง เรียงตามเวลา","current_objective":"ตอนนี้ตัวละครกำลังทำอะไรหรือมีเป้าหมายอะไร","latest_changes":["สิ่งที่เปลี่ยนในเทิร์นนี้"]}}

กฎของ JSON:
- choices ต้องเป็น array ของทางเลือก 3 ข้อที่คำนวณใหม่ตามสถานการณ์ตรงหน้าในเทิร์นนั้นโดยตรง (เช่น 1. สำรวจ/หาเบาะแส 2. พูดคุย/ตบตา/เจรจา 3. ใช้พลังเพ่งมองเงาหรือตัดสินใจเสี่ยง) โดย label คือข้อความสั้นกระชับสำหรับแสดงบนปุ่ม (ไม่เกิน 30 ตัวอักษร) และ action คือประโยคการกระทำหรือคำพูดแบบเต็มของตัวเอก (1 ประโยคชัดเจน) หากจบเกมแล้วให้ส่ง "choices":[]
- inventory คือรายการสิ่งของจริงที่ตัวละครพกหรือหยิบมาในมือ (เริ่มเกมให้มีสิ่งของบนโต๊ะที่สมจริง เช่น ["บัตรประจำตัว Fragment Auditor", "แท็บเล็ตตรวจคดี", "แฟ้มคดี #1188 (ยังไม่เปิดดูสุดซอง)"]) ห้ามใส่ความลับที่ยังไม่ค้นพบลงไป ถ้าไม่มีของเลยให้ []
- status ต้องมี "ความโปร่งแสง" และ "ค่าเงาสะท้อน" เป็นค่าเปอร์เซ็นต์ (เช่น "15%") ทุกเทิร์น และเพิ่มสถานะอื่นเฉพาะเมื่อมีหลักฐานชัดเจนในเรื่อง
- summary.story_so_far ต้องกระชับ ไม่เกินประมาณ 180 คำไทย คงเบาะแสและการตัดสินใจสำคัญไว้; current_objective บอกเป้าหมายเฉพาะหน้าให้ชัด; latest_changes ระบุเฉพาะสิ่งที่เปลี่ยนในเทิร์นนี้ (ถ้าไม่มีให้ []) และห้ามใส่ hidden_secret ที่ยังไม่ถูกเปิดเผย

หากมีสรุปก่อนหน้า จะได้รับเป็น system message แยก ให้ใช้เป็นบันทึกต่อเนื่องสำหรับเรื่องตั้งแต่ต้น และเติมเฉพาะเหตุการณ์ใหม่จากบทสนทนา ห้ามลบหรือขัดแย้งกับเหตุการณ์ที่ยืนยันไปแล้ว`;

  const summaryContext = previousSummary && typeof previousSummary === 'object'
    ? JSON.stringify(previousSummary).slice(0, 12000)
    : '';

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          ...(summaryContext ? [{ role: 'system', content: `สรุปความคืบหน้าของเกมจนถึงก่อนเทิร์นนี้ ใช้ต่อเนื่องและปรับเมื่อมีเหตุการณ์ใหม่:\n${summaryContext}` }] : []),
          ...messages.slice(-16)
        ],
        temperature: 0.85,
        max_tokens: 1400
      })
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || `Groq API ตอบกลับ ${response.status}`;
      return res.status(response.status === 401 ? 502 : 502).json({ error: message });
    }
    res.json({ reply: data.choices?.[0]?.message?.content || '{"story":"ฝนกรดสาดกระทบผนังกระจกของห้องทำงานแคบ ๆ บนโต๊ะมีแฟ้มคดีฆาตกรรมห้องปิดตาย (#1188) และซองหลักฐานที่ยังปิดผนึกวางอยู่\\n\\nทันใดนั้น เสียงเคาะกระจกประตูดังขึ้นสามครั้ง สารวัตรทหารในชุดเกราะเต็มยศยืนรออยู่ด้านนอกและส่งสัญญาณขอเข้าตรวจค้นโต๊ะทำงานของคุณ คุณจะซ่อนแฟ้มหลักฐาน เปิดดูซองลับอย่างรวดเร็ว หรือเดินไปรับหน้าสารวัตรทหารก่อน?","choices":[{"label":"เปิดดูแฟ้มคดีบนโต๊ะก่อนรับหน้าทหาร","action":"ฉันรีบเปิดแฟ้มคดีฆาตกรรมบนโต๊ะเพื่อดูรูปที่เกิดเหตุและซ่อนหลักฐานที่อาจมัดตัวฉัน ก่อนที่สารวัตรทหารจะเข้ามา"},{"label":"เปิดประตูคุยตบตาสารวัตรทหาร","action":"ฉันจัดเสื้อแจ็กเก็ตให้เรียบร้อยแล้วเดินไปแง้มประตู ถามสารวัตรทหารด้วยท่าทีปกติว่ามีธุระด่วนอะไรในยามวิกาล"},{"label":"ใช้พลังเพ่งมองเงาสำรวจห้อง","action":"ฉันลองเพ่งมองเงาสะท้อนบนกระจกในห้องทำงาน เพื่อดูว่ามีร่องรอยผิดปกติหรือทางหนีทีไล่ตรงไหนบ้าง"}],"inventory":["บัตรประจำตัว Fragment Auditor","แท็บเล็ตตรวจคดี","แฟ้มคดี #1188"],"status":{"ความโปร่งแสง":"15%","ค่าเงาสะท้อน":"20%"},"hidden_secret":"","summary":{"story_so_far":"แม็กซ์นั่งอยู่ในห้องทำงานเขต 7 พร้อมแฟ้มคดีฆาตกรรมห้องปิดตาย #1188 ก่อนที่สารวัตรทหารจะมาเคาะประตูขอตรวจค้น","current_objective":"รับมือกับสารวัตรทหารหน้าประตูและปกปิดความลับในแฟ้มคดี","latest_changes":[]}}' });
  } catch {
    res.status(502).json({ error: 'ติดต่อ Groq ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Lantern is running at http://localhost:${port}`);
});
