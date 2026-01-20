const API_BASE = "https://hdc6ss053e.execute-api.af-south-1.amazonaws.com/prod/";
const GEMINI_API_URL = "https://dxpdnpv3yqmd6pid5jxjtymqv40fedtm.lambda-url.af-south-1.on.aws/"; // Populated by sync-api.sh
// Global state to prevent UI crashes when switching views
let currentProfile = {};

window.checkUserSession = function () {
    cognitoUser = userPool.getCurrentUser();

    if (cognitoUser != null) {
        cognitoUser.getSession((err, session) => {
            if (err) return;
            const email = cognitoUser.getUsername();

            // Hide Auth
            const authContainer = document.getElementById('auth-container');
            if (authContainer) authContainer.style.display = 'none';

            // Ensure Dashboard exists
            if (!document.getElementById('learner-dashboard')) {
                renderDashboard(email);
            }
        });
    }
};

window.renderDashboard = async function (email) {

    let dashboard = document.getElementById('learner-dashboard');
    if (!dashboard) {
        dashboard = document.createElement('div');
        dashboard.id = 'learner-dashboard';
        dashboard.className = 'dashboard-container';
        document.body.appendChild(dashboard);
    }

    dashboard.innerHTML = `<h2>Loading Profile...</h2>`;
    dashboard.style.display = 'block';

    try {
        console.log("Fetching profile and template...");
        const [profileResp, htmlResp] = await Promise.all([
            fetch(`${API_BASE}/profile?email=${encodeURIComponent(email)}`),
            fetch('/dashboard.html')
        ]);

        if (!profileResp.ok) throw new Error(`API error: ${profileResp.status}`);

        const profile = await profileResp.json();
        currentProfile = profile; // Store globally
        const dashboardHtml = await htmlResp.text();

        // Inject the template
        dashboard.innerHTML = dashboardHtml;

        // Populate dynamic fields
        const hasProfile = !!profile.name;

        // Sidebar & Profile Info
        const fullName = profile.name && profile.surname ? `${profile.name} ${profile.surname}` : (profile.name || email);

        document.getElementById('sidebar-name').innerText = profile.name || 'Learner';
        if (document.getElementById('mobile-name')) {
            document.getElementById('mobile-name').innerText = profile.name || 'Learner';
        }
        document.getElementById('prof-full-name').innerText = fullName;
        document.getElementById('prof-curriculum').innerText = profile.curriculum || 'Set your curriculum';
        document.getElementById('prof-grade').innerText = profile.grade ? `Grade ${profile.grade}` : 'Set your grade';

        const displayCurr = document.getElementById('display-curriculum');
        if (displayCurr) displayCurr.innerText = profile.curriculum || 'CAPS';

        // Set form values for setup card
        document.getElementById('p-name').value = profile.name || '';
        document.getElementById('p-surname').value = profile.surname || '';
        document.getElementById('p-grade').value = profile.grade || '8';
        document.getElementById('p-curriculum').value = profile.curriculum || 'CAPS';

        // Set visibility of setup card
        const setupCard = document.getElementById('profile-setup-card');
        if (setupCard) setupCard.style.display = hasProfile ? 'none' : 'block';

        // Attach event listeners for dynamic elements
        document.getElementById('save-profile-btn').onclick = () => saveProfile(email);
        document.getElementById('enroll-btn').onclick = () => enrollSubject(email);

        // Populate enrolled subjects list
        const list = document.getElementById('my-subjects-list');
        const subjects = profile.subjects || [];

        if (subjects.length > 0) {
            // Render subjects as buttons within list items
            const subjectsHtml = subjects.map(s => `
                <li><button class="sidebar-subject-btn" onclick="openSubjectPortal('${s}')">${s}</button></li>
            `).join('');

            list.innerHTML = subjectsHtml;

            // Populate mobile list if exists
            const mobileList = document.getElementById('mobile-subjects-list');
            if (mobileList) {
                mobileList.innerHTML = subjectsHtml;
                initCircularScroll(mobileList, true); // Horizontal
            }

            // Initiate Circular Scroll for desktop sidebar
            initCircularScroll(list, false); // Vertical
        } else {
            list.innerHTML = '<li style="border-color: transparent; text-align:center;">No subjects yet</li>';
        }

        renderCriticalCards(subjects);

        loadSubjects();
    } catch (e) {
        dashboard.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h2>Error loading dashboard</h2>
                <p>${e.message}</p>
                <button class="logout-btn" onclick="handleLogout()" style="width: auto; padding: 10px 20px;">Logout</button>
            </div>
        `;
        console.error("Dashboard error:", e);
    }
}

function toggleSubjectForm() {
    const area = document.getElementById('subject-selection-area');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

async function saveProfile(email) {
    const nameVal = document.getElementById('p-name').value;
    const data = {
        email: email,
        name: nameVal,
        surname: document.getElementById('p-surname').value,
        grade: document.getElementById('p-grade').value,
        curriculum: document.getElementById('p-curriculum').value
    };

    try {
        const resp = await fetch(`${API_BASE}/profile`, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (resp.ok) {
            // Update UI Silently
            const greeting = document.getElementById('greeting-name');
            if (greeting) greeting.innerText = nameVal || email;

            const curr = document.getElementById('display-curriculum');
            if (curr) curr.innerText = data.curriculum;

            // Hide Setup Card and Expand Academic Card
            const setupCard = document.getElementById('profile-setup-card');
            const acadCard = document.getElementById('academic-card');
            if (setupCard) setupCard.style.display = 'none';
            if (acadCard) acadCard.style.gridColumn = '1 / span 2';

            loadSubjects();
        }
    } catch (e) {
        console.error("Save error:", e);
    }
}

async function loadSubjects() {
    const curriculum = document.getElementById('p-curriculum').value;
    const select = document.getElementById('subj-select');
    if (!select) return;
    select.innerHTML = '<option>Loading...</option>';

    try {
        const resp = await fetch(`${API_BASE}/subjects?curriculum=${curriculum}`);
        const subjects = await resp.json();

        select.innerHTML = subjects.map(s => `
            <option value="${s.subjectName}">${s.subjectName} (${s.studentCount || 0} enrolled)</option>
        `).join('') || '<option>No subjects found</option>';
    } catch (e) {
        select.innerHTML = '<option>Error loading</option>';
    }
}

async function enrollSubject(email) {
    const subjName = document.getElementById('subj-select').value;
    const curr = document.getElementById('p-curriculum').value;

    // Client-side check
    const existing = Array.from(document.querySelectorAll('#my-subjects-list li')).map(li => li.innerText);
    if (existing.includes(subjName)) {
        return alert("You are already enrolled in this subject!");
    }

    try {
        const resp = await fetch(`${API_BASE}/enroll`, {
            method: 'POST',
            body: JSON.stringify({ email: email, subjectName: subjName, curriculum: curr })
        });

        if (resp.ok) {
            // Full refresh of the sidebar list to reset the infinite loop
            renderDashboard(email);
            toggleSubjectForm(); // Hide form after enrollment
            loadSubjects(); // Update counts
        } else {
            const data = await resp.json();
            alert(data.error || "Enrollment failed");
        }
    } catch (e) {
        console.error("Enroll error:", e);
    }
}

window.openSubjectPortal = async function (subjectName) {

    const mainArea = document.querySelector('.main-dashboard');
    if (!mainArea) return;

    // 1. Highlight active subject in sidebar
    currentProfile.activeSubject = subjectName;
    document.querySelectorAll('.sidebar-subject-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText === subjectName);
    });

    // 2. Fetch Detailed Subject Data (ATP Topics)
    const curriculum = currentProfile.curriculum || "N/A";

    mainArea.innerHTML = `<div style="padding: 40px; text-align: center;"><h2>Loading ${subjectName} ATP...</h2></div>`;

    try {
        // Show footer when back on dashboard
        const footer = document.querySelector('.mobile-footer');
        if (footer) footer.classList.remove('hidden');

        const resp = await fetch(`${API_BASE}/subject-details?curriculum=${encodeURIComponent(curriculum)}&subjectName=${encodeURIComponent(subjectName)}`);
        const subjectData = await resp.json();
        const topics = subjectData.topics || [];


        // Group topics by term
        const terms = { "Term 1": [], "Term 2": [], "Term 3": [], "Term 4": [] };
        topics.forEach(t => {
            if (terms[t.term]) terms[t.term].push(t);
        });

        mainArea.innerHTML = `
            <div class="portal-header">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <button class="primary-btn" onclick="renderDashboard(cognitoUser.getUsername())" style="padding: 10px 15px; font-size: 0.7rem; margin-bottom: 20px;"><- Back to Dashboard</button>
                        <h1>${subjectName} Portal</h1>
                        <p class="text-dim">Curriculum: ${curriculum}</p>
                    </div>
                    <button class="primary-btn" onclick="toggleTopicForm()" style="font-size: 0.7rem;">+ Add Topic</button>
                </div>
            </div>

            <!-- Add Topic Form (Hidden) -->
            <div id="add-topic-area" style="display:none; margin: 30px 0;" class="stats-card">
                <h3>Add Topic to ${subjectName}</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 15px;">
                    <div class="form-group">
                        <label>Term</label>
                        <select id="t-term">
                            <option>Term 1</option><option>Term 2</option><option>Term 3</option><option>Term 4</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Topic Name</label>
                        <input type="text" id="t-name" placeholder="e.g. Algebra Fundamentals">
                    </div>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <input type="text" id="t-desc" placeholder="Brief overview of the topic">
                </div>
                <div style="display: flex; gap: 15px;">
                    <button class="primary-btn" onclick="saveTopic('${curriculum}', '${subjectName}')" style="flex:1;">Save Topic</button>
                    <button class="logout-btn" onclick="toggleTopicForm()" style="flex:1; margin:0;">Cancel</button>
                </div>
            </div>

            <div class="atp-container stats-card" style="margin-top: 30px;">
                <h3>Annual Teaching Plan (ATP) - 2026</h3>
                <div class="atp-list">
                    ${Object.entries(terms).map(([term, termTopics]) => `
                        <div class="atp-item">
                            <span class="term">${term}</span>
                            <div style="flex: 1;">
                                ${termTopics.length > 0 ? termTopics.map(t => `
                                    <div class="topic-entry" onclick="interactWithTopic('${t.id}')" style="cursor:pointer; margin-bottom: 15px;">
                                        <strong style="color: var(--text-main); display: block; margin-bottom: 4px;">${t.topicName}</strong>
                                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-dim);">${t.description}</p>
                                    </div>
                                `).join('') : `<p style="font-style: italic; font-size: 0.8rem; color: var(--text-dim);">No topics added for this term yet.</p>`}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (e) {
        mainArea.innerHTML = `<h2>Error loading portal: ${e.message}</h2>`;
    }
};

window.toggleTopicForm = function () {
    const area = document.getElementById('add-topic-area');
    if (area) area.style.display = area.style.display === 'none' ? 'block' : 'none';
};

window.saveTopic = async function (curr, subj) {
    const topicBtn = event.target;
    const originalText = topicBtn.innerText;
    topicBtn.innerText = "Saving...";
    topicBtn.disabled = true;

    const data = {
        curriculum: curr,
        subjectName: subj,
        term: document.getElementById('t-term').value,
        topicName: document.getElementById('t-name').value,
        description: document.getElementById('t-desc').value
    };

    if (!data.topicName) {
        topicBtn.innerText = originalText;
        topicBtn.disabled = false;
        return alert("Please enter a topic name.");
    }

    try {
        const resp = await fetch(`${API_BASE}/topics`, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (resp.ok) {
            window.openSubjectPortal(subj); // Refresh
        } else {
            const err = await resp.json();
            console.error("Server error details:", err);
            alert("Error: " + (err.error || "Failed to save topic") + "\n\nDebug Info: " + JSON.stringify(err.debug || {}));
            topicBtn.innerText = originalText;
            topicBtn.disabled = false;
        }
    } catch (e) {
        console.error("Save topic error:", e);
        alert("Network Error: Could not connect to API.");
        topicBtn.innerText = originalText;
        topicBtn.disabled = false;
    }
};

window.interactWithTopic = function (topicId) {
    alert("Further interaction for topic " + topicId + " coming soon!");
};



async function renderCriticalCards(userSubjects) {
    const grid = document.getElementById('critical-cards-grid');
    if (!grid) return;

    try {
        const email = cognitoUser.getUsername();
        const resp = await fetch(`${API_BASE}/stats?email=${email}`);
        const realStats = await resp.json(); // Array of {subjectName, average}

        let displaySubjects = [...userSubjects];
        if (displaySubjects.length === 0) {
            displaySubjects = ["Mathematics", "Physical Science", "English", "History", "Geography", "Economics"];
        }

        const advicePool = [
            "Focus on active recall for formulas.",
            "Review past examination papers (Paper 2 focus).",
            "Practise time-management during essay writing.",
            "Strengthen understanding of core concepts in Module 3.",
            "Schedule 30 mins daily for vocabulary building.",
            "Revisit stoichiometry and chemical bonding fundamentals."
        ];

        grid.innerHTML = displaySubjects.slice(0, 6).map((sub, i) => {
            const stat = realStats.find(s => s.subjectName === sub);
            const score = stat ? stat.average : (Math.floor(Math.random() * 10) + 40); // 40-50% if no data yet
            const advice = advicePool[i % advicePool.length];
            const statusClass = score < 50 ? 'critical' : 'good';

            return `
                <div class="sub-card">
                    <span class="card-subject">${sub}</span>
                    <p class="card-advice">${advice}</p>
                    <span class="card-score ${statusClass}">${score}%</span>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Stats error:", err);
    }
}

function initCircularScroll(list, isHorizontal = false) {
    const container = list.parentElement;
    if (!container || list.children.length === 0) return;

    // Triple the list: [CloneA, Original, CloneB]
    const originalHTML = list.innerHTML;
    list.innerHTML = originalHTML + originalHTML + originalHTML;

    if (isHorizontal) {
        const totalWidth = list.scrollWidth;
        const singleSetWidth = totalWidth / 3;
        container.scrollLeft = singleSetWidth;

        container.onscroll = () => {
            const currentScroll = container.scrollLeft;
            if (currentScroll >= singleSetWidth * 2) {
                container.scrollLeft = currentScroll - singleSetWidth;
            } else if (currentScroll <= 0) {
                container.scrollLeft = currentScroll + singleSetWidth;
            }
        };
    } else {
        const totalHeight = list.scrollHeight;
        const singleSetHeight = totalHeight / 3;
        container.scrollTop = singleSetHeight;

        container.onscroll = () => {
            const currentScroll = container.scrollTop;
            if (currentScroll >= singleSetHeight * 2) {
                container.scrollTop = currentScroll - singleSetHeight;
            } else if (currentScroll <= 0) {
                container.scrollTop = currentScroll + singleSetHeight;
            }
        };
    }
}

window.handleLogout = function () {
    if (cognitoUser) cognitoUser.signOut();
    window.location.reload();
};

document.addEventListener('DOMContentLoaded', window.checkUserSession);
// --- AI Lesson Interaction Logic ---

window.interactWithTopic = async function (topicId) {
    const mainArea = document.querySelector('.main-dashboard');
    const email = cognitoUser.getUsername();

    mainArea.innerHTML = `<div style="padding: 40px; text-align: center;"><h2>Loading Lesson History...</h2></div>`;

    try {
        const resp = await fetch(`${API_BASE}/lessons?email=${encodeURIComponent(email)}&topicId=${encodeURIComponent(topicId)}`);
        const lessons = await resp.json();

        mainArea.innerHTML = `
            <div class="portal-header">
                <button class="primary-btn" onclick="openSubjectPortal(currentProfile.activeSubject)" style="padding: 10px 15px; font-size: 0.7rem; margin-bottom: 20px;"><- Back to Topics</button>
                <h1>Topic: ${topicId}</h1>
                <p class="text-dim">Review your previous lessons or start a new AI tutoring session.</p>
                <button class="primary-btn" onclick="startNewLesson('${topicId}')" style="margin-top:20px;">+ Start New Lesson</button>
            </div>

            <div class="lesson-history-grid">
                ${lessons.length > 0 ? lessons.map(l => `
                    <div class="lesson-card">
                        <h4>Lesson ${l.lessonId.substring(2)}</h4>
                        <p style="font-size: 0.8rem; color: var(--text-dim);">Status: ${l.status}</p>
                        ${l.status === 'completed' ? `
                            <div style="display:flex; gap:10px;">
                                <button class="primary-btn" onclick="viewRecap('${l.lessonId}')" style="font-size: 0.7rem; flex:1;">RECAP</button>
                                <button class="primary-btn" onclick="openAssessment('${l.lessonId}')" style="font-size: 0.7rem; flex:1; background: var(--border-main); color: var(--bg-pure);">TEST</button>
                            </div>
                        ` : `
                            <button class="primary-btn" onclick="resumeLesson('${l.lessonId}')" style="font-size: 0.7rem; width:100%;">RESUME</button>
                        `}
                    </div>
                `).join('') : '<p class="text-dim">No lessons found for this topic yet. Click above to start!</p>'}
            </div>
        `;
        // Save state
        currentProfile.activeTopicId = topicId;
    } catch (e) {
        mainArea.innerHTML = `<h2>Error: ${e.message}</h2>`;
    }

    // Show footer when navigating back to topics
    const footer = document.querySelector('.mobile-footer');
    if (footer) footer.classList.remove('hidden');
};

window.startNewLesson = async function (topicId) {
    const email = cognitoUser.getUsername();
    try {
        const resp = await fetch(`${API_BASE}/lessons/start`, {
            method: 'POST',
            body: JSON.stringify({
                email,
                topicId,
                subjectName: currentProfile.activeSubject
            })
        });
        const lesson = await resp.json();
        renderChatRoom(lesson);
    } catch (e) {
        alert("Failed to start lesson");
    }
};

function renderChatRoom(lesson, isReadOnly = false) {
    const mainArea = document.querySelector('.main-dashboard');
    mainArea.classList.add('chat-active'); // Make UI static

    mainArea.innerHTML = `
        <div class="chat-header-whatsapp">
            <button class="chat-back-btn" onclick="exitChatRoom()">←</button>
            <div class="chat-profile">
                <div class="chat-avatar">AI</div>
                <div class="chat-name-info">
                    <h4>AI Tutor</h4>
                    <span>${isReadOnly ? 'Lesson Recap' : 'Active Session'}</span>
                </div>
            </div>
            ${isReadOnly ? '' : `<button class="primary-btn" onclick="finishLesson('${lesson.lessonId}')" style="font-size: 0.6rem; padding: 5px 10px; margin:0;">FINISH</button>`}
        </div>

        <div class="chat-room">
            <div id="chat-messages" class="chat-messages">
                ${lesson.history.map(m => `
                    <div class="message ${m.role}">
                        ${m.content}
                    </div>
                `).join('')}
                ${isReadOnly ? `<div class="message ai" style="font-style:italic; background: rgba(255,255,255,0.05); border-color: var(--border-subtle);">This lesson is completed. You can review the history above.</div>` : ''}
            </div>

            ${isReadOnly ? '' : `
            <div id="img-preview" class="img-preview-area" style="display:none"></div>
            <div class="chat-input-area">
                <button class="chat-tool-btn" id="voice-btn" onclick="startVoiceInput()" title="Voice Input">🎤</button>
                <button class="chat-tool-btn" onclick="document.getElementById('chat-img-input').click()" title="Attach Photo">📷</button>
                <input type="file" id="chat-img-input" style="display:none" accept="image/*" onchange="previewImage(this)">
                
                <input type="text" id="chat-input" class="chat-input" placeholder="Message..." onkeyup="if(event.key==='Enter') sendChatMessage('${lesson.lessonId}')">
                <button class="chat-send-btn" onclick="sendChatMessage('${lesson.lessonId}')">➤</button>
            </div>
            `}
        </div>
    `;
    const box = document.getElementById('chat-messages');
    box.scrollTop = box.scrollHeight;

    // Hide mobile footer for focused lesson
    const footer = document.querySelector('.mobile-footer');
    if (footer) footer.classList.add('hidden');
}

window.exitChatRoom = function () {
    const mainArea = document.querySelector('.main-dashboard');
    mainArea.classList.remove('chat-active');

    const footer = document.querySelector('.mobile-footer');
    if (footer) footer.classList.remove('hidden');

    renderDashboard(cognitoUser.getUsername());
};

window.sendChatMessage = async function (lessonId) {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    // 1. UI: Append User Message and Prepare AI Bubble
    const box = document.getElementById('chat-messages');
    box.innerHTML += `<div class="message user">${msg}</div>`;

    const aiBubble = document.createElement('div');
    aiBubble.className = 'message ai';
    aiBubble.innerText = '...'; // Placeholder while connecting
    box.appendChild(aiBubble);

    input.value = '';
    box.scrollTop = box.scrollHeight;

    // 2. Fetch with Streaming Support (Multimodal)
    const imgInput = document.getElementById('chat-img-input');
    let imageData = null;

    if (imgInput && imgInput.files.length > 0) {
        imageData = await toBase64(imgInput.files[0]);
    }

    try {
        const response = await fetch(`${GEMINI_API_URL}chat-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: msg,
                lesson_id: lessonId,
                image: imageData // Send image as base64
            })
        });

        if (!response.ok) throw new Error("Stream connection failed");

        // Clear image state
        if (imgInput) {
            imgInput.value = "";
            document.getElementById('img-preview').style.display = 'none';
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiContent = "";
        aiBubble.innerText = ""; // Clear placeholder

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log("Stream complete");
                break;
            }

            console.log("Received chunk size:", value.length);

            const chunk = decoder.decode(value, { stream: true });
            console.log("Chunk content:", chunk.substring(0, 500));

            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const dataStr = line.replace("data: ", "");
                    if (dataStr === "[DONE]") break;
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.error) throw new Error(data.error);
                        aiContent += data.text;
                        aiBubble.innerText = aiContent; // Update UI in real-time
                        box.scrollTop = box.scrollHeight;
                    } catch (e) { /* partial JSON ignore */ }
                } else if (line.trim().length > 0) {
                    // Fallback: Display raw error/text if not SSE format
                    aiContent += line + "\n";
                    aiBubble.innerText = aiContent;
                    box.scrollTop = box.scrollHeight;
                }
            }
        }

        // 4. Update session history in main DB (Fire and forget or async)
        fetch(`${API_BASE}/lessons/chat`, {
            method: 'POST',
            body: JSON.stringify({ lessonId, message: msg, aiResponse: aiContent })
        }).catch(err => console.warn("History sync failed", err));

    } catch (err) {
        console.error("Chat failed:", err);
        aiBubble.innerText = "Error: " + err.message;
    }
};
window.closeLesson = function () {
    const email = cognitoUser.getUsername();
    renderDashboard(email);
};

window.takeQuiz = async function (lessonId) {
    const box = document.getElementById('chat-messages');
    box.innerHTML += `<div class="message ai">Generating your personalized quiz based on our discussion... 🧬</div>`;
    box.scrollTop = box.scrollHeight;

    try {
        const res = await fetch(`${GEMINI_API_URL}generate-quiz`, {
            method: 'POST',
            body: JSON.stringify({ lesson_id: lessonId })
        });
        const data = await res.json();

        if (data.quiz) {
            // Cache on device as requested
            localStorage.setItem(`quiz_${lessonId}`, JSON.stringify(data.quiz));
            displayQuiz(lessonId, data.quiz);
        }
    } catch (err) {
        box.innerHTML += `<div class="message ai error">Failed to generate quiz. Try again.</div>`;
    }
};

function displayQuiz(lessonId, quiz) {
    const box = document.getElementById('chat-messages');
    let html = `<div class="message ai quiz-container" id="quiz-${lessonId}">
        <h3>Knowledge Check 📝</h3>`;

    quiz.forEach((q, idx) => {
        html += `<div class="quiz-question">
            <p><strong>Q${idx + 1}:</strong> ${q.question}</p>
            ${q.options.map((opt, oIdx) => `
                <label>
                    <input type="radio" name="${q.id}" value="${oIdx}"> ${opt}
                </label>
            `).join('<br>')}
        </div><hr>`;
    });

    html += `<button class="btn-primary" onclick="submitQuiz('${lessonId}')">Submit Quiz</button></div>`;
    box.innerHTML += html;
    box.scrollTop = box.scrollHeight;
}

window.submitQuiz = async function (lessonId) {
    const quiz = JSON.parse(localStorage.getItem(`quiz_${lessonId}`));
    if (!quiz) return;

    const answers = {};
    quiz.forEach(q => {
        const selected = document.querySelector(`input[name="${q.id}"]:checked`);
        answers[q.id] = selected ? parseInt(selected.value) : -1;
    });

    const quizDiv = document.getElementById(`quiz-${lessonId}`);
    quizDiv.innerHTML = "<h4>Grading your attempt... 🎓</h4>";

    try {
        const res = await fetch(`${GEMINI_API_URL}grade-quiz`, {
            method: 'POST',
            body: JSON.stringify({ lesson_id: lessonId, quiz, answers })
        });
        const result = await res.json();

        quizDiv.innerHTML = `
            <h3>Quiz Result: ${result.score}% 🏆</h3>
            <p>${result.feedback}</p>
            <div class="analysis" style="font-size: 0.9em; color: var(--text-secondary); margin-top: 10px;">${result.detailedAnalysis}</div>
            <button class="btn-secondary" onclick="closeLesson()" style="margin-top: 15px;">Back to Dashboard</button>
        `;

        // Refresh dashboard stats
        renderDashboard(currentProfile.email);
    } catch (err) {
        quizDiv.innerHTML = "<p>Error grading quiz. Please try again.</p>";
    }
};

window.finishLesson = async function (lessonId) {
    if (!confirm("Are you ready to finish the teaching session and start your knowledge check?")) return;

    // UI: Transition to Quiz
    window.takeQuiz(lessonId);
};

window.openAssessment = async function (lessonId) {
    const mainArea = document.querySelector('.main-dashboard');
    mainArea.innerHTML = `
        <div class="portal-header">
            <button class="primary-btn" onclick="interactWithTopic(currentProfile.activeTopicId)" style="padding: 10px 15px; font-size: 0.7rem; margin-bottom: 20px;"><- Back to History</button>
            <h1>AI Assessment</h1>
        </div>

        <div class="assessment-view stats-card">
            <div class="question-box">
                <p><strong>Assignment:</strong></p>
                <p>1. Explain the primary concept discussed in today's lesson.</p>
                <p>2. Apply this concept to a real-world scenario.</p>
                <p style="margin-top:20px; font-style:italic;">Instruction: Solve these on paper, take a photo, and upload it for AI grading.</p>
            </div>

            <div class="upload-zone" onclick="document.getElementById('file-input').click()">
                <p>Click to Upload Photo of Workings</p>
                <input type="file" id="file-input" style="display:none" onchange="submitAssessment('${lessonId}')">
            </div>
            
            <div id="grading-result" style="margin-top: 30px; display:none;">
                <h3 id="grade-val" style="color: #00ff00;">Grade: 85%</h3>
                <p id="grade-feedback" class="text-dim"></p>
                <div class="stats-card" style="margin-top:20px;">
                    <h4>Verified Solution</h4>
                    <p id="grade-solution" style="font-family: monospace; font-size: 0.8rem;"></p>
                </div>
            </div>
        </div>
    `;

    // Hide mobile footer for focused assessment
    const footer = document.querySelector('.mobile-footer');
    if (footer) footer.classList.add('hidden');
};

window.submitAssessment = async function (lessonId) {
    const resDiv = document.getElementById('grading-result');
    resDiv.style.display = 'block';
    resDiv.innerHTML = '<h2>AI analyzing your workings...</h2>';

    try {
        const resp = await fetch(`${API_BASE}/lessons/grade`, {
            method: 'POST',
            body: JSON.stringify({ lessonId })
        });
        const result = await resp.json();

        resDiv.innerHTML = `
            <h3 style="color: #00ff00;">Grade: ${result.grade}</h3>
            <p class="text-dim">${result.feedback}</p>
            <div class="stats-card" style="margin-top:20px;">
                <h4>Verified IT Solution</h4>
                <p style="font-family: monospace; font-size: 0.8rem;">${result.solution}</p>
            </div>
        `;
    } catch (e) {
        alert("Grading failed");
    }
};


window.resumeLesson = async function (lessonId) {
    const mainArea = document.querySelector('.main-dashboard');
    mainArea.innerHTML = `<div style="padding: 40px; text-align: center;"><h2>Resuming Lesson...</h2></div>`;

    try {
        const resp = await fetch(`${API_BASE}/lessons?lessonId=${encodeURIComponent(lessonId)}`);
        const lesson = await resp.json();

        if (lesson && lesson.lessonId) {
            renderChatRoom(lesson);
        } else {
            alert("Lesson not found");
            interactWithTopic(currentProfile.activeTopicId);
        }
    } catch (e) {
        alert("Failed to resume lesson: " + e.message);
        interactWithTopic(currentProfile.activeTopicId);
    }
};

window.viewRecap = async function (lessonId) {
    const mainArea = document.querySelector('.main-dashboard');
    mainArea.innerHTML = `<div style="padding: 40px; text-align: center;"><h2>Loading Recap...</h2></div>`;

    try {
        const resp = await fetch(`${API_BASE}/lessons?lessonId=${encodeURIComponent(lessonId)}`);
        const lesson = await resp.json();
        renderChatRoom(lesson, true); // true = Read Only
    } catch (e) {
        alert("Failed to load recap");
    }
};
// --- Multimodal & Voice Helpers ---

window.startVoiceInput = function () {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech recognition not supported in this browser.");

    const recognition = new SpeechRecognition();
    const btn = document.getElementById('voice-btn');
    const input = document.getElementById('chat-input');
    if (!btn || !input) return;

    recognition.onstart = () => btn.classList.add('listening');
    recognition.onend = () => btn.classList.remove('listening');
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value += (input.value ? " " : "") + transcript;
    };

    recognition.start();
};

window.previewImage = function (input) {
    const area = document.getElementById('img-preview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            area.innerHTML = `
                <div class="preview-thumb">
                    <img src="${e.target.result}">
                    <button class="remove-preview" onclick="clearImage()">×</button>
                </div>
            `;
            area.style.display = 'flex';
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.clearImage = function () {
    const input = document.getElementById('chat-img-input');
    if (input) input.value = "";
    const preview = document.getElementById('img-preview');
    if (preview) preview.style.display = 'none';
};

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
