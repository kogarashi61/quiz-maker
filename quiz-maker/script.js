/* =========================================================================
   1. 初期化・データ保存関連
========================================================================= */
let savedQuizzes = []; 
let currentQuizData = [];
let originalQuizWords = []; 

let confTarget = 'all'; 
let confOrder = 'seq';  

let currentIndex = 0;
let isWaitingForNext = false; 
let markTimeout; 
let mistakesThisRound = []; 

let isReorderMode = false; 
let isQlReorderMode = false;
let isMistakeFilterMode = false;

let editingQuiz = null; 
let editingWordId = null; 
let tempRawText = ""; 

window.onload = function() {
    loadQuizzesFromStorage();
    renderQuizList();
};

function saveQuizzesToStorage() {
    localStorage.setItem('myQuizSets', JSON.stringify(savedQuizzes));
}

function generateId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }

function loadQuizzesFromStorage() {
    const data = localStorage.getItem('myQuizSets');
    if (data) {
        savedQuizzes = JSON.parse(data);
        savedQuizzes.forEach(q => {
            q.words.forEach(w => {
                if (!w.id) w.id = generateId();
                if (w.lastMistaked === undefined) w.lastMistaked = false;
            });
        });
    }
}

function parseRawText(text) {
    const newWords = [];
    const lines = text.split('\n');
    let hasError = false;
    let errorLines = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line === '') continue;

        const parts = line.split(/[ 　\t]+/);
        if (parts.length >= 2) {
            newWords.push({ id: generateId(), q: parts[0], a: parts.slice(1), lastMistaked: false });
        } else {
            hasError = true;
            errorLines.push(i);
        }
    }
    return { words: newWords, hasError, errorLines };
}

function rebuildRawText(words) {
    return words.map(w => `${w.q} ${w.a.join(' ')}`).join('\n');
}

function showScreen(screenId) {
    ['homeScreen', 'editScreen', 'quizScreen', 'questionListScreen', 'singleWordEditScreen'].forEach(id => {
        document.getElementById(id).style.display = (id === screenId) ? 'block' : 'none';
    });
}

/* =========================================================================
   2. クイズ一覧画面の処理（ホーム画面）
========================================================================= */
document.getElementById('createNewBtn').addEventListener('click', function() {
    editingQuiz = null; 
    tempRawText = "";
    document.getElementById('editTitle').value = '';
    document.getElementById('editFontSize').value = 30;
    document.getElementById('fontSizeDisplay').textContent = 30;
    showScreen('editScreen');
});

document.getElementById('toggleReorderBtn').addEventListener('click', function() {
    isReorderMode = !isReorderMode;
    this.style.color = isReorderMode ? '#85c1a5' : '#b0b0b0'; 
    renderQuizList();
});

function renderQuizList() {
    const listDiv = document.getElementById('quizList');
    listDiv.innerHTML = ''; 

    if (savedQuizzes.length === 0) {
        listDiv.innerHTML = '<p style="text-align:center; color:#888;">クイズがありません。<br>左下の＋ボタンから作成してください。</p>';
        return;
    }

    savedQuizzes.forEach(quiz => {
        const container = document.createElement('div');
        container.className = 'quiz-item-container';
        container.dataset.id = quiz.id; 

        const playBtn = document.createElement('button');
        playBtn.className = 'quiz-item-btn';
        let displayTitle = quiz.title.length >= 16 ? quiz.title.substring(0, 15) + '…' : quiz.title;

        if (isReorderMode) {
            playBtn.innerHTML = `
                <span style="flex-grow: 1; text-align: left; padding-right: 60px;">${displayTitle}</span>
                <div class="drag-handle">=</div>
            `;
            makeDraggable(playBtn.querySelector('.drag-handle'), container, listDiv, () => {
                updateOrderFromDOM('quizList', savedQuizzes);
            });
        } else {
            playBtn.innerHTML = `
                <span style="flex-grow: 1; text-align: left;">${displayTitle}</span>
                <span style="color: #aaa; font-weight: normal; font-size: 14px;">${quiz.words.length}問</span>
            `;
            setupSwipeToDelete(playBtn, () => startQuizSettings(quiz));
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '削除';
        deleteBtn.onclick = () => {
            if (confirm(`「${quiz.title}」を削除しますか？`)) {
                savedQuizzes = savedQuizzes.filter(q => q.id !== quiz.id);
                saveQuizzesToStorage();
                renderQuizList();
            }
        };

        container.appendChild(playBtn);
        if (!isReorderMode) container.appendChild(deleteBtn);
        listDiv.appendChild(container);
    });
}

/* =========================================================================
   3. スワイプ削除 ＆ ドラッグ＆ドロップ機能
========================================================================= */
function setupSwipeToDelete(btn, onClickCallback) {
    let startX = 0, currentX = 0, isRevealed = false, isMoved = false;
    const hStart = e => { startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX; currentX = startX; isMoved = false; };
    const hMove = e => {
        if (startX === 0) return;
        currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
        let diff = currentX - startX;
        if (Math.abs(diff) > 10) isMoved = true;
        if (isRevealed && diff > 0 && diff < 80) btn.style.transform = `translateX(${diff - 80}px)`;
        else if (!isRevealed && diff < 0 && diff > -80) btn.style.transform = `translateX(${diff}px)`;
    };
    const hEnd = () => {
        if (startX === 0) return;
        let diff = currentX - startX;
        if (!isRevealed && diff < -30) { btn.style.transform = 'translateX(-80px)'; isRevealed = true; }
        else if (isRevealed && diff > 30) { btn.style.transform = 'translateX(0px)'; isRevealed = false; }
        else { btn.style.transform = isRevealed ? 'translateX(-80px)' : 'translateX(0px)'; }
        startX = 0;
    };
    btn.addEventListener('mousedown', hStart); btn.addEventListener('mousemove', hMove);
    btn.addEventListener('mouseup', hEnd); btn.addEventListener('mouseleave', hEnd);
    btn.addEventListener('touchstart', hStart, { passive: true }); btn.addEventListener('touchmove', hMove, { passive: true });
    btn.addEventListener('touchend', hEnd); btn.addEventListener('touchcancel', hEnd);
    btn.onclick = () => {
        if (isMoved) return;
        if (isRevealed) { btn.style.transform = 'translateX(0px)'; isRevealed = false; return; }
        onClickCallback();
    };
}

function makeDraggable(handle, container, listDiv, onUpdate) {
    let startY=0, initialTop=0, placeholder=null, scrollInterval=null;
    const stopScroll = () => { if(scrollInterval){clearInterval(scrollInterval);scrollInterval=null;} };
    const checkCollision = () => {
        const items = [...listDiv.querySelectorAll('.quiz-item-container:not(.placeholder), .ql-item-wrapper:not(.placeholder)')];
        items.forEach(item => {
            if (item === container) return;
            const r1 = item.getBoundingClientRect(), r2 = container.getBoundingClientRect();
            if (r2.top + r2.height/2 > r1.top && r2.top < r1.top + r1.height/2) {
                if (placeholder.nextSibling === item) listDiv.insertBefore(item, placeholder);
                else listDiv.insertBefore(placeholder, item);
            }
        });
    };
    const onStart = e => {
        if (e.type === 'touchstart') e.preventDefault();
        startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        const rect = container.getBoundingClientRect();
        placeholder = document.createElement('div');
        placeholder.className = container.className + ' placeholder';
        placeholder.style.height = `${rect.height}px`;
        container.parentNode.insertBefore(placeholder, container);
        Object.assign(container.style, { position:'fixed', zIndex:'1000', width:`${rect.width}px`, opacity:'0.9', top:`${rect.top}px`, left:`${rect.left}px`, boxShadow:'0 5px 15px rgba(0,0,0,0.2)'});
        initialTop = rect.top;
        document.addEventListener('mousemove', onMove, {passive:false}); document.addEventListener('touchmove', onMove, {passive:false});
        document.addEventListener('mouseup', onEnd); document.addEventListener('touchend', onEnd);
    };
    const onMove = e => {
        e.preventDefault();
        let cy = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        container.style.top = `${initialTop + (cy - startY)}px`;
        checkCollision();
        if (cy < 80) { if(!scrollInterval) scrollInterval = setInterval(()=>{window.scrollBy(0,-10); checkCollision();},20); }
        else if (window.innerHeight - cy < 80) { if(!scrollInterval) scrollInterval = setInterval(()=>{window.scrollBy(0,10); checkCollision();},20); }
        else stopScroll();
    };
    const onEnd = () => {
        stopScroll();
        document.removeEventListener('mousemove', onMove); document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onEnd); document.removeEventListener('touchend', onEnd);
        Object.assign(container.style, { position:'', zIndex:'', top:'', left:'', width:'', opacity:'', boxShadow:'' });
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(container, placeholder);
            placeholder.parentNode.removeChild(placeholder);
        }
        onUpdate();
    };
    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, {passive:false});
}

function updateOrderFromDOM(listId, arrayRef) {
    const listDiv = document.getElementById(listId);
    // qlListの場合はラッパーのクラスが違うので両方対応
    const newOrderIds = [...listDiv.querySelectorAll('.quiz-item-container, .ql-item-wrapper')].map(el => el.dataset.id);
    const newArr = [];
    newOrderIds.forEach(id => {
        const item = arrayRef.find(q => q.id === id);
        if (item) newArr.push(item);
    });
    if (arrayRef === savedQuizzes) { savedQuizzes = newArr; saveQuizzesToStorage(); }
    if (arrayRef === editingQuiz?.words) { editingQuiz.words = newArr; editingQuiz.rawText = rebuildRawText(newArr); saveQuizzesToStorage(); }
}

/* =========================================================================
   4. クイズ編集画面の処理
========================================================================= */
document.getElementById('editQuizBtn').addEventListener('click', function() {
    document.getElementById('editTitle').value = editingQuiz.title;
    const fSize = editingQuiz.fontSize || 30;
    document.getElementById('editFontSize').value = fSize;
    document.getElementById('fontSizeDisplay').textContent = fSize;
    tempRawText = editingQuiz.rawText || rebuildRawText(editingQuiz.words);
    showScreen('editScreen');
});

document.getElementById('editFontSize').addEventListener('input', function() { document.getElementById('fontSizeDisplay').textContent = this.value; });

document.getElementById('saveEditBtn').addEventListener('click', function() {
    const titleInput = document.getElementById('editTitle').value;
    const finalTitle = titleInput !== '' ? titleInput : '無題のクイズ';
    const fSize = parseInt(document.getElementById('editFontSize').value, 10);
    
    const parsed = parseRawText(tempRawText);
    if (parsed.words.length === 0) { alert('問題が入力されていません。'); return; }
    if (parsed.hasError) { alert('問題と解答が空白で正しく区切られていない行があります。「編集する」から修正してください。'); return; }

    if (editingQuiz) {
        editingQuiz.title = finalTitle;
        editingQuiz.fontSize = fSize;
        
        const oldWordsMap = {};
        editingQuiz.words.forEach(w => oldWordsMap[w.q + w.a.join('')] = w);
        
        editingQuiz.words = parsed.words.map(nw => {
            const key = nw.q + nw.a.join('');
            if (oldWordsMap[key]) {
                nw.id = oldWordsMap[key].id;
                nw.lastMistaked = oldWordsMap[key].lastMistaked;
            }
            return nw;
        });
        editingQuiz.rawText = rebuildRawText(editingQuiz.words);
    } else {
        savedQuizzes.unshift({
            id: generateId(), title: finalTitle, rawText: tempRawText,
            words: parsed.words, fontSize: fSize, progress: null
        });
    }
    saveQuizzesToStorage();
    renderQuizList();
    showScreen('homeScreen'); window.scrollTo(0,0);
});

document.getElementById('cancelEditBtn').addEventListener('click', function() {
    if (editingQuiz) showScreen('quizScreen');
    else showScreen('homeScreen');
});

/* =========================================================================
   5. 全画面エディタの処理
========================================================================= */
const edBg = document.getElementById('editorBg');
const edTa = document.getElementById('editorTextarea');

document.getElementById('openEditorBtn').addEventListener('click', () => {
    edTa.value = tempRawText;
    syncEditorBackground();
    document.getElementById('fullScreenEditor').style.display = 'flex';
    
    document.body.style.overflow = 'hidden'; 
    edTa.scrollTop = 0;
    edBg.scrollTop = 0;
});

document.getElementById('cancelEditorBtn').addEventListener('click', () => {
    document.getElementById('fullScreenEditor').style.display = 'none';
    document.body.style.overflow = ''; 
});

document.getElementById('applyEditorBtn').addEventListener('click', () => {
    const text = edTa.value;
    const parsed = parseRawText(text);
    if (parsed.hasError) {
        alert('問題と解答が空白で区切られていない行があります。');
        syncEditorBackground(parsed.errorLines);
        return; 
    }
    tempRawText = text;
    document.getElementById('fullScreenEditor').style.display = 'none';
    document.body.style.overflow = ''; 
});

edTa.addEventListener('input', () => syncEditorBackground());
edTa.addEventListener('scroll', () => { edBg.scrollTop = edTa.scrollTop; edBg.scrollLeft = edTa.scrollLeft; });

function syncEditorBackground(errorLines = []) {
    let text = edTa.value;
    const lines = text.split('\n');
    let html = '';
    
    lines.forEach((line, i) => {
        const isError = errorLines.includes(i);
        const cls = isError ? 'editor-bg-row error-line' : 'editor-bg-row';
        let safeTxt = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (safeTxt === '') safeTxt = '<br>'; 
        html += `<div class="${cls}">${safeTxt}</div>`;
    });
    
    edBg.innerHTML = html;
    
    edBg.scrollTop = edTa.scrollTop;
    edBg.scrollLeft = edTa.scrollLeft;
}

/* =========================================================================
   6. 問題一覧画面 ＆ 1問ずつの個別編集・削除・絞り込み
========================================================================= */
document.getElementById('openQuestionListBtn').addEventListener('click', () => {
    // 画面を開くときはリセットしておく
    isMistakeFilterMode = false;
    isQlReorderMode = false;
    document.getElementById('qlFilterMistakeBtn').style.color = '#b0b0b0';
    document.getElementById('qlToggleReorderBtn').style.color = '#b0b0b0';
    
    renderQuestionList();
    showScreen('questionListScreen');
});

document.getElementById('qlBackBtn').addEventListener('click', () => { showScreen('quizScreen'); });

// ×ボタン（間違えた問題だけを絞り込む）
document.getElementById('qlFilterMistakeBtn').addEventListener('click', function() {
    isMistakeFilterMode = !isMistakeFilterMode;
    this.style.color = isMistakeFilterMode ? '#e91e63' : '#b0b0b0';

    if (isMistakeFilterMode && isQlReorderMode) {
        // 絞り込み中は並び替えを自動的にオフにする
        isQlReorderMode = false;
        document.getElementById('qlToggleReorderBtn').style.color = '#b0b0b0';
    }
    renderQuestionList();
});

// ↑↓ボタン（並び替え）
document.getElementById('qlToggleReorderBtn').addEventListener('click', function() {
    if (isMistakeFilterMode) {
        alert('絞り込み中は並び替えできません。');
        return;
    }
    isQlReorderMode = !isQlReorderMode;
    this.style.color = isQlReorderMode ? '#85c1a5' : '#b0b0b0'; 
    renderQuestionList();
});

function renderQuestionList() {
    const listDiv = document.getElementById('qlList');
    listDiv.innerHTML = '';

    let displayWords = editingQuiz.words;
    
    // 絞り込みがオンの場合は間違えた問題だけにする
    if (isMistakeFilterMode) {
        displayWords = editingQuiz.words.filter(w => w.lastMistaked);
        if (displayWords.length === 0) {
            listDiv.innerHTML = '<p style="text-align:center; color:#888;">間違えた問題はありません。</p>';
            return;
        }
    }

    displayWords.forEach((w) => {
        // 全体のリストから元の問題番号を取得して表示する
        const originalIndex = editingQuiz.words.findIndex(orig => orig.id === w.id);

        const wrapper = document.createElement('div');
        wrapper.className = 'ql-item-wrapper';
        wrapper.dataset.id = w.id;

        const c = document.createElement('div');
        c.className = 'q-list-item';

        let innerHtml = `<span class="q-list-num">${originalIndex + 1}</span><span class="q-list-text">${w.q}</span><div class="q-list-div"></div><span class="q-list-text">${w.a.join(' ')}</span>`;
        
        if (isQlReorderMode) {
            innerHtml += `<div class="drag-handle">=</div>`;
            c.innerHTML = innerHtml;
            makeDraggable(c.querySelector('.drag-handle'), wrapper, listDiv, () => {
                updateOrderFromDOM('qlList', editingQuiz.words);
                renderQuestionList(); 
            });
        } else {
            innerHtml += `<button class="q-list-btn">></button>`;
            c.innerHTML = innerHtml;
            
            // スワイプで個別編集画面を開く
            setupSwipeToDelete(c, () => openSingleEdit(w));
            
            // 削除ボタンの作成
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '削除';
            deleteBtn.onclick = () => {
                if (confirm(`この問題を削除しますか？`)) {
                    // 全体から対象の問題を消す
                    editingQuiz.words = editingQuiz.words.filter(item => item.id !== w.id);
                    editingQuiz.rawText = rebuildRawText(editingQuiz.words);
                    saveQuizzesToStorage();
                    renderQuestionList();
                }
            };
            wrapper.appendChild(deleteBtn);
        }
        
        // wrapperにアイテムを格納してリストに追加
        wrapper.appendChild(c);
        listDiv.appendChild(wrapper);
    });
}

function openSingleEdit(word) {
    editingWordId = word.id;
    document.getElementById('singleQInput').value = word.q;
    document.getElementById('singleAInput').value = word.a.join(' ');
    showScreen('singleWordEditScreen');
}

document.getElementById('saveSingleEditBtn').addEventListener('click', () => {
    const q = document.getElementById('singleQInput').value.trim();
    const aRaw = document.getElementById('singleAInput').value.trim();
    
    if (!q || !aRaw) { 
        alert('問題と解答を入力してください。'); 
        return; 
    }
    
    if (q.includes(' ') || q.includes('　')) {
        alert('問題文にスペースは使用できません。');
        return;
    }
    
    const aArr = aRaw.split(/[ 　\t]+/);
    const target = editingQuiz.words.find(w => w.id === editingWordId);
    if (target) {
        target.q = q; target.a = aArr;
        editingQuiz.rawText = rebuildRawText(editingQuiz.words);
        saveQuizzesToStorage();
    }
    renderQuestionList();
    showScreen('questionListScreen');
});

document.getElementById('cancelSingleEditBtn').addEventListener('click', () => { showScreen('questionListScreen'); });

/* =========================================================================
   7. クイズ設定画面と進行処理（正誤判定、結果など）
========================================================================= */
function startQuizSettings(quiz) {
    editingQuiz = quiz;
    originalQuizWords = quiz.words;
    document.getElementById('quizTitle').textContent = quiz.title;
    
    updateSettingsUI();
    
    if (quiz.progress) document.getElementById('resumeArea').style.display = 'block';
    else document.getElementById('resumeArea').style.display = 'none';

    document.getElementById('modeSelectArea').style.display = 'block';
    document.getElementById('quizBoxArea').style.display = 'none';
    document.getElementById('quizControls').style.display = 'none';
    
    showScreen('quizScreen');
}

function updateSettingsUI() {
    document.getElementById('targetAllBtn').className = confTarget === 'all' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('targetMistakeBtn').className = confTarget === 'mistake' ? 'toggle-btn active' : 'toggle-btn';
    
    const mistakeCount = originalQuizWords.filter(w => w.lastMistaked).length;
    const tMistakeBtn = document.getElementById('targetMistakeBtn');
    
    tMistakeBtn.textContent = '間違えた問題';
    if (mistakeCount === 0) {
        tMistakeBtn.disabled = true;
        if (confTarget === 'mistake') { confTarget = 'all'; updateSettingsUI(); }
    } else {
        tMistakeBtn.disabled = false;
    }

    document.getElementById('orderSeqBtn').className = confOrder === 'seq' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('orderRandBtn').className = confOrder === 'rand' ? 'toggle-btn active' : 'toggle-btn';
}

document.getElementById('targetAllBtn').onclick = () => { confTarget = 'all'; updateSettingsUI(); };
document.getElementById('targetMistakeBtn').onclick = () => { confTarget = 'mistake'; updateSettingsUI(); };
document.getElementById('orderSeqBtn').onclick = () => { confOrder = 'seq'; updateSettingsUI(); };
document.getElementById('orderRandBtn').onclick = () => { confOrder = 'rand'; updateSettingsUI(); };

document.getElementById('resetMistakesBtn').onclick = () => {
    if (confirm('本当に間違えた問題の記録をリセットしますか？')) {
        editingQuiz.words.forEach(w => w.lastMistaked = false);
        saveQuizzesToStorage();
        updateSettingsUI();
    }
};

document.getElementById('cancelQuizBtn').onclick = () => { showScreen('homeScreen'); };

document.getElementById('startQuizBtn').onclick = () => {
    editingQuiz.progress = null; 
    let targetWords = confTarget === 'all' ? [...originalQuizWords] : originalQuizWords.filter(w => w.lastMistaked);
    if (confOrder === 'rand') targetWords = shuffleArray(targetWords);
    
    currentQuizData = targetWords;
    currentIndex = 0; mistakesThisRound = [];
    beginQuizUI();
};

document.getElementById('resumeQuizBtn').onclick = () => {
    const p = editingQuiz.progress;
    currentQuizData = p.quizDataIds.map(id => originalQuizWords.find(w => w.id === id)).filter(Boolean);
    currentIndex = p.nextIndex;
    mistakesThisRound = p.mistakesThisRound || [];
    beginQuizUI();
};

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function beginQuizUI() {
    document.getElementById('modeSelectArea').style.display = 'none';
    document.getElementById('quizBoxArea').style.display = 'block';
    document.getElementById('quizControls').style.display = 'flex';
    document.getElementById('mistakeContainer').style.display = 'none';
    document.getElementById('resultStats').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'block';
    document.getElementById('answerInput').style.display = 'block'; 
    document.getElementById('restartBtn').style.display = 'none';
    document.getElementById('endQuizBtn').style.display = 'block';
    document.getElementById('backBtn').style.display = 'none';
    
    const qEl = document.getElementById('question');
    qEl.style.fontSize = `${editingQuiz.fontSize || 30}px`;
    showQuestion();
}

function showQuestion() {
    isWaitingForNext = false; 
    document.getElementById('progressDisplay').textContent = `${currentIndex + 1} / ${currentQuizData.length}`;
    document.getElementById('question').textContent = currentQuizData[currentIndex].q;
    document.getElementById('answerInput').value = '';  
    document.getElementById('correctAnswerDisplay').textContent = ''; 
    document.getElementById('submitBtn').textContent = '答える';
    document.getElementById('answerInput').focus();
}

function saveProgress() {
    editingQuiz.progress = {
        quizDataIds: currentQuizData.map(w => w.id),
        nextIndex: currentIndex + 1, 
        mistakesThisRound: mistakesThisRound
    };
    saveQuizzesToStorage();
}

function checkAnswer() {
    if (isWaitingForNext) {
        currentIndex++;
        if (currentIndex < currentQuizData.length) showQuestion();
        else finishQuiz();
        return;
    }

    const input = document.getElementById('answerInput').value.trim();
    const currentWord = currentQuizData[currentIndex];
    const correctAnswers = currentWord.a; 
    const isCorrect = correctAnswers.includes(input);
    const overlay = document.getElementById('overlayMark');

    currentWord.lastMistaked = !isCorrect;
    
    if (isCorrect) {
        overlay.textContent = '◯';
        overlay.style.color = 'rgba(76, 175, 80, 0.4)'; overlay.style.fontSize = '300px';
        document.getElementById('correctAnswerDisplay').style.color = '#4CAF50';
    } else {
        overlay.textContent = '×';
        overlay.style.color = 'rgba(244, 67, 54, 0.4)'; overlay.style.fontSize = '600px'; 
        document.getElementById('correctAnswerDisplay').style.color = '#f44336';
        mistakesThisRound.push({ q: currentWord.q, a: correctAnswers.join(', ') });
    }
    
    overlay.classList.add('show-mark');
    clearTimeout(markTimeout);
    markTimeout = setTimeout(() => overlay.classList.remove('show-mark'), 1000);

    document.getElementById('correctAnswerDisplay').textContent = correctAnswers.join(', ');

    isWaitingForNext = true;
    document.getElementById('submitBtn').textContent = (currentIndex === currentQuizData.length - 1) ? '結果を見る' : '次へ';
    
    saveProgress();
    document.getElementById('answerInput').focus();
}

function finishQuiz() {
    const answeredCount = isWaitingForNext ? currentIndex + 1 : currentIndex;
    const isFullyCompleted = answeredCount >= currentQuizData.length;

    if (isFullyCompleted) {
        editingQuiz.progress = null; 
    } else {
        editingQuiz.progress = {
            quizDataIds: currentQuizData.map(w => w.id),
            nextIndex: answeredCount,
            mistakesThisRound: mistakesThisRound
        };
    }
    saveQuizzesToStorage();

    document.getElementById('question').textContent = '結果';  // 結果は問題文とは違うスタイルにしたい（問題文は''にする）
    document.getElementById('progressDisplay').textContent = '';
    
    const total = currentQuizData.length;
    const wrong = mistakesThisRound.length;
    const right = answeredCount - wrong;
  
    // 全${total}問を「結果」の下にグレーで表示したい
    document.getElementById('correctCountDisplay').textContent = `正解：${right} / ${answeredCount}`;
    document.getElementById('incorrectCountDisplay').textContent = `不正解：${wrong} / ${answeredCount}`;
    document.getElementById('resultStats').style.display = 'block';
    
    document.getElementById('answerInput').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('correctAnswerDisplay').textContent = '';
    document.getElementById('endQuizBtn').style.display = 'none';
    document.getElementById('restartBtn').style.display = 'block';
    document.getElementById('backBtn').style.display = 'block';

    renderMistakes();
}

function renderMistakes() {
    const c = document.getElementById('mistakeContainer');
    const l = document.getElementById('mistakeList');
    l.innerHTML = ''; 
    if (mistakesThisRound.length === 0) { c.style.display = 'none'; return; }
    c.style.display = 'block';
    mistakesThisRound.forEach(m => {
        l.innerHTML += `<div class="mistake-item"><span class="mistake-q">${m.q}</span><span class="mistake-a">${m.a}</span></div>`;
    });
}

document.getElementById('endQuizBtn').addEventListener('click', finishQuiz);
document.getElementById('submitBtn').addEventListener('mousedown', e => e.preventDefault());
document.getElementById('submitBtn').addEventListener('click', checkAnswer);
document.getElementById('answerInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); }});

document.getElementById('restartBtn').addEventListener('click', () => {
    editingQuiz.progress = null; 
    let targetWords = confTarget === 'all' ? [...originalQuizWords] : originalQuizWords.filter(w => w.lastMistaked);
    if (targetWords.length === 0) { alert('間違えた問題は0問です。'); startQuizSettings(editingQuiz); return; }
    if (confOrder === 'rand') targetWords = shuffleArray(targetWords);
    currentQuizData = targetWords;
    currentIndex = 0; mistakesThisRound = [];
    beginQuizUI();
});

document.getElementById('backBtn').addEventListener('click', () => {
    renderQuizList(); showScreen('homeScreen');
});

/* =========================================================================
   8. バックアップと復元
========================================================================= */
document.getElementById('menuBtn').addEventListener('click', () => { document.getElementById('menuModal').style.display = 'flex'; });
document.getElementById('closeMenuBtn').addEventListener('click', () => { document.getElementById('menuModal').style.display = 'none'; });

document.getElementById('exportBtn').addEventListener('click', () => {
    if (savedQuizzes.length === 0) { alert('保存するクイズがありません。'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(savedQuizzes, null, 2)], { type: 'application/json' }));
    a.download = 'my_quizzes_backup.json'; 
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
});

document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            if (Array.isArray(data) && confirm('現在のデータを上書きして復元しますか？')) {
                savedQuizzes = data; saveQuizzesToStorage(); renderQuizList();
                alert('復元しました！'); document.getElementById('menuModal').style.display = 'none';
            }
        } catch (err) { alert('ファイルの読み込みに失敗しました。'); }
    };
    reader.readAsText(file); e.target.value = '';
});