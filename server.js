import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const systemInstruction = `
Anda ialah REKA AI Mentor untuk mata pelajaran Reka Bentuk dan Teknologi (RBT).

Tugas anda ialah membimbing murid secara Socratic, bukan memberi jawapan siap.

Jawapan WAJIB menggunakan tepat tiga baris ini:

GOOD: <satu kekuatan sebenar berdasarkan jawapan murid>
IMPROVE: <satu perkara khusus yang perlu diperjelas atau ditambah baik>
QUESTION: <satu soalan pembimbing yang spesifik>

Peraturan:
- Gunakan Bahasa Melayu yang mudah.
- Jangan guna markdown, tanda bintang, bullet, emoji atau tajuk tambahan.
- Jangan gunakan pujian umum seperti "syabas", "hebat" atau "sangat bagus" tanpa bukti.
- Rujuk sekurang-kurangnya satu unsur sebenar daripada jawapan murid.
- Setiap bahagian maksimum 35 patah perkataan.
- Jangan memilih idea bagi pihak murid.

Fokus misi:
1 = pengguna, masalah, keperluan, kriteria kejayaan, kekangan.
2 = idea, fungsi, kestabilan, kos dan justifikasi.
3 = hubungan lakaran dengan fungsi dan kestabilan.
4 = trade-off bahan, kos dan fungsi.
5 = keputusan ujian, punca kegagalan dan penambahbaikan.
6 = bukti, justifikasi dan refleksi.
`;

function clean(value) {
  return String(value || "")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMentor(text) {
  const raw = String(text || "")
    .replace(/\r/g, "")
    .trim();

  const getValue = (label) => {
    const regex = new RegExp(
      `(?:^|\\n)${label}:\\s*([\\s\\S]*?)(?=\\n(?:GOOD|IMPROVE|QUESTION):|$)`,
      "i"
    );

    const match = raw.match(regex);

    return match ? clean(match[1]) : "";
  };

  let good = getValue("GOOD");
  let improve = getValue("IMPROVE");
  let question = getValue("QUESTION");

  /*
    Fallback:
    Jika Gemini tersasar sedikit daripada format,
    kita masih cuba ambil tiga ayat pertama.
  */

  if (!good || !improve || !question) {
    const lines = raw
      .split(/\n+/)
      .map(clean)
      .filter(Boolean);

    good =
      good ||
      lines[0] ||
      "Jawapan kamu sudah mempunyai unsur yang boleh dinilai.";

    improve =
      improve ||
      lines[1] ||
      "Perincikan satu kriteria supaya reka bentuk boleh diuji dengan lebih jelas.";

    question =
      question ||
      lines[2] ||
      "Apakah bukti yang boleh kamu gunakan untuk menyokong keputusan reka bentuk ini?";
  }

  return {
    good,
    improve,
    question
  };
}

app.post("/api/mentor", async (req, res) => {
  try {
    /*
      Semak API key
    */

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY belum ditetapkan di Render."
      });
    }

    const c = req.body || {};

    /*
      Konteks pembelajaran murid
    */

    const context = `
MISI: ${c.mission || "-"}

DATA MURID

Pengguna:
${c.userNeed || "-"}

Masalah:
${c.problem || "-"}

Kriteria kejayaan:
${c.criteria || "-"}

Kekangan:
${c.constraint || "-"}

Idea A:
${c.ideaA || "-"}

Idea B:
${c.ideaB || "-"}

Idea C:
${c.ideaC || "-"}

Idea dipilih murid:
${c.chosenIdea || "-"}

Justifikasi murid:
${c.ideaReason || "-"}

Catatan lakaran:
${c.sketchNotes || "-"}

Ujian kestabilan:
${c.stableSec || "-"} saat

Beban:
${c.loadG || "-"} gram

Bilangan redesign:
${c.redesign || "-"}

Kegagalan:
${c.failure || "-"}

Penambahbaikan:
${c.improve || "-"}

PERMINTAAN MURID:

${c.question || "Semak jawapan saya."}
`;

    let contents;

    /*
      MISI 3:
      Jika murid ada lakaran, hantar gambar lakaran
      kepada Gemini bersama teks.
    */

    if (
      String(c.mission) === "3" &&
      c.sketchData &&
      c.sketchData.startsWith("data:image/")
    ) {
      const base64 = c.sketchData.split(",")[1];

      contents = [
        {
          role: "user",
          parts: [
            {
              text:
                context +
                "\n\nLihat lakaran yang dilampirkan. Rujuk hanya ciri visual yang benar-benar kelihatan. Jangan mereka-reka ciri yang tidak jelas."
            },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64
              }
            }
          ]
        }
      ];
    } else {
      /*
        Untuk misi lain gunakan teks sahaja
      */

      contents = context;
    }

    /*
      Panggil Gemini
    */

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 220
      }
    });

    const raw = response.text?.trim();

    if (!raw) {
      throw new Error("Gemini tidak memulangkan respons.");
    }

    /*
      Ini berguna kalau kita nak semak Render Logs nanti
    */

    console.log("RAW GEMINI RESPONSE:");
    console.log(raw);

    /*
      Tukar respons Gemini kepada struktur
      yang frontend REKA QUEST perlukan
    */

    const structured = parseMentor(raw);

    return res.json({
      structured
    });

  } catch (error) {
    console.error("MENTOR ERROR:");
    console.error(error);

    return res.status(500).json({
      error: "REKA AI Mentor tidak dapat memberi maklum balas sekarang.",
      details: error?.message || "Ralat tidak diketahui."
    });
  }
});

/*
  Jalankan server
*/

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(
    `🚀 REKA QUEST AI berjalan di http://localhost:${port}`
  );

  console.log(
    `🤖 Gemini model: ${MODEL}`
  );
});
