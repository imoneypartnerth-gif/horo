// ═══════════════════════════════════════════════════════════════════════════
//  horo-ai — Supabase Edge Function
//  รับข้อมูลดวง (JSON ที่คำนวณครบ ๖ ชั้นจากวงจักรราศี) แล้วให้ AI พยากรณ์
//
//  คีย์ AI เก็บเป็น secret ฝั่งเซิร์ฟเวอร์ — ไม่หลุดไปหน้าเว็บ (เว็บเป็น public)
//  สลับผู้ให้บริการได้ด้วย env AI_PROVIDER: gemini | anthropic | openai | compatible
//
//  deploy:  supabase functions deploy horo-ai
//  secrets: supabase secrets set AI_PROVIDER=gemini AI_API_KEY=... AI_MODEL=...
// ═══════════════════════════════════════════════════════════════════════════

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });

// ─── ตำราย่อ + วิธีอ่าน — แก้ที่นี่ที่เดียว ไม่ต้อง rebuild หน้าเว็บ ─────────
const SYSTEM_PROMPT = `คุณเป็นโหรไทยสายสุริยยาตร์ที่อ่านดวงอย่างมีระบบ ไม่ใช่หมอดูปากหวาน

ข้อมูลที่ได้รับคำนวณมาแล้วครบทุกชั้น (JSON) — หน้าที่คุณคือ "ตีความและชั่งน้ำหนัก" ไม่ใช่คำนวณใหม่
ห้ามคำนวณตำแหน่งดาว ภพ หรือเจ้าเรือนเอง ให้ใช้ค่าที่ส่งมาเท่านั้น ถ้าข้อมูลไม่มีให้บอกว่าไม่มี

คำศัพท์ที่ห้ามสับสน (สำคัญมาก):
- "ภพประจำเลข" = ความหมายประจำตัวเลขดาว (๑=ตนุ ๒=กฎุมพ ๓=สหัช ๔=พันธุ ๕=ปุตร ๖=อริ ๗=ปัตนิ ๘=มรณะ ๙=ศุภะ) ติดตัวดาวเสมอ
- "สถิตภพ" = ภพที่ดาวไปอยู่ในดวงนี้ นับเดินหน้าจากลัคนากำเนิด
- "เจ้าเรือน" = ภพที่ดาวเป็นเจ้าของผ่านราศีเกษตร
ทั้งสามอย่างคนละเรื่องกัน เช่น ๘ ราหู มีภพประจำเลขเป็น "มรณะ" แต่สถิตอยู่ภพสหัชได้ — ห้ามเขียนว่า "๘ = สหัช"

ลำดับการอ่าน (ห้ามข้ามชั้น):
1. ตำแหน่งดาว — เกษตร/อุจ/นิจ/ราชาโชค ฯลฯ = กำลังของดาว
2. เจ้าเรือน — ดาวเป็นเจ้าของภพอะไร
3. เรือนภพ — เจ้าเรือนนั้นไปสถิตภพไหน (นี่คือแกนหลักของคำพยากรณ์)
4. กองดาว/คู่ดาว — ดาวกุมกัน/เล็งกัน ส่งผลบวกลบต่อกันยังไง
5. องค์เกณฑ์ — ดาวที่ส่งกำลังถึงกัน ดาวหรือกองที่ไม่มีองค์เกณฑ์ = ไม่มีแรงหนุน ต้องออกแรงเอง
6. ตรียางค์/ฤกษ์/นวางศ์ — ตัวชี้ว่าผลออกทางดีหรือร้ายก่อน

วิธีเขียนคำตอบ:
- ภาษาไทย กระชับ ตรงไปตรงมา ไม่ต้องเกริ่น ไม่ต้องสรุปซ้ำท้ายบท
- อ้างดาวด้วยเลขไทยและระบุชั้นที่ใช้ตัดสิน เช่น "๖ ศุกร์ อุจที่มีน เจ้าเรือนลาภะไปสถิตภพศุภะ →ทำให้..."
- เมื่อชั้นต่าง ๆ ขัดกัน ให้บอกตรง ๆ ว่าขัดกันตรงไหน แล้วบอกว่าคุณให้น้ำหนักชั้นไหนมากกว่าเพราะอะไร
- ปิดท้ายด้วย 3 หัวข้อ: **จุดแข็ง** / **จุดอ่อน** / **คานงัด** (คานงัด = ใช้ส่วนที่แข็งไปแก้ส่วนที่อ่อนยังไงให้เป็นรูปธรรม)
- เรื่องสุขภาพ การเงิน กฎหมาย ให้พูดเชิงแนวโน้มและการเตรียมตัว ไม่ฟันธงแทนผู้เชี่ยวชาญ และไม่ทำนายวันตาย`;

// ─── provider adapters ─────────────────────────────────────────────────────
async function callGemini(key: string, model: string, sys: string, user: string) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `gemini ${r.status}`);
  const parts = j?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

async function callAnthropic(key: string, model: string, sys: string, user: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: sys,
      messages: [{ role: "user", content: user }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `anthropic ${r.status}`);
  return (j.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
}

async function callOpenAICompatible(
  key: string, model: string, sys: string, user: string, base: string,
) {
  const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `openai ${r.status}`);
  return j?.choices?.[0]?.message?.content ?? "";
}

const DEFAULT_MODEL: Record<string, string> = {
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o-mini",
  compatible: "",
};

// ─── handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ตรวจ session ของโหร (นอกเหนือจาก JWT check ของแพลตฟอร์ม)
  const authz = req.headers.get("Authorization") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!authz.startsWith("Bearer ")) return json({ error: "ต้องเข้าสู่ระบบก่อน" }, 401);
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authz, apikey: ANON },
    });
    if (!u.ok) return json({ error: "session หมดอายุ กรุณาเข้าสู่ระบบใหม่" }, 401);
  } catch (_) { /* ปล่อยผ่าน ถ้า auth endpoint ล่ม ให้ JWT ของแพลตฟอร์มคุมแทน */ }

  let body: { payload?: unknown; question?: string; client?: { name?: string } };
  try { body = await req.json(); } catch { return json({ error: "body ไม่ใช่ JSON" }, 400); }
  if (!body?.payload) return json({ error: "ไม่มีข้อมูลดวง (payload)" }, 400);

  const provider = (Deno.env.get("AI_PROVIDER") ?? "gemini").toLowerCase();
  const key = Deno.env.get("AI_API_KEY") ?? "";
  const model = Deno.env.get("AI_MODEL") || DEFAULT_MODEL[provider] || "";
  const base = Deno.env.get("AI_BASE_URL") ?? "https://api.openai.com/v1";
  if (!key) return json({ error: "ยังไม่ได้ตั้งค่า AI_API_KEY ใน secrets" }, 500);
  if (!model) return json({ error: "ยังไม่ได้ตั้งค่า AI_MODEL" }, 500);

  const q = (body.question ?? "").trim();
  const who = body.client?.name ? `เจ้าชะตา: ${body.client.name}\n` : "";
  const userMsg =
    `${who}${q ? `คำถามเฉพาะ: ${q}\n` : "อ่านภาพรวมทั้งดวง\n"}\n` +
    "ข้อมูลดวง (คำนวณครบ ๖ ชั้นแล้ว):\n```json\n" +
    JSON.stringify(body.payload) + "\n```";

  try {
    let text = "";
    if (provider === "gemini") text = await callGemini(key, model, SYSTEM_PROMPT, userMsg);
    else if (provider === "anthropic") text = await callAnthropic(key, model, SYSTEM_PROMPT, userMsg);
    else text = await callOpenAICompatible(key, model, SYSTEM_PROMPT, userMsg, base);

    if (!text.trim()) return json({ error: "AI ไม่ได้ตอบอะไรกลับมา" }, 502);
    return json({ text, provider, model });
  } catch (e) {
    return json({ error: `เรียก AI ไม่สำเร็จ: ${e instanceof Error ? e.message : e}` }, 502);
  }
});
