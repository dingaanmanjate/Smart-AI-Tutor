import { component$, useStore, useVisibleTask$, $, useSignal } from "@builder.io/qwik";
import { useLocation, useNavigate } from "@builder.io/qwik-city";
import { API_BASE, GEMINI_API_URL } from "../../../config/constants";
import { toBase64Resized } from "../../../lib/utils";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface Message {
  role: "user" | "ai";
  content: string;
  image?: string;
}

export default component$(() => {
  const loc = useLocation();
  const nav = useNavigate();
  const lessonId = loc.params.lessonId;
  const chatMessagesRef = useSignal<Element>();

  const state = useStore({
    messages: [] as Message[],
    inputValue: "",
    imageData: null as string | null,
    isStreaming: false,
    status: "Active Session",
    loading: true,
  });

  const scrollBottom = $(() => {
    if (chatMessagesRef.value) {
      chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight;
    }
  });

  const renderMath = $(() => {
    if (typeof (window as any).renderMathInElement !== "undefined" && chatMessagesRef.value) {
      (window as any).renderMathInElement(chatMessagesRef.value, {
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

  // Initial Load
  useVisibleTask$(async () => {
    try {
      const resp = await fetch(`${API_BASE}/lessons/${lessonId}`);
      const lesson = await resp.json();
      state.messages = lesson.history || [];
      state.status = lesson.status === "finished" ? "Finished - Ready for Test" : "Active Session";
      state.loading = false;
      setTimeout(scrollBottom, 100);
      setTimeout(renderMath, 200);
    } catch (e) {
      console.error("Failed to load lesson", e);
    }
  });

  const handleSend = $(async () => {
    if (!state.inputValue && !state.imageData) return;

    const userMsg = state.inputValue;
    const userImg = state.imageData;

    state.messages.push({
      role: "user",
      content: userMsg,
      image: userImg || undefined,
    });

    state.inputValue = "";
    state.imageData = null;
    state.isStreaming = true;
    
    setTimeout(scrollBottom, 50);

    // Prepare AI bubble
    state.messages.push({ role: "ai", content: "..." });

    try {
      const response = await fetch(`${GEMINI_API_URL}/chat-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          lesson_id: lessonId,
          image: userImg,
        }),
      });

      if (!response.ok) throw new Error("Stream connection failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.replace("data: ", "");
              if (dataStr === "[DONE]") break;
              try {
                const data = JSON.parse(dataStr);
                if (data.error) throw new Error(data.error);
                aiContent += data.text;
                state.messages[state.messages.length - 1].content = aiContent;
                renderMath();
                scrollBottom();
              } catch {
                // Ignore parsing errors for partial chunks
              }
            } else if (line.trim().length > 0) {
              aiContent += line + "\n";
              state.messages[state.messages.length - 1].content = aiContent;
              renderMath();
              scrollBottom();
            }
          }
        }
      }

      state.isStreaming = false;
      renderMath();

      // Sync history
      fetch(`${API_BASE}/lessons/chat`, {
        method: "POST",
        body: JSON.stringify({ lessonId, message: userMsg, aiResponse: aiContent }),
      }).catch((err) => console.warn("History sync failed", err));

    } catch (err: any) {
      state.isStreaming = false;
      state.messages[state.messages.length - 1].content = "Error: " + err.message;
    }
  });

  const handleImageChange = $(async (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      state.imageData = await toBase64Resized(input.files[0]);
    }
  });

  return (
    <>
      <div class="chat-header-whatsapp">
        <button class="chat-back-btn" onClick$={() => nav("/dashboard")}>&larr;</button>
        <div class="chat-profile">
          <div class="chat-avatar">AI</div>
          <div class="chat-name-info">
            <h4>AI Tutor</h4>
            <span id="chat-status">{state.status}</span>
          </div>
        </div>
        <button class="primary-btn" style={{ fontSize: "0.6rem", padding: "5px 10px", margin: 0 }}>
          FINISH
        </button>
      </div>

      <div class="chat-room">
        <div ref={chatMessagesRef} class="chat-messages">
          {state.messages.map((m, i) => (
            <div key={i} class={`message ${m.role}`}>
              <div dangerouslySetInnerHTML={DOMPurify.sanitize(marked.parse(m.content) as string)} />
              {m.image && (
                <div style={{ marginTop: "10px" }}>
                  <img src={m.image} style={{ maxWidth: "200px", borderRadius: "8px" }} />
                </div>
              )}
            </div>
          ))}
          {state.loading && <div class="message ai">Initializing AI Session...</div>}
        </div>

        {state.imageData && (
          <div class="img-preview-area">
            <div class="preview-thumb">
              <img src={state.imageData} />
              <button class="remove-preview" onClick$={() => (state.imageData = null)}>×</button>
            </div>
          </div>
        )}

        <div class="chat-input-area">
          <button class="chat-tool-btn" title="Voice Input">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>

          <button class="chat-tool-btn" onClick$={() => (document.getElementById("chat-img-input") as HTMLInputElement)?.click()} title="Attach Photo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
          </button>
          <input type="file" id="chat-img-input" style={{ display: "none" }} accept="image/*" onChange$={handleImageChange} />

          <input
            type="text"
            class="chat-input"
            placeholder="Message..."
            value={state.inputValue}
            onInput$={(e) => (state.inputValue = (e.target as HTMLInputElement).value)}
            onKeyUp$={(e) => e.key === "Enter" && handleSend()}
          />

          <button class="chat-send-btn" onClick$={handleSend} disabled={state.isStreaming}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
});
