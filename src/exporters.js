function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportPNG(canvas, filename = "liquid-orb.png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("PNG export failed."));
          return;
        }
        downloadBlob(blob, filename);
        resolve();
      },
      "image/png",
      1,
    );
  });
}

function pickVideoMimeType() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((item) => MediaRecorder.isTypeSupported(item)) || "";
}

export async function exportWebM(canvas, durationSec = 6) {
  if (!window.MediaRecorder) {
    throw new Error("This browser does not support MediaRecorder.");
  }

  const mimeType = pickVideoMimeType();
  if (!mimeType) {
    throw new Error("No supported WebM codec found in this browser.");
  }

  const stream = canvas.captureStream(60);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 14_000_000 });
  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  await new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Video recording failed."));
    recorder.onstop = resolve;
    recorder.start();
    setTimeout(() => recorder.stop(), durationSec * 1000);
  });

  stream.getTracks().forEach((track) => track.stop());
  const blob = new Blob(chunks, { type: mimeType });
  downloadBlob(blob, `liquid-orb-${durationSec}s.webm`);
}

function downloadText(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, filename);
}

export function exportPresetJSON(state) {
  downloadText(`${JSON.stringify(state, null, 2)}\n`, "liquid-orb-preset.json");
}

export function exportEmbedSnippet(state) {
  const snippet = `const liquidOrbPreset = ${JSON.stringify(state, null, 2)};

// Apply to your orb runtime:
// orbEngine.setState(liquidOrbPreset);
`;
  downloadText(snippet, "liquid-orb-preset.js");
}
