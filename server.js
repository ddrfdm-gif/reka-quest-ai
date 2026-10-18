import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️ GEMINI_API_KEY belum ditetapkan.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const systemInstruction = `
Anda ialah REKA AI Mentor untuk mata pelajaran Reka Bentuk dan Teknologi (RBT).

Peranan anda ialah pembimbing Socratic, bukan pemberi jawapan siap.

PERATURAN WAJIB:
1. Baca data murid yang diberikan.
2. Rujuk secara spesifik sekurang-kurangnya satu unsur daripada jawapan murid.
3. Jangan gunakan markdown, tanda bintang, bullet, tajuk, emoji atau senarai.
4. Jangan gunakan pujian umum seperti "syabas", "hebat" atau "sangat bagus" tanpa sebab.
5. Medan "good" mesti menyatakan satu kekuatan sebenar.
6. Medan "improve" mesti menyatakan satu kelemahan atau perkara yang perlu diperjelas.
7. Medan "question" mesti berupa satu soalan sahaja yang membantu murid mengambil tindakan seterusnya.
8. Setiap medan maksimum 35 patah perkataan.
9. Jangan memilih idea bagi pihak murid.
10. Gunakan Bahasa Melayu yang mudah.

FOKUS MISI:
1 = pengguna, masalah, keperluan, kriteria, kekangan.
2 = perbezaan idea, fungsi, kestabilan, kos, justifikasi.
3 = hubungan ciri lakaran dengan fungsi. Jika imej lakaran diberikan, rujuk hanya ciri visual yang benar-benar kelihatan dan padankan dengan catatan murid.
4 = trade-off bahan, kos dan fungsi.
5 = keputusan ujian, punca kegagalan, pemboleh ubah, iterasi.
6 = bukti, justifikasi dan refleksi.
`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    good: { type: Type.STRING },
    improve: { type: Type.STRING },
    question: { type: Type.STRING }
  },
  required: ["good", "improve", "question"]
};

function normalize(v) {
  return String(v || "")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

app.post("/api/mentor", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY belum ditetapkan di Render."
      });
    }

    const c = req.body || {};

    const context = `
MISI: ${c.mission || "-"}

DATA MURID
Pengguna: ${c.userNeed || "-"}
Masalah: ${c.problem || "-"}
Kriteria kejayaan: ${c.criteria || "-"}
Kekangan: ${c.constraint || "-"}

Idea A: ${c.ideaA || "-"}
Idea B: ${c.ideaB || "-"}
Idea C: ${c.ideaC || "-"}
Idea dipilih murid: ${c.chosenIdea || "-"}
Justifikasi murid: ${c.ideaReason || "-"}

Catatan lakaran: ${c.sketchNotes || "-"}

Ujian kestabilan: ${c.stableSec || "-"} saat
Beban: ${c.loadG || "-"} gram
Bilangan redesign: ${c.redesign || "-"}
Kegagalan: ${c.failure || "-"}
Penambahbaikan: ${c.improve || "-"}

PERMINTAAN MURID
${c.question || "Semak jawapan saya."}
`;

    let contents;

    if (
      String(c.mission) === "3" &&
      c.sketchData &&
      c.sketchData.startsWith("data:image/")
    ) {
      const base64 = c.sketchData.split(",")[1];

      contents = [{
        role: "user",
        parts: [
          {
            text:
              context +
              "\n\nLihat lakaran yang dilampirkan. Fokus pada ciri visual yang benar-benar kelihatan dan jangan mereka-reka ciri yang tidak jelas."
          },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64
            }
          }
        ]
      }];
    } else {
      contents = [{
        role: "user",
        parts: [{ text: context }]
      }];
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.15,
        maxOutputTokens: 300,
        responseMimeType: "application/json",
        responseSchema
      }
    });

    const raw = response.text?.trim();

    if (!raw) {
      throw new Error("Gemini tidak memulangkan respons.");
    }

    let structured;
    try {
      structured = JSON.parse(raw);
    } catch (e) {
      console.error("RAW GEMINI RESPONSE:", raw);
      throw new Error("Format respons Gemini tidak sah.");
    }

    structured = {
      good: normalize(structured.good),
      improve: normalize(structured.improve),
      question: normalize(structured.question)
    };

    if (!structured.good || !structured.improve || !structured.question) {
      console.error("INCOMPLETE STRUCTURED RESPONSE:", structured);
      throw new Error("Respons Gemini tidak lengkap.");
    }

    return res.json({ structured });

  } catch (error) {
    console.error("Mentor error:", error);

    return res.status(500).json({
      error: "REKA AI Mentor tidak dapat memberi maklum balas sekarang.",
      details: error?.message || "Ralat tidak diketahui."
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`🚀 REKA QUEST AI berjalan di http://localhost:${port}`);
  console.log(`🤖 Gemini model: ${MODEL}`);
});
