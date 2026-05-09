import { component$, useStore, useVisibleTask$, $ } from "@builder.io/qwik";
import { useLocation, useNavigate } from "@builder.io/qwik-city";
import { API_BASE } from "../../../config/constants";
import { userPool } from "../../../lib/cognito";

interface Topic {
  topicId: string;
  topicName: string;
  term: string;
  subtopics: any[];
}

export default component$(() => {
  const loc = useLocation();
  const nav = useNavigate();
  const subjectName = loc.params.subjectName;

  const state = useStore({
    topics: [] as Topic[],
    curriculum: "CAPS",
    grade: "Grade 11",
    loading: true,
    userEmail: "",
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    const user = userPool.getCurrentUser();
    if (!user) {
      nav("/");
      return;
    }
    state.userEmail = user.getUsername();

    try {
      // In a real app, we'd fetch the user's grade and curriculum from their profile first
      // For now, we'll use defaults or fetch profile
      const profileResp = await fetch(`${API_BASE}/profile?email=${encodeURIComponent(state.userEmail)}`);
      const profile = await profileResp.json();
      state.curriculum = profile.curriculum || "CAPS";
      state.grade = profile.grade || "Grade 11";

      const gradeString = state.grade.toLowerCase().includes("grade") ? state.grade : `Grade ${state.grade}`;
      const curriculumId = `${state.curriculum}#${gradeString}#${subjectName}`;

      const topicsResp = await fetch(`${API_BASE}/curriculum/topics?curriculumId=${encodeURIComponent(curriculumId)}`);
      state.topics = await topicsResp.json();
      state.loading = false;
    } catch {
      console.error("Failed to load subject portal");
    }
  });

  const handleStartLesson = $(async (topic: Topic) => {
    try {
        const resp = await fetch(`${API_BASE}/lessons/start`, {
            method: 'POST',
            body: JSON.stringify({
                email: state.userEmail,
                topicId: topic.topicId,
                subjectName,
                grade: state.grade
            })
        });
        const lesson = await resp.json();
        nav(`/chat/${lesson.lessonId}`);
    } catch {
        alert("Failed to start lesson");
    }
  });

  // Group topics by term
  const terms = ["Term 1", "Term 2", "Term 3", "Term 4"];

  return (
    <div class="main-dashboard">
      <div class="portal-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <button class="primary-btn" onClick$={() => nav("/dashboard")} style={{ padding: "10px 15px", fontSize: "0.7rem" }}>
                <strong>←</strong>Dashboard
              </button>
              <button class="primary-btn" style={{ padding: "10px 15px", fontSize: "0.7rem", background: "var(--bg-card)", border: "1px solid var(--border-main)" }}>
                <strong>⌛</strong>Chat History
              </button>
            </div>
            <h1>{subjectName} Portal</h1>
            <p class="text-dim">Curriculum: {state.curriculum}</p>
            <p class="text-dim" style={{ marginTop: "5px" }}>Grade: {state.grade}</p>
          </div>
        </div>
      </div>

      <div class="atp-container stats-card" style={{ marginTop: "30px" }}>
        <h3>Annual Teaching Plan (ATP) - 2026</h3>
        <p class="text-dim" style={{ fontSize: "0.85rem", marginBottom: "20px" }}>Select a topic below to start your lesson</p>
        
        {state.loading ? (
          <div style={{ padding: "40px", textAlign: "center" }}><h2>Loading Topics...</h2></div>
        ) : (
          <div class="atp-list">
            {terms.map(term => {
              const termTopics = state.topics.filter(t => t.term === term || t.term === term.replace("Term ", ""));
              if (termTopics.length === 0) return null;

              return (
                <div key={term} style={{ marginBottom: "30px" }}>
                  <h4 style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "10px", marginBottom: "15px", color: "var(--accent-blue)" }}>
                    {term}
                  </h4>
                  {termTopics.map((topic) => (
                    <div key={topic.topicId} class="atp-item" style={{ cursor: "pointer" }} onClick$={() => handleStartLesson(topic)}>
                      <div class="term">{term}</div>
                      <div>
                        <p style={{ color: "var(--text-main)", fontWeight: "bold" }}>{topic.topicName}</p>
                        <p style={{ fontSize: "0.8rem" }}>{topic.subtopics?.length || 0} Subtopics</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
