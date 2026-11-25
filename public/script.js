let history = JSON.parse(localStorage.getItem('chat_history')) || [];

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function parseMarkdown(text) {
    if (!text) return ``;
    let safeText = escapeHtml(text);

    safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safeText = safeText.replace(/__(.*?)__/g, '<strong>$1</strong>');

    safeText = safeText.replace(/\*(.*?)\*/g, '<em>$1</em>');
    safeText = safeText.replace(/_(.*?)_/g, '<em>$1</em>');
    safeText = safeText.replace(/\n/g, '<br>');
    return safeText;
}

function addBubble(role, text) {
    const isUser = role === 'user';
    const p = document.createElement('p');
    p.className = isUser ? 'chat-bubble user-bubble' : 'chat-bubble ai-bubble';
    if (!isUser && text) {
        p.classList.add('reveal');
    }
    p.innerHTML = `${isUser ? '自分' : 'AI'}: ${parseMarkdown(text)}`;
    log.appendChild(p);
    return p;
}

function renderHistory() {
    log.innerHTML = '';
    history.forEach(talk => {
        addBubble(talk.role, talk.parts[0].text);
    });
    log.scrollTop = log.scrollHeight;
}

window.addEventListener('DOMContentLoaded', renderHistory);


function statusHtml(icon, label) {
    return `<span class="status-text"><span class="status-icon">${icon}</span>${escapeHtml(label)}<span class="dots"></span></span>`;
}

async function send() {
    const txt = input.value;
    if (!txt) return;

    addBubble('user', txt);

    input.value = '';
    log.scrollTop = log.scrollHeight;

    const aiPara = addBubble('model', '');
    let currentAiText = '';
    let currentStatus = statusHtml('⏳', '送信中');
    let scrolledToBubbleTop = false;

    function render() {
        if (currentAiText) {
            aiPara.classList.add('reveal');
            aiPara.innerHTML = `AI: ${parseMarkdown(currentAiText)}`;
            if (!scrolledToBubbleTop) {
                scrolledToBubbleTop = true;
                const offset = aiPara.getBoundingClientRect().top - log.getBoundingClientRect().top;
                log.scrollTop += offset - 15; 
            }
        } else {
            aiPara.innerHTML = `AI: ${currentStatus}`;
            log.scrollTop = log.scrollHeight;
        }
    }

    function handleLine(line) {
        if (!line.trim()) return;
        try {
            const parsed = JSON.parse(line);

            if (parsed.status === 'thinking') {
                currentStatus = statusHtml('🤔', '推論中');
                render();
            }

            if (parsed.text) {
                currentAiText += parsed.text;
                render();
            }

            if (parsed.error) {
                currentStatus = statusHtml('⚠️', 'エラーが発生しました');
                if (!currentAiText) render();
            }

            if (parsed.final_history) {
                history = parsed.final_history;
                localStorage.setItem('chat_history', JSON.stringify(history));
            }
        } catch (e) {
            console.error("JSONパースエラー:", e, "対象の行:", line);
        }
    }

    render();

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: txt,
                history: history
            })
        });

        if (!res.ok) {
            aiPara.innerHTML = `AI: ⚠️ エラーが発生しました (${res.status})`;
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) handleLine(line);
        }

        if (buffer.trim()) handleLine(buffer);

        if (!currentAiText) {
            aiPara.innerHTML = 'AI: (応答がありませんでした)';
        }
    } catch (e) {
        console.error("通信エラー:", e);
        aiPara.innerHTML = 'AI: ⚠️ 通信に失敗しました';
    }
}

function clearChat() {
    if (confirm('これまでの会話履歴をすべて削除しますか？')) {
        localStorage.removeItem('chat_history');
        history = [];
        log.innerHTML = '';
    }
}

function undoChat() {
    if (history.length < 2) {
        alert('削除できる会話履歴がありません。');
        return;
    }

    if (confirm('最新の会話履歴を1往復分削除しますか？')) {
        history.pop();
        history.pop();

        localStorage.setItem('chat_history', JSON.stringify(history));
        renderHistory();
    }
}

const DOUBLE_ENTER_INTERVAL = 500;
let lastEnterTime = 0;

input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') {
        lastEnterTime = 0;
        return;
    }
    if (e.isComposing || e.keyCode === 229) return;

    const now = Date.now();

    if (lastEnterTime !== 0 && now - lastEnterTime <= DOUBLE_ENTER_INTERVAL) {
        e.preventDefault();
        lastEnterTime = 0;
        const pos = input.selectionStart;
        if (input.value[pos - 1] === '\n') {
            input.value = input.value.slice(0, pos - 1) + input.value.slice(pos);
        }
        send();
    } else {
        lastEnterTime = now;
    }
});
