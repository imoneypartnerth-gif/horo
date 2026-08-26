# ตั้งค่า AI อ่านดวง (Supabase Edge Function `horo-ai`)

เว็บ `imoneypartnerth-gif.github.io/horo` เป็น **public** ทุกคนเปิดดู source ได้
คีย์ AI จึงห้ามอยู่ในหน้าเว็บ — เก็บเป็น **secret ฝั่ง Supabase** แล้วให้หน้าเว็บเรียกผ่าน Edge Function แทน

```
เบราว์เซอร์ (โหร login แล้ว)
   │  แนบ JWT ของ session อัตโนมัติ
   ▼
Supabase Edge Function  horo-ai        ← คีย์ AI อยู่ตรงนี้เท่านั้น
   │  เลือก provider จาก env
   ▼
Gemini / Claude / OpenAI / OpenAI-compatible
```

---

## 1. ติดตั้งครั้งแรก

```bash
# ในโฟลเดอร์โปรเจกต์ (ที่มี supabase/functions/horo-ai/index.ts)
supabase login
supabase link --project-ref hmiaxbtdlbfsljqcbmcl
supabase functions deploy horo-ai
```

## 2. ตั้งคีย์ (เลือกเจ้าใดเจ้าหนึ่ง — สลับทีหลังได้)

```bash
# Gemini (มี free tier)
supabase secrets set AI_PROVIDER=gemini AI_API_KEY=xxxxx AI_MODEL=gemini-2.5-flash

# Claude
supabase secrets set AI_PROVIDER=anthropic AI_API_KEY=sk-ant-xxxxx AI_MODEL=claude-sonnet-4-20250514

# OpenAI
supabase secrets set AI_PROVIDER=openai AI_API_KEY=sk-xxxxx AI_MODEL=gpt-4o-mini

# เจ้าอื่นที่ใช้ API แบบเดียวกับ OpenAI (OpenRouter, Together, Groq, typhoon ฯลฯ)
supabase secrets set AI_PROVIDER=compatible AI_API_KEY=xxxxx \
  AI_MODEL=ชื่อโมเดล AI_BASE_URL=https://openrouter.ai/api/v1
```

**สลับเจ้าใหม่** = `supabase secrets set ...` ใหม่อย่างเดียว ไม่ต้อง deploy ใหม่ ไม่ต้องแก้หน้าเว็บ

ตัวเลือกเสริม:

| env | ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini` · `anthropic` · `openai` · `compatible` |
| `AI_MODEL` | ตามเจ้า | ชื่อโมเดล — **ควรตั้งเองเสมอ** เพราะชื่อโมเดลเปลี่ยนบ่อย |
| `AI_BASE_URL` | `https://api.openai.com/v1` | ใช้เมื่อ provider = `compatible` |
| `ALLOWED_ORIGIN` | `*` | ล็อกให้เรียกได้จากโดเมนเดียว เช่น `https://imoneypartnerth-gif.github.io` |

## 3. ตรวจว่าใช้ได้

เข้าเว็บ → login → เปิดดวงลูกดวง → เลื่อนลงใต้วงล้อ → กด **"อ่านดวงด้วย AI"**
- ขึ้น `ยังไม่ได้ติดตั้งฟังก์ชัน horo-ai` = ยังไม่ deploy
- ขึ้น `ยังไม่ได้ตั้งค่า AI_API_KEY` = deploy แล้วแต่ยังไม่ได้ set secret
- ขึ้น `ต้องเข้าสู่ระบบก่อน` = JWT ไม่ถูกส่ง (login ใหม่)

---

## ค่าใช้จ่าย

| ส่วน | ราคา |
|---|---|
| **Supabase Edge Function** | Free plan **500,000 ครั้ง/เดือน** · Pro 2 ล้านครั้ง แล้วเกินคิด $2 ต่อล้านครั้ง → งานนี้ใช้ไม่ถึงเศษเสี้ยว = **ฟรี** |
| **API ของ AI** | ตรงนี้คือค่าใช้จ่ายจริง — Gemini มี free tier (จำกัด req/นาที-วัน) ถ้าใช้แบบเสียเงิน Gemini 2.5 Flash = $0.30/ล้าน token ขาเข้า, $2.50/ล้าน ขาออก |

ประมาณการต่อการอ่าน 1 ครั้ง: prompt ~9,000 ตัวอักษร (ราว 6–9 พัน token) + คำตอบ ~1–2 พัน token
→ **ราว 0.2 บาท/ครั้ง** บน Gemini 2.5 Flash · อ่าน 1,000 ครั้ง/เดือน ≈ 200 บาท
(ราคาเปลี่ยนได้ ตรวจที่ ai.google.dev/gemini-api/docs/pricing ก่อนเปิดใช้จริง)

## ความปลอดภัย

- ฟังก์ชันเปิดให้เฉพาะ **ผู้ที่ login แล้ว** (Supabase ตรวจ JWT ให้ + โค้ดตรวจซ้ำกับ `/auth/v1/user`)
- คีย์ไม่เคยออกจากเซิร์ฟเวอร์ — หน้าเว็บไม่มีทางเห็น
- ค่าใช้จ่ายตกที่เจ้าของคีย์ (Phak) ทุกครั้งที่โหรคนใดกดปุ่ม → ถ้าเปิดให้โหรหลายคน ควรจำกัดสิทธิ์ผ่าน RLS/allowlist หรือใส่ rate limit เพิ่มภายหลัง

## แก้ "วิธีอ่าน" ของ AI

ตำราย่อและลำดับการอ่าน (๖ ชั้น + กฎ "เลขดาว ≠ ภพที่สถิต") อยู่ในตัวแปร `SYSTEM_PROMPT`
ใน `supabase/functions/horo-ai/index.ts` — แก้แล้ว `supabase functions deploy horo-ai` ใหม่
**ไม่ต้องแก้ HTML เลย** นี่คือเหตุผลที่แยก prompt ไว้ฝั่งเซิร์ฟเวอร์

## ถ้ายังไม่อยากต่อ API

ในวงล้อมีปุ่ม **"📋 คัดลอก prompt ให้ AI"** (และในหน้าแอปก็มี) — คัดลอกข้อมูลดวงครบทุกชั้น
พร้อมคำสั่งพยากรณ์ ไปวางใน Claude / Gemini / ChatGPT เองได้ทันที ฟรี ไม่ต้อง deploy อะไร

## ข้อมูลที่ส่งให้ AI

`window.__horoData()` ในวงล้อ คืน JSON ~15KB ประกอบด้วย
ลัคนา · ดาวทุกดวง (ภพประจำเลข, ราศี/องศา, สถิตภพ, ตำแหน่งเกษตร/อุจ/นิจ, เจ้าเรือน,
ผลเจ้าเรือนไปสถิตภพ, ตรียางค์, ฤกษ์, นวางศ์, องค์เกณฑ์) · กองดาว/ดาวเล็ง/คู่ดาว · สรุปตามกฎ
— **ไม่มีข้อมูลส่วนตัวของลูกดวงนอกจากชื่อที่โหรตั้งไว้และวันเวลาเกิด**
