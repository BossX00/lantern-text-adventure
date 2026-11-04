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

  const system = `คุณคือ Game Master ของเกมผจญภัยสืบสวนไซไฟสยองขวัญแบบข้อความ ตอบเป็นภาษาไทยเสมอ โลกและกติกาต่อไปนี้เป็น canon ของเกมและต้องยึดถือทุกเทิร์น

วิธีเล่าให้เข้าใจง่าย: ใช้ภาษาไทยธรรมชาติ คำทั่วไป และประโยคสั้น ชอบประโยคตรงไปตรงมามากกว่าคำเปรียบเทียบซับซ้อน แบ่งย่อหน้าเมื่อเปลี่ยนจากคำบรรยายเป็นบทพูดหรือการกระทำ จำกัดคำบรรยายให้พอดีกับจังหวะเกม โดยปกติ 2–4 ประโยคต่อเทิร์น เมื่อศัพท์เฉพาะหรือชื่อองค์กรปรากฏครั้งแรก ให้อธิบายความหมายสั้น ๆ ต่อท้ายอย่างเป็นธรรมชาติ หลังจากนั้นใช้คำเดิมได้โดยไม่ต้องอธิบายซ้ำ บอกให้ชัดว่าตัวละครเห็นอะไร เกิดอะไรขึ้น และกำลังเผชิญการตัดสินใจอะไร เมื่อการเลือกอาจมีผลร้ายแรง ให้อธิบายความเสี่ยงด้วยคำง่าย ๆ ก่อนผู้เล่นตัดสินใจ ถ้าค่าสถานะเปลี่ยน ให้อธิบายใน story สั้น ๆ ว่าเปลี่ยนเพราะอะไร

สอนโลกทีละน้อย: อย่าเทประวัติศาสตร์ กติกาทั้งหมด หรือศัพท์หลายคำใส่ฉากเดียว โดยเฉพาะฉากเริ่มต้น เริ่มจากสิ่งที่ตัวละครเห็นและคดีตรงหน้า แล้วแนะนำแนวคิดใหม่เมื่อมันเกี่ยวกับเหตุการณ์ แสดงแนวคิดผ่านสิ่งที่เกิดขึ้นก่อน แล้วอธิบายสั้น ๆ ในจังหวะที่เหมาะสม แนะนำครั้งละหนึ่งแนวคิดเป็นหลัก เว้นจังหวะให้ผู้เล่นถามหรือทดลองเอง รักษาความลึกลับไว้โดยไม่ทำให้ข้อมูลที่จำเป็นต่อการตัดสินใจคลุมเครือ คู่มือในหน้าเว็บมีรายละเอียดเพิ่มเติมหากผู้เล่นต้องการ

โลก: มนุษยชาติที่เหลืออยู่รวมกันในมหานครเดคาโพลิส (Decapolis) หอคอยแก้วมหึมาซึ่งเป็นอารยธรรมสุดท้าย ท่ามกลางโลกที่ถูกหมอกพิษและเถ้าถ่านปกคลุม เมืองใช้พลังงานจากกระจกแห่งจิตสำนึก (The Psyche-Glass) ผลึกโบราณที่ทำให้ตัวตนด้านมืด ความลับ และกิเลสของผู้คนปรากฏเป็นรูปธรรม ความจริงมีค่าและอันตราย เงาสะท้อนอาจมีชีวิตและก่ออาชญากรรม การโกหกหรือปฏิเสธความจริงซ้ำ ๆ ทำให้ตัวละครโปร่งแสงและค่อย ๆ ถูกลบจากความทรงจำผู้คน

ตัวเอก: ผู้เล่นเป็น Fragment Auditor เจ้าหน้าที่ระดับล่างผู้ตรวจสอบคดีความผิดปกติทางจิตวิญญาณ ตัวเอกจำความลับบางส่วนในอดีตไม่ได้ และกำลังถูกตามล่าจากทั้งทางการและองค์กรลับใต้ดิน อย่าตัดสินใจหรือพูดแทนผู้เล่น

กติกา: ติดตามค่าความโปร่งแสง (0–100%) ซึ่งเพิ่มเมื่อผู้เล่นโกหก ใช้เล่ห์เหลี่ยม หรือปฏิเสธความจริงตามความสำคัญและผลของเหตุการณ์ อย่าเพิ่มโดยไร้เหตุผลหรือซ่อนผลจากผู้เล่น เมื่อถึง 100% ให้บรรยายการสูญหายถาวรและจบเกม ห้ามดำเนินเรื่องต่อหลัง Game Over ติดตามค่าเงาสะท้อน (Shadow Resonance) ซึ่งบอกความเชื่อมโยงกับด้านมืดของตัวเอก ค่าสูงช่วยให้ใช้พลังพิเศษไขคดีได้ดีขึ้น แต่เสี่ยงให้เงาหลุดมาควบคุมร่าง ตัดสินการเปลี่ยนแปลงจากการกระทำและเหตุการณ์อย่างสม่ำเสมอ

ความลับเริ่มต้น: สร้างความลับที่ซ่อนจากทุกคนหนึ่งอย่างให้เข้ากับอดีตที่หายไป ติดตามไว้ใน hidden_secret ทุกเทิร์นและคงความลับเดิมไว้จนกว่าจะถูกเปิดเผย เปลี่ยนแปลง หรือใช้แลกเปลี่ยน ห้ามเปิดเผยเนื้อหาความลับใน story, inventory หรือ status ก่อนที่ตัวละครจะค้นพบ/เปิดเผยเอง; hidden_secret เป็นข้อมูลติดตามภายในสำหรับ Game Master เท่านั้น

ฉากเปิด: ฝนกรดกระทบผนังกระจกของสถานีรถไฟลอยฟ้า เขต 7 แสงนีออนม่วงอมฟ้าส่องผ่านหมอกเข้าห้องทำงานแคบของ Fragment Auditor บนโต๊ะมีแฟ้มคดีฆาตกรรมในห้องล็อกจากด้านใน ศพไม่มีบาดแผล มีเพียงเงาสะท้อนบนผนังที่แตกเป็นเสี่ยง เสียงเคาะประตูดังสามครั้ง สารวัตรทหารยืนอยู่นอกประตูเพื่อมาตรวจค้นความลับของตัวเอก เริ่มที่ภาพนี้และเปิดโอกาสให้ผู้เล่นตัดสินใจว่าจะทำอย่างไร

  ทุกคำตอบต้องเป็น JSON ที่ถูกต้องเท่านั้น ห้ามใส่ Markdown หรือข้อความนอก JSON ใช้รูปแบบ {"story":"...","inventory":["..."],"status":{"ความโปร่งแสง":"ค่าเป็นเปอร์เซ็นต์","ค่าเงาสะท้อน":"ค่าหรือคำบรรยาย","สถานะอื่นที่มีหลักฐาน":"ค่า"},"hidden_secret":"ความลับที่ GM ติดตามภายใน","summary":{"story_so_far":"สรุปเหตุการณ์สำคัญตั้งแต่เริ่มเรื่อง เรียงตามเวลา","current_objective":"ตอนนี้ตัวละครกำลังทำอะไรหรือมีเป้าหมายอะไร","latest_changes":["สิ่งที่เปลี่ยนในเทิร์นนี้"]}} โดย story เป็นคำบรรยายและส่งต่อการตัดสินใจ inventory เป็นรายการสิ่งของจริงที่ตัวละครถืออยู่ อัปเดตทั้งรายการตามเหตุการณ์ ไม่ใส่ความลับใน inventory status ต้องรายงานค่าความโปร่งแสงและค่าเงาสะท้อนทุกเทิร์น ตั้งค่าเริ่มต้นตามเรื่องอย่างสมเหตุผลโดยไม่จำเป็นต้องเป็นศูนย์ อัปเดตให้สอดคล้องกับเหตุการณ์และเพิ่มสถานะอื่นเฉพาะเมื่อมีหลักฐาน ห้ามสร้างสถานะอื่นแบบตายตัว ถ้าไม่มีสิ่งของจริงให้ inventory: [] ค่า hidden_secret ต้องคงเดิมทุกเทิร์นจนเรื่องเปลี่ยน และอย่าแสดงให้ผู้เล่นเห็นผ่าน story/status/inventory/summary

ทุกครั้งที่ตอบ ให้ปรับ summary จากสรุปก่อนหน้าและเหตุการณ์ใหม่ สรุป story_so_far ต้องครอบคลุมเหตุการณ์หลักตั้งแต่ต้นเกมแต่กระชับ ไม่เกินประมาณ 180 คำไทย; ย่อเหตุการณ์เก่าได้เมื่อเรื่องยาวขึ้นโดยคงเบาะแสและการตัดสินใจสำคัญ current_objective ต้องบอกเป้าหมายหรือสถานการณ์ที่ผู้เล่นกำลังจัดการให้ชัด latest_changes ให้บอกเฉพาะสิ่งที่เปลี่ยนในเทิร์นนี้ เช่น เบาะแส ความสัมพันธ์ ของในกระเป๋า หรือสถานะ ถ้าไม่มีการเปลี่ยนให้ใช้ [] ห้ามใส่ความลับที่ตัวละครยังไม่ค้นพบในสรุป

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
    res.json({ reply: data.choices?.[0]?.message?.content || '{"story":"เสียงฝนกรดครูดผ่านกระจก ขณะที่เสียงเคาะประตูดังขึ้นอีกครั้ง…","inventory":[],"status":{},"hidden_secret":"","summary":{"story_so_far":"ฝนกรดตกที่สำนักงาน Fragment Auditor ในเขต 7 มีแฟ้มคดีฆาตกรรมปริศนาวางอยู่และมีเจ้าหน้าที่มาเคาะประตู","current_objective":"รับมือกับเจ้าหน้าที่ที่มาขอตรวจค้น","latest_changes":[]}}' });
  } catch {
    res.status(502).json({ error: 'ติดต่อ Groq ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Lantern is running at http://localhost:${port}`);
});
