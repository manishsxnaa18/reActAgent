import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { Blob } from "buffer";
const recorderModule = require("node-record-lpcm16");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.TTS_VOICE || "alloy";

function ensureApiKey() {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for voice features.");
  }
}

export function createTempAudioPath(ext: "wav" | "mp3") {
  const name = `voice_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  return path.join(os.tmpdir(), name);
}

export async function recordAudioToFile(filePath: string, seconds: number): Promise<void> {
  if (seconds <= 0) {
    throw new Error("Recording duration must be greater than 0 seconds.");
  }

  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(filePath, { encoding: "binary" });
    const recordFn = typeof recorderModule === "function" ? recorderModule : recorderModule.record;
    if (typeof recordFn !== "function") {
      reject(new Error("Audio recorder is not available. Please check node-record-lpcm16 installation."));
      return;
    }

    const recorder = recordFn({
      sampleRate: 16000,
      threshold: 0,
      verbose: false
    });

    recorder.stream().pipe(fileStream);

    const timeout = setTimeout(() => {
      recorder.stop();
    }, seconds * 1000);

    fileStream.on("finish", () => {
      clearTimeout(timeout);
      resolve();
    });
    fileStream.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function transcribeAudio(filePath: string): Promise<string> {
  ensureApiKey();
  const FormDataCtor = (globalThis as any).FormData;
  if (!FormDataCtor) {
    throw new Error("FormData is not available in this Node version.");
  }

  const buffer = await fs.promises.readFile(filePath);
  const form = new FormDataCtor();
  const blob = new Blob([buffer]);
  form.append("file", blob, "audio.wav");
  form.append("model", TRANSCRIPTION_MODEL);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: form
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Transcription failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { text?: string };
  return data.text?.trim() || "";
}

export async function synthesizeSpeech(text: string, language: string, voice?: string): Promise<string> {
  ensureApiKey();
  const outputPath = createTempAudioPath("mp3");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: voice || TTS_VOICE,
      input: text,
      format: "mp3",
      language
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Speech synthesis failed (${res.status}): ${errText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(outputPath, buffer);
  return outputPath;
}

export async function playAudioFile(filePath: string): Promise<void> {
  const player = process.platform === "darwin" ? "afplay" : process.platform === "win32" ? "powershell" : "ffplay";
  const args =
    player === "powershell"
      ? ["-c", `Add-Type -AssemblyName presentationCore;` +
          `$player = New-Object System.Media.SoundPlayer '${filePath}';` +
          `$player.PlaySync();`]
      : player === "ffplay"
        ? ["-nodisp", "-autoexit", filePath]
        : [filePath];

  await new Promise<void>((resolve) => {
    const child = spawn(player, args, { stdio: "ignore" });
    child.on("error", () => resolve());
    child.on("exit", () => resolve());
  });
}