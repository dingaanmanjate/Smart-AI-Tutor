import { component$, useStore, useVisibleTask$, $, useSignal } from "@builder.io/qwik";
import { useLocation, useNavigate } from "@builder.io/qwik-city";
import { API_BASE, GEMINI_API_URL } from "../../../config/constants";
import { toBase64Resized } from "../../../lib/utils";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface Question {
  id: string;
  text: string;
  marks?: number;
}

export default component$(() => {
  const loc = useLocation();
  const nav = useNavigate();
  const lessonId = loc.params.lessonId;
  const questionsRef = useSignal<Element>();

  const state = useStore({
    questions: [] as Question[],
    instructions: "Answer all questions. Show your working where applicable.",
    testId: "",
    imageData: null as string | null,
    isSubmitting: false,
    loading: true,
    result: null as any,
  });

  const renderMath = $(() => {
    if (typeof (window as any).renderMathInElement !== "undefined" && questionsRef.value) {
      (window as any).renderMathInElement(questionsRef.value, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
      });
    }
  });

  useVisibleTask$(async () => {
    try {
      const testRes = await fetch(`${GEMINI_API_URL}/generate-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId, timestamp: Date.now() }),
      });

      if (!testRes.ok) throw new Error("Failed to generate test");

      const testData = await testRes.json();
      state.questions = testData.test.questions || [];
      state.instructions = testData.test.instructions || state.instructions;
      state.testId = testData.testId;
      state.loading = false;
      
      setTimeout(renderMath, 100);
    } catch {
      console.error("Test generation failed");
    }
  });

  const handleImageChange = $(async (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      state.imageData = await toBase64Resized(input.files[0]);
    }
  });

  const handleSubmit = $(async () => {
    if (!state.imageData) return;
    state.isSubmitting = true;

    try {
      const resp = await fetch(`${GEMINI_API_URL}/grade-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson_id: lessonId,
          test_id: state.testId,
          image: state.imageData,
        }),
      });

      if (!resp.ok) throw new Error("Grading failed");

      state.result = await resp.json();
      state.isSubmitting = false;
      
      // Update backend stats
      fetch(`${API_BASE}/lessons/grade`, {
          method: "POST",
          body: JSON.stringify({
              lessonId,
              score: state.result.total_score,
              feedback: state.result.overall_feedback
          })
      }).catch(err => console.warn("Grade sync failed", err));

    } catch {
      alert("Error grading test. Please try again.");
      state.isSubmitting = false;
    }
  });

  return (
    <div class="main-dashboard">
      <div class="portal-header">
        <button class="primary-btn" onClick$={() => nav("/dashboard")} style={{ padding: "10px 15px", fontSize: "0.7rem", marginBottom: "20px" }}>
          <strong>←</strong> Back
        </button>
        <h1>AI Assessment</h1>
      </div>

      {state.loading ? (
        <div class="stats-card" style={{ textAlign: "center", padding: "40px" }}>
          <h3>Generating your test...</h3>
          <p class="text-dim">AI is creating questions based on your lesson</p>
        </div>
      ) : !state.result ? (
        <div class="assessment-view stats-card">
          <div class="question-box">
            <p><strong>Instructions:</strong></p>
            <p>{state.instructions}</p>
          </div>

          <div ref={questionsRef} style={{ marginTop: "20px" }}>
            {state.questions.map((q, i) => (
              <div key={i} class="question-box" style={{ borderLeftColor: "var(--accent-blue)" }}>
                <p><strong>Question {i + 1}:</strong></p>
                <div dangerouslySetInnerHTML={DOMPurify.sanitize(marked.parse(q.text) as string)} />
                {q.marks && <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "10px" }}>[{q.marks} marks]</p>}
              </div>
            ))}
          </div>

          <div style={{ marginTop: "30px", padding: "20px", border: "2px dashed var(--border-subtle)", textAlign: "center" }}>
            <p><strong>Ready to submit?</strong></p>
            <p class="text-dim" style={{ margin: "10px 0" }}>Write your answers on paper, take a photo, and upload for AI grading.</p>

            <div class="upload-zone" onClick$={() => (document.getElementById("file-input") as HTMLInputElement)?.click()}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style={{ marginBottom: "10px" }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p>Click or tap to upload photo</p>
              <input type="file" id="file-input" style={{ display: "none" }} accept="image/*" onChange$={handleImageChange} />
            </div>

            {state.imageData && (
              <div style={{ marginTop: "15px" }}>
                <img src={state.imageData} style={{ maxWidth: "100%", maxHeight: "200px", border: "1px solid var(--border-main)" }} />
                <button class="primary-btn" style={{ marginTop: "15px", width: "100%" }} onClick$={handleSubmit} disabled={state.isSubmitting}>
                  {state.isSubmitting ? "Grading..." : "SUBMIT FOR GRADING"}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div class="stats-card">
          <div style={{ textAlign: "center", padding: "20px" }}>
            <h2 style={{ fontSize: "3rem", color: "#00ff00", margin: 0 }}>{state.result.total_score}%</h2>
            <p class="text-dim">Your Score</p>
          </div>

          <div style={{ marginTop: "20px" }}>
            <h4>Feedback</h4>
            <p class="text-dim">{state.result.overall_feedback}</p>
          </div>

          <div class="stats-card" style={{ marginTop: "30px", background: "rgba(255,255,255,0.02)" }}>
            <h4>Model Solution</h4>
            <div style={{ fontSize: "0.9rem", lineHeight: "1.6", padding: "15px", background: "var(--bg-pure)", borderLeft: "3px solid var(--accent-blue)" }}
                 dangerouslySetInnerHTML={DOMPurify.sanitize(marked.parse(state.result.model_solution || "") as string)} />
          </div>

          <button class="primary-btn" style={{ marginTop: "30px", width: "100%" }} onClick$={() => nav("/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      )}
    </div>
  );
});
