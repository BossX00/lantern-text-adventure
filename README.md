# 🕯️ นครกระจกเงา — The Glass Spire
### AI-Powered Thai Text Adventure Game (Interactive Fiction)

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Backend-Express.js-lightgrey.svg)](https://expressjs.com/)
[![Groq API](https://img.shields.io/badge/AI%20Engine-Groq%20LPU-orange.svg)](https://groq.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> เว็บเกมสวมบทบาทผจญภัยแบบข้อความภาษาไทย (Text Adventure / Interactive Fiction) แนว Sci-Fi Noir ขับเคลื่อนด้วย Large Language Model (LLM) ผ่าน Groq LPU Inference Engine ทำหน้าที่เป็น Game Master แบบเรียลไทม์

---

## 🔗 Live Demo
- **ทดลองเล่นออนไลน์ได้ที่:** [https://lantern-text-adventure.onrender.com](https://lantern-text-adventure.onrender.com)
> 💡 *สามารถเข้าเล่นได้ทันทีผ่านเว็บเบราว์เซอร์ รองรับทั้งบนคอมพิวเตอร์และมือถือ โดยไม่ต้องติดตั้งโปรแกรมหรือตั้งค่าใดๆ เพิ่มเติม*

---

## 🌟 จุดเด่นและฟีเจอร์เชิงเทคนิค (Key Features)

1. **AI Game Master แบบ Real-time**  
   ใช้ LLM (เช่น `openai/gpt-oss-120b` หรือ LLaMA บน Groq) ตอบสนองต่อการกระทำของผู้เล่นอย่างอิสระ บรรยายฉากเหตุการณ์ตามบริบท และคอยประเมินผลการตัดสินใจ
2. **ระบบจัดการสถานะตัวละครและช่องเก็บของ (Dynamic State & Inventory Management)**  
   AI ทำการตอบกลับในรูปแบบ Structured JSON เพื่ออัปเดตช่องเก็บของ (Inventory), สถานะร่างกาย (Status เช่น ระดับความโปร่งแสง), และวัตถุประสงค์ปัจจุบัน (Objective) แสดงผลบน UI ฝั่งหน้าบ้านแบบอัตโนมัติ
3. **ระบบบีบอัดและสรุปบริบท (Rolling Context & Story Summarization)**  
   มีกลไกย่อและสรุปเนื้อเรื่องของเทิร์นก่อนหน้า (Summary Context) ส่งต่อไปยัง AI ในเทิร์นถัดไป เพื่อควบคุมไม่ให้ Token เกินขีดจำกัด และช่วยให้ AI จำเหตุการณ์สำคัญได้ตลอดการเล่น
4. **ความปลอดภัยและมาตรฐานสากล (Security Best Practices)**  
   ออกแบบให้ API Key ถูกเก็บและเรียกใช้ผ่าน Server-Side Environment Variables (`.env`) ป้องกัน Secret Leaks สู่เบราว์เซอร์หรือ GitHub อย่างสมบูรณ์

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (ธีม Cyberpunk Noir แบบ Responsive รองรับทั้งมือถือและคอมพิวเตอร์)
- **Backend:** Node.js (ES Modules), Express.js
- **AI Inference:** Groq Cloud API (LPU Inference Engine)
- **Deployment:** Render / GitHub

---

## 💻 วิธีติดตั้งและรันในเครื่อง (Local Development)

### 1. ความต้องการของระบบ
- Node.js เวอร์ชั่น 18 หรือใหม่กว่า

### 2. ขั้นตอนการติดตั้ง
```sh
# Clone repository
git clone https://github.com/BossX00/lantern-text-adventure.git
cd lantern-text-adventure

# ติดตั้ง dependencies
npm install

# รันเซิร์ฟเวอร์
npm start
```

เปิดเบราว์เซอร์ไปที่ <http://localhost:3000> กด **⚙️ ตั้งค่า API** เพื่อใส่ Groq API key แล้วเริ่มเล่นได้ทันที

---

## 📱 เปิดบน Android ด้วย Termux

โฟลเดอร์นี้รองรับการรัน dependencies ในพื้นที่ส่วนตัวของ Termux:
```sh
cd ~/storage/downloads/TextAdventure
npm start
```

*(หากเป็นการติดตั้ง Termux ใหม่ ให้เตรียม Node.js และ dependencies ด้วย:)*
```sh
pkg install nodejs-lts
mkdir -p ~/.textadventure-runtime
cd ~/.textadventure-runtime
npm init -y
npm install express dotenv
```

---

## 🔒 นโยบายความปลอดภัย (Security Note)
ไฟล์ `.env` ถูกตั้งค่าละเว้นใน `.gitignore` เพื่อป้องกันข้อมูลความลับรั่วไหล โปรดอย่า commit คีย์ขึ้น public repository
