import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️ GEMINI_API_KEY belum ditetapkan dalam fail .env");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const mentorInstructions = `
Anda ialah REKA AI Mentor untuk pembelajaran Reka Bentuk dan Teknologi (RBT).
Gunakan Bahasa Melayu yang mudah, mesra murid dan ringkas.

PERANAN:
- Bertindak sebagai Socratic design coach.
- Baca konteks sebenar murid dan rujuk butiran jawapan mereka.
- Jangan beri reka bentuk siap atau jawapan akhir terus.
- Utamakan soalan yang membantu murid membuat keputusan sendiri.
- Jika jawapan murid kabur, nyatakan SATU perkara yang sudah baik dan SATU perkara yang perlu diperjelas.
- Kaitkan maklum balas dengan pengguna, fungsi, kestabilan, bahan, kos, pengujian dan iterasi apabila relevan.
- Jangan memuji secara kosong.
- Maksimum kira-kira 120 patah perkataan.
- Akhiri dengan satu soalan tindakan yang spesifik.

MISI:
1 Problem Scanner: bantu murid mengenal pasti pengguna, masalah, keperluan, kriteria dan kekangan.
2 Idea Forge: bandingkan idea berdasarkan kriteria; jangan pilih bagi pihak murid.
3 Sketch Lab: fokus hubungan ciri lakaran dengan fungsi.
4 REKA Shop: fokus trade-off kos, bahan dan fungsi.
5 Build & Test: gunakan data ujian untuk membantu diagnosis dan cadangan eksperimen seterusnya.
6 Pitch Arena: bantu murid membina justifikasi dan refleksi.
`;

app.post("/api/mentor", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY belum ditetapkan dalam fail .env." });
    }

    const c = req.body || {};
    const context = `
Misi: ${c.mission}

Konteks murid:
Pengguna: ${c.userNeed || "-"}
Masalah: ${c.problem || "-"}
Kriteria kejayaan: ${c.criteria || "-"}
Kekangan: ${c.constraint || "-"}

Idea A: ${c.ideaA || "-"}
Idea B: ${c.ideaB || "-"}
Idea C: ${c.ideaC || "-"}
Idea dipilih: ${c.chosenIdea || "-"}
Justifikasi: ${c.ideaReason || "-"}

Ujian kestabilan: ${c.stableSec || "-"} saat
Beban: ${c.loadG || "-"} gram
Bilangan redesign: ${c.redesign || "-"}
Kegagalan dikenal pasti: ${c.failure || "-"}
Penambahbaikan: ${c.improve || "-"}

Permintaan murid:
${c.question || "Berikan bimbingan berdasarkan konteks ini."}
`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: context,
      config: {
        systemInstruction: mentorInstructions,
        temperature: 0.6,
        maxOutputTokens: 260
      }
    });

    const reply = response.text?.trim();
    if (!reply) throw new Error("Gemini tidak memulangkan teks.");
    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Ralat semasa menghubungi REKA AI Mentor melalui Gemini. Semak API key dan sambungan Internet."
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 REKA QUEST AI (Gemini) berjalan di http://localhost:${port}`);
  console.log(`🤖 Model: ${MODEL}`);
});
