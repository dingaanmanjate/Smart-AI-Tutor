import { component$, Slot, useStore, useVisibleTask$, $ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { userPool } from "../../lib/cognito";
import { API_BASE } from "../../config/constants";

export default component$(() => {
  const nav = useNavigate();
  const state = useStore({
    userName: "Learner",
    enrolledSubjects: [] as string[],
    showSubjectPopup: false,
    curriculum: "",
    availableSubjects: [] as string[],
  });

  const handleLogout = $(() => {
    const user = userPool.getCurrentUser();
    if (user) user.signOut();
    nav("/");
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    const user = userPool.getCurrentUser();
    if (!user) {
      nav("/");
      return;
    }

    try {
      const email = user.getUsername();
      const profileResp = await fetch(`${API_BASE}/profile?email=${encodeURIComponent(email)}`);
      const profile = await profileResp.json();
      
      state.userName = profile.name || "Learner";
      state.curriculum = profile.curriculum || "CAPS";
      state.enrolledSubjects = profile.subjects || [];

      // Fetch available subjects for enrollment
      const subjectsResp = await fetch(`${API_BASE}/subjects?curriculum=${state.curriculum}`);
      const allSubjects = await subjectsResp.json();
      state.availableSubjects = allSubjects.map((s: any) => s.subjectName);
    } catch (e) {
      console.error("Failed to load dashboard data", e);
    }
  });

  const handleEnroll = $(async () => {
    const select = document.getElementById("popup-subj-select") as HTMLSelectElement;
    const subjectName = select?.value;
    if (!subjectName) return;

    const user = userPool.getCurrentUser();
    if (!user) return;

    try {
      const resp = await fetch(`${API_BASE}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          email: user.getUsername(),
          subjectName,
          curriculum: state.curriculum,
        }),
      });

      if (resp.ok) {
        state.enrolledSubjects.push(subjectName);
        state.showSubjectPopup = false;
      } else {
        const data = await resp.json();
        alert(data.error || "Enrollment failed");
      }
    } catch (e) {
      console.error("Enroll error", e);
    }
  });

  return (
    <div id="learner-dashboard">
      {/* Mobile Header */}
      <header class="mobile-header">
        <h2 id="mobile-name">{state.userName}</h2>
        <button class="logout-btn-mini" onClick$={handleLogout}>Logout</button>
      </header>

      <div class="dashboard-wrapper">
        <aside class="sidebar">
          <div class="sidebar-header">
            <h2 id="sidebar-name">{state.userName}</h2>
            <button
              class="primary-btn"
              onClick$={() => nav("/lesson-history")}
              style={{ padding: "5px 10px", fontSize: "0.65rem", marginTop: "10px", background: "rgba(255,255,255,0.05)", width: "100%" }}
            >
              ⌛ View Chat History
            </button>
          </div>

          <div class="sidebar-subjects-header">
            <h4 class="form-group label" style={{ margin: 0 }}>ENROLLED SUBJECTS</h4>
            <button class="add-subj-btn-mini" onClick$={() => (state.showSubjectPopup = !state.showSubjectPopup)} title="Add Subject">+</button>
          </div>
          <div class="sidebar-subjects">
            <ul id="my-subjects-list" style={{ padding: 0, margin: 0 }}>
              {state.enrolledSubjects.map((subject) => (
                <li key={subject}>
                   <button class="sidebar-subject-btn" onClick$={() => nav(`/subject/${subject}`)}>{subject}</button>
                </li>
              ))}
            </ul>
          </div>

          {state.showSubjectPopup && (
            <div id="sidebar-subject-popup" class="sidebar-popup active">
                <h4>Enroll in Subject</h4>
                <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "10px" }}>
                  Curriculum: <strong id="popup-curriculum" style={{ color: "var(--text-main)" }}>{state.curriculum}</strong>
                </p>
                <select id="popup-subj-select" style={{ margin: 0 }}>
                   {state.availableSubjects
                     .filter(s => !state.enrolledSubjects.includes(s))
                     .map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div class="popup-actions">
                    <button class="primary-btn" onClick$={handleEnroll}>Enroll</button>
                    <button class="logout-btn" onClick$={() => (state.showSubjectPopup = false)} style={{ margin: 0 }}>Cancel</button>
                </div>
            </div>
          )}

          <button class="logout-btn" onClick$={handleLogout}>Logout</button>
        </aside>

        <main class="main-dashboard">
          <Slot />
        </main>
      </div>

      {/* Mobile Footer */}
      <footer class="mobile-footer">
        <button class="add-subj-btn-mini" onClick$={() => (state.showSubjectPopup = !state.showSubjectPopup)}>+</button>
        <div class="mobile-subjects-bar">
          <ul id="mobile-subjects-list">
             {state.enrolledSubjects.map((subject) => (
                <li key={subject}>
                   <button class="sidebar-subject-btn" onClick$={() => nav(`/subject/${subject}`)}>{subject}</button>
                </li>
              ))}
          </ul>
        </div>
      </footer>
    </div>
  );
});
