const API_BASE = "https://ia3l0uc788.execute-api.af-south-1.amazonaws.com/prod/";
const GEMINI_API_URL = "https://jhthoghclmear3dzu2r6ftstfa0zqhvc.lambda-url.af-south-1.on.aws/"; // Populated by sync-api.sh
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

        // Attach popup enroll button handlers
        const popupEnrollBtn = document.getElementById('popup-enroll-btn');
        const footerEnrollBtn = document.getElementById('footer-enroll-btn');
        if (popupEnrollBtn) popupEnrollBtn.onclick = () => enrollSubject(email);
        if (footerEnrollBtn) footerEnrollBtn.onclick = () => enrollSubject(email);

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

        loadSubjectsForPopup();
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

// Toggle Subject Enrollment Popup (Desktop sidebar / Mobile footer)
window.toggleSubjectPopup = function () {
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        const popup = document.getElementById('footer-subject-popup');
        if (popup) popup.classList.toggle('active');
    } else {
        const popup = document.getElementById('sidebar-subject-popup');
        if (popup) popup.classList.toggle('active');
    }

    // Load subjects into both popups
    // Load grades for profile setup if element exists
    const gradeSelect = document.getElementById('p-grade');
    if (gradeSelect) loadGrades();
}

async function loadGrades() {
    const select = document.getElementById('p-grade');
    if (!select) return;

    try {
        const resp = await fetch(`${API_BASE}/grades`);
        const grades = await resp.json();

        // Preserve existing selection if any (e.g. during profile edit)
        const currentVal = select.getAttribute('data-current') || select.value;

        select.innerHTML = grades.map(g => `
            <option value="${g}" ${g == currentVal ? 'selected' : ''}>Grade ${g}</option>
        `).join('') || '<option value="">No grades found</option>';

        // If user already has a grade, select it
        if (currentProfile && currentProfile.grade) {
            select.value = currentProfile.grade;
        }
    } catch (e) {
        console.error("Error loading grades:", e);
        select.innerHTML = '<option value="10">Grade 10 (Offline)</option>';
    }
}

async function loadSubjectsForPopup() {
    const grade = currentProfile.grade || "10";
    const curriculum = currentProfile.curriculum || "CAPS";

    // Update display in popups
    const popupCurr = document.getElementById('popup-curriculum');
    const footerCurr = document.getElementById('footer-popup-curriculum');
    if (popupCurr) popupCurr.innerText = `${curriculum} - Grade ${grade}`;
    if (footerCurr) footerCurr.innerText = `${curriculum} - Grade ${grade}`;

    try {
        // Fetch subjects for this grade from ATP database
        const resp = await fetch(`${API_BASE}/curriculum?grade=${grade}`);
        const subjects = await resp.json();

        const optionsHtml = subjects.map(s => `
            <option value="${s.subjectName}">${s.subjectName}</option>
        `).join('') || '<option>No subjects found for this grade</option>';

        // Populate both popup selects
        const popupSelect = document.getElementById('popup-subj-select');
        const footerSelect = document.getElementById('footer-subj-select');
        if (popupSelect) popupSelect.innerHTML = optionsHtml;
        if (footerSelect) footerSelect.innerHTML = optionsHtml;
    } catch (e) {
        console.error('Error loading subjects for popup:', e);
    }
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

            // Update global profile object
            currentProfile.name = data.name;
            currentProfile.surname = data.surname;
            currentProfile.grade = data.grade;
            currentProfile.curriculum = data.curriculum;

            // Hide Setup Card and Expand Academic Card
            const setupCard = document.getElementById('profile-setup-card');
            const acadCard = document.getElementById('academic-card');
            if (setupCard) setupCard.style.display = 'none';
            if (acadCard) acadCard.style.gridColumn = '1 / span 2';

            // Refresh subjects available for enrollment based on new grade
            loadSubjectsForPopup();
        }
    } catch (e) {
        console.error("Save error:", e);
    }
}

async function enrollSubject(email) {
    const isMobile = window.innerWidth <= 768;
    const selectId = isMobile ? 'footer-subj-select' : 'popup-subj-select';
    const subjName = document.getElementById(selectId)?.value;
    const curr = currentProfile.curriculum || 'CAPS';

    if (!subjName) {
        return alert('Please select a subject');
    }

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
            // Close popup and refresh
            toggleSubjectPopup();
            renderDashboard(email);
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

    // 2. Get grade and build curriculumId
    const curriculum = currentProfile.curriculum || "CAPS";
    const grade = currentProfile.grade || "10";

    // Build curriculumId matching our ATP data format
    const subjectSlug = subjectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const curriculumId = `${subjectSlug}-grade${grade}-2023`;

    mainArea.innerHTML = `<div style="padding: 40px; text-align: center;"><h2>Loading ${subjectName} ATP...</h2></div>`;

    try {
        // Show footer when back on dashboard
        const footer = document.querySelector('.mobile-footer');
        if (footer) footer.classList.remove('hidden');

        // Load template and ATP topics in parallel
        const [templateResp, topicsResp] = await Promise.all([
            fetch('/subject-portal.html'),
            fetch(`${API_BASE}/curriculum/topics?curriculumId=${encodeURIComponent(curriculumId)}`)
        ]);

        const templateHtml = await templateResp.text();
        const topics = await topicsResp.json();

        // Inject template
        mainArea.innerHTML = templateHtml;

        // Populate dynamic content
        document.getElementById('portal-subject-name').innerText = `${subjectName} Portal`;
        document.getElementById('portal-curriculum').innerText = `Curriculum: ${curriculum}`;
        document.getElementById('portal-grade').innerText = `Grade: ${grade}`;

        // Group topics by term and render
        const terms = { 1: [], 2: [], 3: [], 4: [] };
        topics.forEach(t => {
            const term = parseInt(t.term) || 1;
            if (terms[term]) terms[term].push(t);
        });

        const atpContainer = document.getElementById('atp-terms-container');
        atpContainer.innerHTML = Object.entries(terms).map(([termNum, termTopics]) => `
            <div class="atp-item">
                <span class="term">Term ${termNum}</span>
                <div style="flex: 1;">
                    ${termTopics.length > 0 ? termTopics.map(t => `
                        <div class="topic-entry" onclick="startATPLesson('${t.topicId}', '${t.topicName.replace(/'/g, "\\'")}', '${subjectName}')" style="cursor:pointer; margin-bottom: 15px; padding: 10px; border-radius: 8px; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                            <strong style="color: var(--text-main); display: block; margin-bottom: 4px;">${t.topicName}</strong>
                            <p style="margin: 0; font-size: 0.8rem; color: var(--text-dim);">${t.context || 'Click to start lesson'}</p>
                        </div>
                    `).join('') : `<p style="font-style: italic; font-size: 0.8rem; color: var(--text-dim);">No ATP topics available for this term.</p>`}
                </div>
            </div>
        `).join('');

        // Store for later use
        currentProfile.activeCurriculumId = curriculumId;

    } catch (e) {
        console.error("Portal error:", e);
        mainArea.innerHTML = `<h2>Error loading portal: ${e.message}</h2>`;
    }
};

// Start a lesson directly from ATP topic
window.startATPLesson = async function (topicId, topicName, subjectName) {
    const email = cognitoUser.getUsername();
    const grade = currentProfile.grade || "";

    try {
        const resp = await fetch(`${API_BASE}/lessons/start`, {
            method: 'POST',
            body: JSON.stringify({
                email,
                topicId,
                subjectName,
                grade
            })
        });
        const lesson = await resp.json();
        renderChatRoom(lesson);
    } catch (e) {
        alert("Failed to start lesson: " + e.message);
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
        // Load template and data in parallel
        const [templateResp, dataResp] = await Promise.all([
            fetch('/lesson-history.html'),
            fetch(`${API_BASE}/lessons?email=${encodeURIComponent(email)}&topicId=${encodeURIComponent(topicId)}`)
        ]);

        const templateHtml = await templateResp.text();
        const lessons = await dataResp.json();

        // Inject template
        mainArea.innerHTML = templateHtml;

        // Populate dynamic content
        document.getElementById('topic-title').innerText = `Topic: ${topicId}`;
        document.getElementById('back-to-topics-btn').onclick = () => openSubjectPortal(currentProfile.activeSubject);
        document.getElementById('start-lesson-btn').onclick = () => startNewLesson(topicId);

        // Render lesson cards
        const container = document.getElementById('lessons-container');
        if (lessons.length > 0) {
            container.innerHTML = lessons.map(l => {
                const statusDisplay = l.status === 'finished' ? 'Ready for Test' :
                    l.status === 'completed' ? 'Completed' : 'In Progress';
                const scoreDisplay = l.assessmentScore ? `<p style="color: #00ff00; font-weight: bold;">Score: ${l.assessmentScore}%</p>` : '';

                let buttonsHtml = '';
                if (l.status === 'finished') {
                    // Finished but not tested yet - prominent TAKE TEST button
                    buttonsHtml = `
                        <div style="display:flex; gap:10px;">
                            <button class="primary-btn" onclick="viewRecap('${l.lessonId}')" style="font-size: 0.7rem; flex:1;">RECAP</button>
                            <button class="primary-btn" onclick="openAssessment('${l.lessonId}')" style="font-size: 0.7rem; flex:1; background: #00ff00; color: #000; font-weight: bold;">TAKE TEST</button>
                        </div>
                    `;
                } else if (l.status === 'completed') {
                    // Fully completed with score
                    buttonsHtml = `
                        <div style="display:flex; gap:10px;">
                            <button class="primary-btn" onclick="viewRecap('${l.lessonId}')" style="font-size: 0.7rem; flex:1;">RECAP</button>
                            ${!l.assessmentScore ? `<button class="primary-btn" onclick="openAssessment('${l.lessonId}')" style="font-size: 0.7rem; flex:1; background: var(--border-main); color: var(--bg-pure);">RETEST</button>` : ''}
                        </div>
                    `;
                } else {
                    // Teaching in progress
                    buttonsHtml = `<button class="primary-btn" onclick="resumeLesson('${l.lessonId}')" style="font-size: 0.7rem; width:100%;">RESUME</button>`;
                }

                return `
                    <div class="lesson-card">
                        <h4>Lesson ${l.lessonId.substring(2)}</h4>
                        <p style="font-size: 0.8rem; color: var(--text-dim);">Status: ${statusDisplay}</p>
                        ${scoreDisplay}
                        ${buttonsHtml}
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = '<p class="text-dim">No lessons found for this topic yet. Click above to start!</p>';
        }

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

async function renderChatRoom(lesson, isReadOnly = false) {
    const mainArea = document.querySelector('.main-dashboard');
    mainArea.classList.add('chat-active'); // Make UI static

    const isFinished = lesson.status === 'finished';

    try {
        const templateResp = await fetch('/chat-room.html');
        const templateHtml = await templateResp.text();
        mainArea.innerHTML = templateHtml;

        // Update status text
        let statusText = 'Active Session';
        if (isFinished) statusText = 'Finished - Ready for Test';
        else if (isReadOnly) statusText = 'Lesson Recap';
        document.getElementById('chat-status').innerText = statusText;

        // Render message history with math formatting
        const messagesHtml = lesson.history.map(m => `
            <div class="message ${m.role}">
                ${formatMessageContent(m.content)}
            </div>
        `).join('');

        const box = document.getElementById('chat-messages');
        box.innerHTML = messagesHtml;

        // Apply KaTeX rendering to all messages
        renderMathInChat();

        if (isFinished) {
            // Show finished state - input disabled, Take Test button visible
            document.getElementById('chat-input-container').style.display = 'none';
            const finishBtn = document.getElementById('finish-lesson-btn');
            finishBtn.innerText = 'TAKE TEST';
            finishBtn.onclick = () => openAssessment(lesson.lessonId);
        } else if (isReadOnly) {
            box.innerHTML += `<div class="message ai" style="font-style:italic; background: rgba(255,255,255,0.05); border-color: var(--border-subtle);">This lesson is completed. You can review the history above.</div>`;
            // Hide input area for read-only
            document.getElementById('chat-input-container').style.display = 'none';
            document.getElementById('finish-lesson-btn').style.display = 'none';
        } else {
            // Active lesson - attach event handlers
            document.getElementById('finish-lesson-btn').onclick = () => finishLesson(lesson.lessonId);
            document.getElementById('chat-input').onkeyup = (e) => {
                if (e.key === 'Enter') sendChatMessage(lesson.lessonId);
            };
            document.getElementById('send-msg-btn').onclick = () => sendChatMessage(lesson.lessonId);
        }

        box.scrollTop = box.scrollHeight;

        // Hide mobile footer for focused lesson
        const footer = document.querySelector('.mobile-footer');
        if (footer) footer.classList.add('hidden');
    } catch (e) {
        mainArea.innerHTML = `<h2>Error loading chat: ${e.message}</h2>`;
    }
}

// Format message content - handle code blocks and escape HTML
function formatMessageContent(content) {
    if (!content) return '';

    // Escape HTML first
    let formatted = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Handle code blocks (```...```)
    formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre class="code-block"><code>${code.trim()}</code></pre>`;
    });

    // Handle inline code (`...`)
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Preserve newlines
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
}

// Render math equations using KaTeX
function renderMathInChat() {
    if (typeof renderMathInElement !== 'undefined') {
        const chatBox = document.getElementById('chat-messages');
        if (chatBox) {
            renderMathInElement(chatBox, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false
            });
        }
    }
}

window.exitChatRoom = function () {
    const mainArea = document.querySelector('.main-dashboard');
    mainArea.classList.remove('chat-active');

    const footer = document.querySelector('.mobile-footer');
    if (footer) footer.classList.remove('hidden');

    interactWithTopic(currentProfile.activeTopicId);
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
    if (!confirm("Are you ready to finish the teaching session? After finishing, you can take a test to check your knowledge.")) return;

    try {
        // Call backend to mark lesson as finished
        const res = await fetch(`${API_BASE}/lessons/finish`, {
            method: 'POST',
            body: JSON.stringify({ lessonId: lessonId })
        });

        const data = await res.json();

        // Append goodbye message to chat
        const box = document.getElementById('chat-messages');
        box.innerHTML += `
            <div class="message ai" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-color: var(--accent-blue);">
                ${formatMessageContent(data.goodbye || "Great work! Your lesson is complete.")}
            </div>
        `;
        box.scrollTop = box.scrollHeight;
        renderMathInChat();

        // Disable input area
        document.getElementById('chat-input-container').style.display = 'none';

        // Change FINISH button to EXIT/TAKE TEST
        const finishBtn = document.getElementById('finish-lesson-btn');
        finishBtn.innerText = 'EXIT → TAKE TEST';
        finishBtn.onclick = () => {
            exitChatRoom();
            // After small delay, show the lesson history where user can click Take Test
            setTimeout(() => {
                interactWithTopic(currentProfile.activeTopicId);
            }, 300);
        };

    } catch (err) {
        console.error("Error finishing lesson:", err);
        alert("Error finishing lesson. Please try again.");
    }
};

window.openAssessment = async function (lessonId) {
    const mainArea = document.querySelector('.main-dashboard');

    try {
        // Load template first
        const templateResp = await fetch('/assessment.html');
        const templateHtml = await templateResp.text();
        mainArea.innerHTML = templateHtml;

        // Setup back button
        document.getElementById('back-to-history-btn').onclick = () => interactWithTopic(currentProfile.activeTopicId);

        // Hide mobile footer
        const footer = document.querySelector('.mobile-footer');
        if (footer) footer.classList.add('hidden');

        // Store lessonId for later use
        currentProfile.activeAssessmentLessonId = lessonId;

        // Generate test from AI
        const testRes = await fetch(`${GEMINI_API_URL}generate-test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lesson_id: lessonId })
        });

        if (!testRes.ok) {
            const errData = await testRes.json().catch(() => ({ error: testRes.statusText }));
            throw new Error((errData.error || 'Unknown server error') + (errData.trace ? '\n' + errData.trace : ''));
        }

        const testData = await testRes.json();
        const test = testData.test;

        // Hide loading, show test
        document.getElementById('test-loading').style.display = 'none';
        document.getElementById('test-questions').style.display = 'block';

        // Populate test content
        document.getElementById('assessment-subject').innerText = test.subject + ' Assessment';
        document.getElementById('instructions-text').innerText = test.instructions;

        // Render questions with math formatting
        const questionsHtml = test.questions.map((q, i) => `
            <div class="question-item" style="margin-bottom: 25px; padding: 20px; border: 1px solid var(--border-subtle);">
                <p style="font-weight: bold; margin-bottom: 10px;">Question ${i + 1} (${q.marks} marks)</p>
                <div class="question-text" style="font-size: 1rem; line-height: 1.6;">
                    ${formatMessageContent(q.question)}
                </div>
            </div>
        `).join('');

        document.getElementById('questions-list').innerHTML = questionsHtml;

        // Render math in questions
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(document.getElementById('questions-list'), {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false
            });
        }

        // Setup file upload
        document.getElementById('upload-zone').onclick = () => document.getElementById('file-input').click();
        document.getElementById('file-input').onchange = (e) => previewAssessmentImage(e.target.files[0]);
        document.getElementById('submit-btn').onclick = () => submitAssessment(lessonId);
        document.getElementById('finish-assessment-btn').onclick = () => interactWithTopic(currentProfile.activeTopicId);

    } catch (e) {
        console.error('Assessment error:', e);
        mainArea.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h2>Error loading assessment</h2>
                <p class="text-dim">${e.message}</p>
                <button class="primary-btn" onclick="interactWithTopic(currentProfile.activeTopicId)" style="margin-top: 20px;">Back to Lessons</button>
            </div>
        `;
    }
};

// Preview uploaded image before submission
function previewAssessmentImage(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-img').src = e.target.result;
        document.getElementById('image-preview').style.display = 'block';
        document.getElementById('upload-zone').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

window.submitAssessment = async function (lessonId) {
    const fileInput = document.getElementById('file-input');
    if (!fileInput.files[0]) {
        alert('Please upload an image of your work first.');
        return;
    }

    // Show loading in the submit area
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerText = 'AI Grading...';
    submitBtn.disabled = true;

    try {
        // Convert image to base64
        // Convert image to base64 with resizing (Max 1024px)
        const file = fileInput.files[0];
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1024;
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    // Use JPEG 0.8 for good balance of size/quality
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });

        // Call grading API
        const res = await fetch(`${GEMINI_API_URL}grade-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lesson_id: lessonId,
                image: base64
            })
        });

        if (!res.ok) throw new Error('Grading failed');

        const result = await res.json();

        // Hide test, show results
        document.getElementById('test-questions').style.display = 'none';
        const resultDiv = document.getElementById('grading-result');
        resultDiv.style.display = 'block';

        // Populate results
        document.getElementById('grade-val').innerText = result.score + '%';
        document.getElementById('grade-val').style.color = result.score >= 50 ? '#00ff00' : '#ff4d4d';
        document.getElementById('grade-feedback').innerText = result.feedback;

        // Per-question feedback
        if (result.questionResults && result.questionResults.length > 0) {
            const qResultsHtml = result.questionResults.map(qr => `
                <div style="padding: 15px; border-bottom: 1px solid var(--border-subtle);">
                    <p><strong>Question ${qr.questionId}</strong>: ${qr.marksAwarded}/${qr.marksAvailable} marks</p>
                    <p class="text-dim" style="font-size: 0.85rem;">${qr.feedback}</p>
                </div>
            `).join('');
            document.getElementById('question-results').innerHTML = qResultsHtml;
        }

        // Model solution with math rendering
        const solutionDiv = document.getElementById('grade-solution');
        solutionDiv.innerHTML = formatMessageContent(result.modelSolution || 'No solution available.');

        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(solutionDiv, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false
            });
        }

    } catch (e) {
        console.error('Grading error:', e);
        alert('Grading failed: ' + e.message);
        submitBtn.innerText = 'SUBMIT FOR GRADING';
        submitBtn.disabled = false;
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
