import { component$, useStore, useVisibleTask$ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { API_BASE } from "../../config/constants";
import { userPool } from "../../lib/cognito";

interface Lesson {
  lessonId: string;
  topicId: string;
  subjectName: string;
  status: string;
  assessmentScore?: number;
}

export default component$(() => {
  const nav = useNavigate();
  const state = useStore({
    lessons: [] as Lesson[],
    loading: true,
  });

  useVisibleTask$(async () => {
    const user = userPool.getCurrentUser();
    if (!user) {
      nav("/");
      return;
    }

    try {
      const email = user.getUsername();
      const resp = await fetch(`${API_BASE}/lessons?email=${encodeURIComponent(email)}`);
      state.lessons = await resp.json();
      state.loading = false;
    } catch (e) {
      console.error("Failed to load lesson history", e);
    }
  });

  return (
    <div class="main-dashboard">
      <div class="portal-header">
        <button class="primary-btn" onClick$={() => nav("/dashboard")} style={{ padding: "10px 15px", fontSize: "0.7rem", marginBottom: "20px" }}>
          <strong>←</strong> Back to Dashboard
        </button>
        <h1>Lesson History</h1>
        <p class="text-dim">Review your previous AI tutoring sessions and scores.</p>
      </div>

      {state.loading ? (
        <div style={{ padding: "40px", textAlign: "center" }}><h2>Loading History...</h2></div>
      ) : (
        <div class="lesson-history-grid" style={{ marginTop: "30px" }}>
          {state.lessons.length > 0 ? (
            state.lessons.map((l) => (
              <div key={l.lessonId} class="lesson-card">
                <h4>Lesson {l.lessonId.substring(0, 8)}</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Subject: {l.subjectName}</p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Status: {l.status}</p>
                {l.assessmentScore && (
                  <p style={{ color: "#00ff00", fontWeight: "bold" }}>Score: {l.assessmentScore}%</p>
                )}
                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                  <button class="primary-btn" style={{ fontSize: "0.7rem", flex: 1 }} onClick$={() => nav(`/chat/${l.lessonId}`)}>
                    {l.status === "finished" || l.status === "completed" ? "RECAP" : "RESUME"}
                  </button>
                  {l.status === "finished" && (
                    <button class="primary-btn" style={{ fontSize: "0.7rem", flex: 1, background: "#00ff00", color: "#000" }} onClick$={() => nav(`/assessment/${l.lessonId}`)}>
                      TEST
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p class="text-dim">No lessons found. Enroll in a subject to get started!</p>
          )}
        </div>
      )}
    </div>
  );
});
