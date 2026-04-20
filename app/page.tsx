"use client";

import { useCallback, useState } from "react";

type GenerateOk = {
  ok: true;
  html: string;
  filename: string;
  documentBase64: string;
};

type GenerateErr = { ok: false; error: string };

export default function Home() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [download, setDownload] = useState<{
    filename: string;
    documentBase64: string;
  } | null>(null);

  const onGenerate = useCallback(async () => {
    setError(null);
    setLoading(true);
    setPreviewHtml(null);
    setDownload(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const data = (await res.json()) as GenerateOk | GenerateErr;
      if (!data.ok) {
        setError(data.error || "Request failed.");
        return;
      }
      setPreviewHtml(data.html);
      setDownload({
        filename: data.filename,
        documentBase64: data.documentBase64,
      });
    } catch {
      setError("Network error. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }, [topic]);

  const onDownload = useCallback(() => {
    if (!download) return;
    const bytes = Uint8Array.from(atob(download.documentBase64), (c) =>
      c.charCodeAt(0)
    );
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = download.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [download]);

  return (
    <main className="pageShell">
      <header className="hero">
        <p className="eyebrow">AI Document Assistant</p>
        <h1>AutoDoc AI</h1>
        <p className="heroSubtitle">
          Create polished Word documents from a simple prompt. Generate content,
          review the live preview, and download in one smooth workflow.
        </p>
      </header>

      <section className="appCard">
        <div className="sectionHeader">
          <h2>Create document</h2>
          <p>Describe what you want and we will format it for Word.</p>
        </div>
        <label htmlFor="topic" className="fieldLabel">
          Topic / prompt
        </label>
        <textarea
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={4}
          placeholder="e.g. Onboarding guide for remote software teams"
          className="topicInput"
        />
        <div className="actionsRow">
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={loading || !topic.trim()}
            className="primaryBtn"
          >
            {loading ? "Generating…" : "Generate document"}
          </button>
          {download && (
            <button type="button" onClick={onDownload} className="secondaryBtn">
              Download Word file
            </button>
          )}
        </div>
        {loading && (
          <div className="progressBox">
            <div className="progressMeta">
              <strong>Preparing your document...</strong>
              <span>drafting content, collecting images, building preview</span>
            </div>
            <div className="loadingTrack">
              <div className="loadingBar" />
            </div>
          </div>
        )}
        {error && <p className="errorText">{error}</p>}
      </section>

      {previewHtml && (
        <section className="previewSection">
          <div className="sectionHeader">
            <h2>Preview</h2>
            <p>Review your generated content before download.</p>
          </div>
          <div className="previewCanvas" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </section>
      )}

      <section className="tipsGrid" aria-label="Helpful prompts">
        <article className="tipCard">
          <h3>Best Prompt Quality</h3>
          <p>
            Include audience, objective, and tone (formal, concise, detailed) for
            better output quality.
          </p>
        </article>
        <article className="tipCard">
          <h3>Save Time</h3>
          <p>
            Keep prompts specific with 1-2 constraints so the first generated version
            is closer to your final draft.
          </p>
        </article>
        <article className="tipCard">
          <h3>Quick Iteration</h3>
          <p>
            Regenerate with refined wording if needed, then download once your preview
            looks correct.
          </p>
        </article>
      </section>
    </main>
  );
}
