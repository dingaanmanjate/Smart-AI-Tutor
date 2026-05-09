import { component$, useStore, useVisibleTask$ } from "@builder.io/qwik";
import { API_BASE } from "../../config/constants";
import { userPool } from "../../lib/cognito";

export default component$(() => {
  const state = useStore({
    firstName: "Name",
    surname: "Surname",
    curriculum: "Curriculum",
    grade: "Grade",
    profileComplete: true,
    stats: [] as any[],
    loading: true,
  });

  useVisibleTask$(async () => {
    const user = userPool.getCurrentUser();
    if (!user) return;

    try {
      const email = user.getUsername();
      const profileResp = await fetch(`${API_BASE}/profile?email=${encodeURIComponent(email)}`);
      const profile = await profileResp.json();
      
      state.firstName = profile.firstName || "Name";
      state.surname = profile.surname || "Surname";
      state.curriculum = profile.curriculum || "Curriculum";
      state.grade = profile.grade || "Grade";
      state.profileComplete = !!profile.firstName;

      // Fetch Stats
      const statsResp = await fetch(`${API_BASE}/stats?email=${encodeURIComponent(email)}`);
      state.stats = await statsResp.json();
      state.loading = false;
    } catch (e) {
      console.error("Failed to load profile data", e);
    }
  });

  const advicePool = [
    "Prioritize foundational concepts in algebra.",
    "Practice consistent recall for historical dates.",
    "Review past examination papers (Paper 2 focus).",
    "Practise time-management during essay writing.",
    "Strengthen understanding of core concepts in Module 3.",
    "Schedule 30 mins daily for vocabulary building.",
    "Revisit stoichiometry and chemical bonding fundamentals."
  ];

  return (
    <>
      <div class="top-row">
        {/* Profile Card */}
        <div class="profile-card-new">
          <div class="profile-img-container">
            <div id="profile-initials" class="profile-initials">
              {state.firstName[0]}
              {state.surname[0]}
            </div>
            <div class="profile-img-overlay">📷</div>
          </div>
          <div class="profile-info">
            <h1 id="prof-full-name">{state.firstName} {state.surname}</h1>
            <p id="prof-curriculum">{state.curriculum}</p>
            <p id="prof-grade">{state.grade}</p>
            <p class="profile-quote">"The future belongs in those who believe in the beauty of their dreams."</p>
          </div>
        </div>

        {/* Dashboard Control Quick Cards */}
        <div class="sub-cards-grid" id="critical-cards-grid">
          {state.stats.slice(0, 6).map((stat, i) => (
             <div key={i} class="sub-card">
                <span class="card-subject">{stat.subjectName}</span>
                <p class="card-advice">{advicePool[i % advicePool.length]}</p>
                <span class={`card-score ${stat.average < 50 ? 'critical' : 'good'}`}>{stat.average}%</span>
             </div>
          ))}
          {!state.loading && state.stats.length === 0 && (
             <div class="sub-card" style={{ gridColumn: "1 / span 3" }}>
                <span class="card-subject">Get Started</span>
                <p class="card-advice">Enroll in a subject and start your first lesson to see your progress here!</p>
             </div>
          )}
        </div>
      </div>

      {!state.profileComplete && (
        <div id="profile-setup-card" class="stats-card">
          <h3 style={{ marginBottom: "25px" }}>Complete Your Profile</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div class="form-group">
              <label>First Name</label>
              <input type="text" placeholder="Enter first name" />
            </div>
            <div class="form-group">
              <label>Surname</label>
              <input type="text" placeholder="Enter surname" />
            </div>
            <div class="form-group">
              <label>Grade</label>
              <select>
                <option value="">Select Grade</option>
                <option value="10">Grade 10</option>
                <option value="11">Grade 11</option>
                <option value="12">Grade 12</option>
              </select>
            </div>
            <div class="form-group">
              <label>Curriculum</label>
              <select>
                <option value="CAPS">CAPS</option>
                <option value="IEB">IEB</option>
              </select>
            </div>
          </div>
          <button class="primary-btn" style={{ width: "100%", marginTop: "20px" }}>
            Save Profile Information
          </button>
        </div>
      )}

      {/* Visual Stats Grid */}
      <div class="bottom-grid">
        <div class="stats-card">
          <h3>Weekly Progress</h3>
          <div class="chart-bars">
            <div class="bar" style={{ height: "40%" }}></div>
            <div class="bar" style={{ height: "70%" }}></div>
            <div class="bar" style={{ height: "55%" }}></div>
            <div class="bar" style={{ height: "90%" }}></div>
            <div class="bar" style={{ height: "60%" }}></div>
            <div class="bar" style={{ height: "80%" }}></div>
            <div class="bar" style={{ height: "65%" }}></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", fontSize: "0.8rem", marginTop: "20px", color: "var(--text-dim)" }}>
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
          </div>
        </div>
        <div class="stats-card">
          <h3>Study Schedule</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "10px", height: "160px", paddingTop: "10px" }}>
            {Array.from({ length: 21 }).map((_, i) => (
              <div key={i} style={{ background: i === 2 ? "var(--text-main)" : "var(--bg-pure)", border: i === 2 ? "1px solid var(--border-main)" : "1px solid var(--border-subtle)" }}></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
});
