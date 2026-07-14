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

let selectedQuizIds = [];
let selectedWordIds = [];

let editingQuiz = null;
let editingWordId = null;
let tempRawText = "";
let currentTextAlign = 'center';

// 先回エラーが発生した行インデックスの保持用配列
let currentErrorLines = [];

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
            if (q.delimiter === undefined) q.delimiter = '';
            if (q.textAlign === undefined) q.textAlign = 'center';
            q.words.forEach(w => {
                if (!w.id) w.id = generateId();
                if (w.lastMistaked === undefined) w.lastMistaked = false;
            });
        });
    }
}

function parseRawText(text, delimiter) {
    const newWords = [];
    const lines = text.split('\n');
    let hasError = false;
    let errorLines = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line === '') continue;

        let parts;
        if (delimiter) {
            parts = line.split(delimiter);
        } else {
            parts = line.split(/[ \u3000\t]+/);
        }
       
        parts = parts.map(p => p.trim()).filter(p => p !== '');

        if (parts.length >= 2) {
            newWords.push({ id: generateId(), q: parts[0], a: parts.slice(1), lastMistaked: false });
        } else {
            hasError = true;
            errorLines.push(i);
        }
    }
    return { words: newWords, hasError, errorLines };
}

function rebuildRawText(words, delimiter) {
    const sep = delimiter ? delimiter : ' ';
    return words.map(w => `${w.q}${sep}${w.a.join(sep)}`).join('\n');
}

function showScreen(screenId) {
    ['homeScreen', 'editScreen', 'quizScreen', 'questionListScreen', 'singleWordEditScreen'].forEach(id => {
        document.getElementById(id).style.display = (id === screenId) ? 'block' : 'none';
    });
    if (screenId !== 'homeScreen') {
        isReorderMode = false;
        selectedQuizIds = [];
        document.getElementById('toggleReorderBtn').textContent = '編集';
        document.getElementById('homeActionBar').style.display = 'none';
    }
    if (screenId !== 'questionListScreen') {
        isQlReorderMode = false;
        selectedWordIds = [];
        document.getElementById('qlToggleReorderBtn').textContent = '編集';
        document.getElementById('qlActionBar').style.display = 'none';
        document.getElementById('qlSearchInput').value = ''; // 検索条件のクリア
    }
}

/* =========================================================================
   2. クイズ一覧画面の処理（ホーム画面）
========================================================================= */
document.getElementById('createNewBtn').addEventListener('click', function() {
    editingQuiz = null;
    tempRawText = "";
    currentErrorLines = [];
    document.getElementById('editTitle').value = '';
    document.getElementById('editDelimiter').value = '';
    document.getElementById('editFontSize').value = 30;
    document.getElementById('fontSizeDisplay').textContent = 30;
    currentTextAlign = 'center';
    updateAlignUI();
    showScreen('editScreen');
});

document.getElementById('toggleReorderBtn').addEventListener('click', function() {
    isReorderMode = !isReorderMode;
    selectedQuizIds = [];
    if (isReorderMode) {
        this.textContent = '完了';
        document.getElementById('homeActionBar').style.display = 'flex';
    } else {
        this.textContent = '編集';
        document.getElementById('homeActionBar').style.display = 'none';
    }
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

        if (isReorderMode) {
            container.classList.add('reorder-mode');
            const isSelected = selectedQuizIds.includes(quiz.id);
            playBtn.innerHTML = `
                <div class="select-btn-wrapper">
                    <div class="select-round-btn ${isSelected ? 'active' : ''}"></div>
                </div>
                <span class="quiz-title-text" style="padding-right: 50px;">${quiz.title}</span>
                <div class="drag-handle">=</div>
            `;
            playBtn.onclick = (e) => {
                if (e.target.classList.contains('drag-handle')) return;
                const idx = selectedQuizIds.indexOf(quiz.id);
                if (idx > -1) {
                    selectedQuizIds.splice(idx, 1);
                } else {
                    selectedQuizIds.push(quiz.id);
                }
                renderQuizList();
            };

            makeDraggable(playBtn.querySelector('.drag-handle'), container, listDiv, () => {
                updateOrderFromDOM('quizList', savedQuizzes);
            });
        } else {
            playBtn.innerHTML = `
                <span class="quiz-title-text" style="padding-right: 50px;">${quiz.title}</span>
                <span class="quiz-count-text">${quiz.words.length}問</span>
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

document.getElementById('bulkDeleteQuizBtn').onclick = () => {
    if (selectedQuizIds.length === 0) { alert('選択されていません。'); return; }
    if (confirm(`選択した ${selectedQuizIds.length} 件のクイズリストを削除しますか？`)) {
        savedQuizzes = savedQuizzes.filter(q => !selectedQuizIds.includes(q.id));
        saveQuizzesToStorage();
        selectedQuizIds = [];
        isReorderMode = false;
        document.getElementById('toggleReorderBtn').textContent = '編集';
        document.getElementById('homeActionBar').style.display = 'none';
        renderQuizList();
    }
};

document.getElementById('bulkCopyQuizBtn').onclick = () => {
    if (selectedQuizIds.length === 0) { alert('選択されていません。'); return; }
    
    selectedQuizIds.forEach(id => {
        const target = savedQuizzes.find(q => q.id === id);
        if (target) {
            const newQuiz = JSON.parse(JSON.stringify(target));
            newQuiz.id = generateId();
            newQuiz.title = newQuiz.title + " - コピー";
            newQuiz.progress = null;
            newQuiz.words.forEach(w => { w.id = generateId(); });
            savedQuizzes.unshift(newQuiz);
        }
    });
    saveQuizzesToStorage();
    selectedQuizIds = [];
    isReorderMode = false;
    document.getElementById('toggleReorderBtn').textContent = '編集';
    document.getElementById('homeActionBar').style.display = 'none';
    renderQuizList();
    alert('クイズリストを複製しました。');
};

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
    const newOrderIds = [...listDiv.querySelectorAll('.quiz-item-container, .ql-item-wrapper')].map(el => el.dataset.id);
    const newArr = [];
    newOrderIds.forEach(id => {
        const item = arrayRef.find(q => q.id === id);
        if (item) newArr.push(item);
    });
    if (arrayRef === savedQuizzes) { savedQuizzes = newArr; saveQuizzesToStorage(); }
    if (arrayRef === editingQuiz?.words) { editingQuiz.words = newArr; editingQuiz.rawText = rebuildRawText(newArr, editingQuiz.delimiter); saveQuizzesToStorage(); }
}

/* =========================================================================
   4. クイズ編集画面の処理
========================================================================= */
document.getElementById('editQuizBtn').addEventListener('click', function() {
    document.getElementById('editTitle').value = editingQuiz.title;
    document.getElementById('editDelimiter').value = editingQuiz.delimiter || '';
   
    const fSize = editingQuiz.fontSize || 30;
    document.getElementById('editFontSize').value = fSize;
    document.getElementById('fontSizeDisplay').textContent = fSize;
   
    currentTextAlign = editingQuiz.textAlign || 'center';
    updateAlignUI();
   
    tempRawText = editingQuiz.rawText || rebuildRawText(editingQuiz.words, editingQuiz.delimiter);
    currentErrorLines = []; // エラー状態の初期化
    showScreen('editScreen');
});

document.getElementById('editFontSize').addEventListener('input', function() { document.getElementById('fontSizeDisplay').textContent = this.value; });

document.getElementById('alignLeftBtn').onclick = () => { currentTextAlign = 'left'; updateAlignUI(); };
document.getElementById('alignCenterBtn').onclick = () => { currentTextAlign = 'center'; updateAlignUI(); };
document.getElementById('alignRightBtn').onclick = () => { currentTextAlign = 'right'; updateAlignUI(); };

function updateAlignUI() {
    document.getElementById('alignLeftBtn').classList.toggle('active', currentTextAlign === 'left');
    document.getElementById('alignCenterBtn').classList.toggle('active', currentTextAlign === 'center');
    document.getElementById('alignRightBtn').classList.toggle('active', currentTextAlign === 'right');
}

document.getElementById('saveEditBtn').addEventListener('click', function() {
    const titleInput = document.getElementById('editTitle').value;
    const finalTitle = titleInput !== '' ? titleInput : '無題のクイズ';
    const delimiterInput = document.getElementById('editDelimiter').value;
    const fSize = parseInt(document.getElementById('editFontSize').value, 10);
   
    // 「保存する」が押されたタイミングのみで厳格なエラー判定を行う
    const parsed = parseRawText(tempRawText, delimiterInput);
    if (parsed.hasError) { 
        alert('設定された区切り文字で区切られていない問題があります。'); 
        currentErrorLines = parsed.errorLines; // エラー行を記憶
        return; 
    }

    currentErrorLines = []; // エラーなし

    if (editingQuiz) {
        editingQuiz.title = finalTitle;
        editingQuiz.fontSize = fSize;
        editingQuiz.delimiter = delimiterInput;
        editingQuiz.textAlign = currentTextAlign;
       
        const oldWordsMap = {};
        editingQuiz.words.forEach(w => {
            const key = w.q + w.a.join('');
            if (!oldWordsMap[key]) oldWordsMap[key] = [];
            oldWordsMap[key].push(w);
        });
       
        editingQuiz.words = parsed.words.map(nw => {
            const key = nw.q + nw.a.join('');
            if (oldWordsMap[key] && oldWordsMap[key].length > 0) {
                const oldWord = oldWordsMap[key].shift();
                nw.id = oldWord.id;
                nw.lastMistaked = oldWord.lastMistaked;
            }
            return nw;
        });
        editingQuiz.rawText = rebuildRawText(editingQuiz.words, editingQuiz.delimiter);
        originalQuizWords = editingQuiz.words;
    } else {
        savedQuizzes.unshift({
            id: generateId(), title: finalTitle, rawText: tempRawText,
            words: parsed.words, fontSize: fSize, delimiter: delimiterInput, textAlign: currentTextAlign, progress: null
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

let scrollPosition = 0;

document.getElementById('openEditorBtn').addEventListener('click', () => {
    edTa.value = tempRawText;
    // 「編集する」ボタン展開時に、直前の保存試行で出たエラー行を赤色表示にする
    syncEditorBackground(currentErrorLines);
    document.getElementById('fullScreenEditor').style.display = 'flex';

    scrollPosition = window.pageYOffset;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollPosition}px`;
    document.body.style.width = '100%';
   
    edTa.scrollTop = 0;
    edBg.scrollTop = 0;
});

// 「<」ボタン押下時：エラー判定を一切行わず、入力内容を一時退避して元の画面に戻る
document.getElementById('cancelEditorBtn').addEventListener('click', () => {
    tempRawText = edTa.value; // 内容を一時退避
    document.getElementById('fullScreenEditor').style.display = 'none';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollPosition);
});

edTa.addEventListener('input', () => syncEditorBackground([])); // 入力中はエラーを一旦クリア
edTa.addEventListener('scroll', () => { edBg.scrollTop = edTa.scrollTop; edBg.scrollLeft = edTa.scrollLeft; });

edTa.addEventListener('input', adjustScrollToCursor);
edTa.addEventListener('click', adjustScrollToCursor);
edTa.addEventListener('keyup', adjustScrollToCursor);

function adjustScrollToCursor() {
    const cursorPos = edTa.selectionStart;
    const textBeforeCursor = edTa.value.substring(0, cursorPos);
    const currentLine = textBeforeCursor.split('\n').length;
    const cursorY = currentLine * 32;
    const visibleHeight = edTa.clientHeight;
    const currentScrollTop = edTa.scrollTop;

    if (cursorY > currentScrollTop + visibleHeight - 64) {
        edTa.scrollTop = cursorY - visibleHeight + 64;
    }
    else if (cursorY < currentScrollTop + 32) {
        edTa.scrollTop = cursorY - 32;
    }
}

function syncEditorBackground(errorLines = []) {
    let text = edTa.value;
   
    if (text === '') {
        edBg.innerHTML = '';
        edBg.scrollTop = 0;
        edBg.scrollLeft = 0;
        return;
    }

    const textLines = text.split('\n');
    let html = '';
   
    textLines.forEach((line, i) => {
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
   6. 問題一覧画面 ＆ 検索・一括操作
========================================================================= */
document.getElementById('openQuestionListBtn').addEventListener('click', () => {
    isMistakeFilterMode = false;
    isQlReorderMode = false;
    selectedWordIds = [];
    document.getElementById('qlFilterMistakeBtn').classList.remove('active');
    document.getElementById('qlToggleReorderBtn').textContent = '編集';
    document.getElementById('qlActionBar').style.display = 'none';
   
    renderQuestionList();
    showScreen('questionListScreen');
});

document.getElementById('qlHeaderBackBtn').addEventListener('click', () => {
    startQuizSettings(editingQuiz);
});

document.getElementById('qlFilterMistakeBtn').addEventListener('click', function() {
    isMistakeFilterMode = !isMistakeFilterMode;
    if (isMistakeFilterMode) {
        this.classList.add('active');
        if (isQlReorderMode) {
            isQlReorderMode = false;
            selectedWordIds = [];
            document.getElementById('qlToggleReorderBtn').textContent = '編集';
            document.getElementById('qlActionBar').style.display = 'none';
        }
    } else {
        this.classList.remove('active');
    }
    renderQuestionList();
});

document.getElementById('qlToggleReorderBtn').addEventListener('click', function() {
    if (isMistakeFilterMode) {
        alert('絞り込み中は編集できません。');
        return;
    }
    isQlReorderMode = !isQlReorderMode;
    selectedWordIds = [];
    if (isQlReorderMode) {
        this.textContent = '完了';
        document.getElementById('qlActionBar').style.display = 'flex';
    } else {
        this.textContent = '編集';
        document.getElementById('qlActionBar').style.display = 'none';
    }
    renderQuestionList();
});

function renderQuestionList() {
    const listDiv = document.getElementById('qlList');
    listDiv.innerHTML = '';

    let displayWords = editingQuiz.words;
   
    if (isMistakeFilterMode) {
        displayWords = displayWords.filter(w => w.lastMistaked);
    }
   
    if (displayWords.length === 0) {
        listDiv.innerHTML = '<p style="text-align:center; color:#888; margin-top: 20px;">該当する問題がありません。</p>';
        return;
    }

    displayWords.forEach((w) => {
        const originalIndex = editingQuiz.words.findIndex(orig => orig.id === w.id);

        const wrapper = document.createElement('div');
        wrapper.className = 'ql-item-wrapper';
        wrapper.dataset.id = w.id;

        const c = document.createElement('div');
        c.className = 'q-list-item';

        if (isQlReorderMode) {
            const isSelected = selectedWordIds.includes(w.id);
            c.innerHTML = `
                <div class="select-btn-wrapper">
                    <div class="select-round-btn ${isSelected ? 'active' : ''}"></div>
                </div>
                <span class="q-list-text q-text-q">${w.q.replace(/\\n|¥n/g, '<br>')}</span>
                <div class="q-list-div"></div>
                <span class="q-list-text q-text-a">${w.a.join(' ')}</span>
                <div class="drag-handle">=</div>
            `;

            c.onclick = (e) => {
                if (e.target.classList.contains('drag-handle')) return;
                const idx = selectedWordIds.indexOf(w.id);
                if (idx > -1) {
                    selectedWordIds.splice(idx, 1);
                } else {
                    selectedWordIds.push(w.id);
                }
                renderQuestionList();
            };

            makeDraggable(c.querySelector('.drag-handle'), wrapper, listDiv, () => {
                updateOrderFromDOM('qlList', editingQuiz.words);
                renderQuestionList();
            });
        } else {
            c.innerHTML = `
                <span class="q-list-num">${originalIndex + 1}</span>
                <span class="q-list-text q-text-q">${w.q.replace(/\\n|¥n/g, '<br>')}</span>
                <div class="q-list-div"></div>
                <span class="q-list-text q-text-a">${w.a.join(' ')}</span>
                <button class="q-list-btn">></button>
            `;
           
            setupSwipeToDelete(c, () => openSingleEdit(w));
           
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '削除';
            deleteBtn.onclick = () => {
                if (confirm(`この問題を削除しますか？`)) {
                    editingQuiz.words = editingQuiz.words.filter(item => item.id !== w.id);
                    editingQuiz.rawText = rebuildRawText(editingQuiz.words, editingQuiz.delimiter);
                    originalQuizWords = editingQuiz.words;
                    saveQuizzesToStorage();
                    renderQuestionList();
                    renderQuizList();
                }
            };
            wrapper.appendChild(deleteBtn);
        }
       
        wrapper.appendChild(c);
        listDiv.appendChild(wrapper);
    });
}

function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

function openSingleEdit(word) {
    editingWordId = word.id;
    const qInput = document.getElementById('singleQInput');
    const aInput = document.getElementById('singleAInput');
   
    qInput.value = word.q;
    const sep = editingQuiz.delimiter ? editingQuiz.delimiter : ' ';
    aInput.value = word.a.join(sep);
   
    showScreen('singleWordEditScreen');
   
    setTimeout(() => {
        autoResizeTextarea(qInput);
        autoResizeTextarea(aInput);
    }, 0);
}

document.getElementById('singleQInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); }
});

document.getElementById('singleAInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); }
});

document.getElementById('singleQInput').addEventListener('input', function() {
    if (/[\r\n]/.test(this.value)) { this.value = this.value.replace(/[\r\n]/g, ''); }
    autoResizeTextarea(this);

    if (!editingQuiz) return;
    const delim = editingQuiz.delimiter || '';
    if (delim) {
        if (this.value.includes(delim)) { this.value = this.value.split(delim).join(''); }
    } else {
        if (/[ \u3000\t]/.test(this.value)) { this.value = this.value.replace(/[ \u3000\t]/g, ''); }
    }
});

document.getElementById('singleAInput').addEventListener('input', function() {
    if (/[\r\n]/.test(this.value)) { this.value = this.value.replace(/[\r\n]/g, ''); }
    autoResizeTextarea(this);
});

document.getElementById('saveSingleEditBtn').addEventListener('click', () => {
    const q = document.getElementById('singleQInput').value.trim();
    const aRaw = document.getElementById('singleAInput').value.trim();
   
    if (!q || !aRaw) { alert('問題と解答を入力してください。'); return; }
   
    const delim = editingQuiz.delimiter || '';
   
    if (delim) {
        if (q.includes(delim)) { alert(`問題文に区切り文字「${delim}」は使用できません。`); return; }
    } else {
        if (/[ \u3000\t]/.test(q)) { alert('問題文に区切り文字（スペース）は使用できません。'); return; }
    }
   
    let aArr;
    if (delim) {
        aArr = aRaw.split(delim).map(s => s.trim()).filter(s => s !== '');
    } else {
        aArr = aRaw.split(/[ \u3000\t]+/).map(s => s.trim()).filter(s => s !== '');
    }

    const target = editingQuiz.words.find(w => w.id === editingWordId);
    if (target) {
        target.q = q; target.a = aArr;
        editingQuiz.rawText = rebuildRawText(editingQuiz.words, editingQuiz.delimiter);
        originalQuizWords = editingQuiz.words;
        saveQuizzesToStorage();
        renderQuizList();
    }
    renderQuestionList();
    showScreen('questionListScreen');
});

document.getElementById('cancelSingleEditBtn').addEventListener('click', () => { showScreen('questionListScreen'); });

document.getElementById('bulkDeleteWordBtn').onclick = () => {
    if (selectedWordIds.length === 0) { alert('選択されていません。'); return; }
    if (confirm(`選択した ${selectedWordIds.length} 問の問題を削除しますか？`)) {
        editingQuiz.words = editingQuiz.words.filter(w => !selectedWordIds.includes(w.id));
        editingQuiz.rawText = rebuildRawText(editingQuiz.words, editingQuiz.delimiter);
        originalQuizWords = editingQuiz.words;
        saveQuizzesToStorage();
        renderQuizList();
       
        selectedWordIds = [];
        isQlReorderMode = false;
        document.getElementById('qlToggleReorderBtn').textContent = '編集';
        document.getElementById('qlActionBar').style.display = 'none';
        renderQuestionList();
    }
};

let currentBulkMode = '';
document.getElementById('bulkMoveWordBtn').onclick = () => {
    if (selectedWordIds.length === 0) { alert('選択されていません。'); return; }
    currentBulkMode = 'move';
    openMoveModal();
};

document.getElementById('bulkCopyMoveWordBtn').onclick = () => {
    if (selectedWordIds.length === 0) { alert('選択されていません。'); return; }
    currentBulkMode = 'copymove';
    openMoveModal();
};

function openMoveModal() {
    const modal = document.getElementById('moveModal');
    const targetList = document.getElementById('moveTargetList');
    targetList.innerHTML = '';
   
    savedQuizzes.forEach(quiz => {
        if (currentBulkMode === 'move' && quiz.id === editingQuiz.id) return;
       
        const targetDelim = quiz.delimiter || '';
        const currentDelim = editingQuiz.delimiter || '';
        if (targetDelim !== currentDelim) return;

        const btn = document.createElement('button');
        btn.className = 'move-target-item-btn';
        btn.textContent = quiz.title;
        btn.onclick = () => { executeBulkMove(quiz.id); };
        targetList.appendChild(btn);
    });

    if(targetList.innerHTML === '') {
        targetList.innerHTML = '<p style="color:#888; text-align:center; font-size:14px;">移動可能なクイズリストがありません。</p>';
    }
    modal.style.display = 'flex';
}

document.getElementById('closeMoveModalBtn').onclick = () => {
    document.getElementById('moveModal').style.display = 'none';
};

function executeBulkMove(targetQuizId) {
    const targetQuiz = savedQuizzes.find(q => q.id === targetQuizId);
    if (!targetQuiz) return;

    const movingWords = editingQuiz.words.filter(w => selectedWordIds.includes(w.id));

    movingWords.forEach(w => {
        if (currentBulkMode === 'copymove') {
            targetQuiz.words.push({
                id: generateId(), q: w.q, a: [...w.a], lastMistaked: false
            });
        } else {
            targetQuiz.words.push(w);
        }
    });

    targetQuiz.rawText = rebuildRawText(targetQuiz.words, targetQuiz.delimiter);

    if (currentBulkMode === 'move') {
        editingQuiz.words = editingQuiz.words.filter(w => !selectedWordIds.includes(w.id));
        editingQuiz.rawText = rebuildRawText(editingQuiz.words, editingQuiz.delimiter);
    }

    originalQuizWords = editingQuiz.words;
    saveQuizzesToStorage();
    renderQuizList();

    document.getElementById('moveModal').style.display = 'none';
   
    selectedWordIds = [];
    isQlReorderMode = false;
    document.getElementById('qlToggleReorderBtn').textContent = '編集';
    document.getElementById('qlActionBar').style.display = 'none';
   
    renderQuestionList();
    alert('処理が完了しました。');
}

/* =========================================================================
   7. クイズ設定画面と進行処理
========================================================================= */
function startQuizSettings(quiz) {
    editingQuiz = quiz;
    originalQuizWords = quiz.words;
    document.getElementById('quizTitle').textContent = quiz.title;
   
    updateSettingsUI();
   
    if (quiz.progress && quiz.words.length > 0) {
        document.getElementById('resumeArea').style.display = 'block';
    } else {
        document.getElementById('resumeArea').style.display = 'none';
    }

    const quizBox = document.getElementById('quizBoxArea');
    const mistakeContainer = document.getElementById('mistakeContainer');
    quizBox.appendChild(mistakeContainer);
    mistakeContainer.style.display = 'none';

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

    const startBtn = document.getElementById('startQuizBtn');
    if (originalQuizWords.length === 0) {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        startBtn.style.cursor = 'not-allowed';
    } else {
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
    }

    document.getElementById('orderSeqBtn').className = confOrder === 'seq' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('orderRandBtn').className = confOrder === 'rand' ? 'toggle-btn active' : 'toggle-btn';
}

document.getElementById('targetAllBtn').onclick = () => { confTarget = 'all'; updateSettingsUI(); };
document.getElementById('targetMistakeBtn').onclick = () => { confTarget = 'mistake'; updateSettingsUI(); };
document.getElementById('orderSeqBtn').onclick = () => { confOrder = 'seq'; updateSettingsUI(); };
document.getElementById('orderRandBtn').onclick = () => { confOrder = 'rand'; updateSettingsUI(); };

document.getElementById('resetMistakesBtn').onclick = () => {
    if (confirm('間違えた問題の記録をリセットしますか？')) {
        editingQuiz.words.forEach(w => w.lastMistaked = false);
        saveQuizzesToStorage();
        updateSettingsUI();
    }
};

document.getElementById('cancelQuizBtn').onclick = () => {
    renderQuizList();
    showScreen('homeScreen');
};

document.getElementById('startQuizBtn').onclick = () => {
    if (originalQuizWords.length === 0) return;

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
    if(currentQuizData.length === 0) {
        alert('再開するデータがありません。');
        return;
    }
    currentIndex = p.nextIndex;
    mistakesThisRound = p.mistakesThisRound || [];
    beginQuizUI();
};

function beginQuizUI() {
    document.getElementById('modeSelectArea').style.display = 'none';
    document.getElementById('quizBoxArea').style.display = 'block';
    document.getElementById('quizControls').style.display = 'flex';
    document.getElementById('mistakeContainer').style.display = 'none';
    document.getElementById('resultStats').style.display = 'none';
   
    document.getElementById('question').style.display = 'block';
    document.getElementById('resultHeader').style.display = 'none';
    document.getElementById('resultTotalCountDisplay').style.display = 'none';
   
    const quizBox = document.getElementById('quizBoxArea');
    const mistakeContainer = document.getElementById('mistakeContainer');
    quizBox.appendChild(mistakeContainer);

    document.getElementById('submitBtn').style.display = 'block';
    document.getElementById('answerInput').style.display = 'block';
    document.getElementById('restartBtn').style.display = 'none';
    document.getElementById('endQuizBtn').style.display = 'block';
    document.getElementById('backBtn').style.display = 'none';
   
    const qEl = document.getElementById('question');
    qEl.style.fontSize = `${editingQuiz.fontSize || 30}px`;
    qEl.style.textAlign = editingQuiz.textAlign || 'center';
    showQuestion();
}

function showQuestion() {
    isWaitingForNext = false;
    document.getElementById('progressDisplay').textContent = `${currentIndex + 1} / ${currentQuizData.length}`;
   
    const qText = currentQuizData[currentIndex].q.replace(/\\n/g, '\n');
    document.getElementById('question').innerText = qText;
   
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
    const answeredCount = Math.min(isWaitingForNext ? currentIndex + 1 : currentIndex, currentQuizData.length);
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

    document.getElementById('question').style.display = 'none';
    document.getElementById('resultHeader').style.display = 'block';
    document.getElementById('resultTotalCountDisplay').style.display = 'block';
    document.getElementById('resultTotalCountDisplay').textContent = `全${currentQuizData.length}問`;
   
    document.getElementById('progressDisplay').textContent = '';
   
    const wrong = mistakesThisRound.length;
    const right = answeredCount - wrong;
 
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

    const mistakeContainer = document.getElementById('mistakeContainer');
    if (mistakesThisRound.length > 0) {
        const quizScreen = document.getElementById('quizScreen');
        quizScreen.appendChild(mistakeContainer);
    }
}

function renderMistakes() {
    const c = document.getElementById('mistakeContainer');
    const l = document.getElementById('mistakeList');
    l.innerHTML = '';
    if (mistakesThisRound.length === 0) { c.style.display = 'none'; return; }
    c.style.display = 'block';
    mistakesThisRound.forEach(m => {
        const safeQ = m.q.replace(/\\n|¥n/g, '<br>');
        l.innerHTML += `<div class="mistake-item"><span class="mistake-q">${safeQ}</span><span class="mistake-a">${m.a}</span></div>`;
    });
}

document.getElementById('endQuizBtn').addEventListener('click', finishQuiz);
document.getElementById('submitBtn').addEventListener('mousedown', e => e.preventDefault());
document.getElementById('submitBtn').addEventListener('click', checkAnswer);
document.getElementById('answerInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); }});

document.getElementById('restartBtn').addEventListener('click', () => {
    editingQuiz.progress = null;
    let targetWords = confTarget === 'all' ? [...originalQuizWords] : originalQuizWords.filter(w => w.lastMistaked);
    if (targetWords.length === 0) { alert('間違えた問題がありません。'); startQuizSettings(editingQuiz); return; }
    if (confOrder === 'rand') targetWords = shuffleArray(targetWords);
    currentQuizData = targetWords;
    currentIndex = 0; mistakesThisRound = [];
    beginQuizUI();
});

document.getElementById('backBtn').addEventListener('click', () => {
    renderQuizList(); showScreen('homeScreen');
});

/* =========================================================================
   8. メニュー画面制御
========================================================================= */
document.getElementById('menuBtn').addEventListener('click', () => { document.getElementById('menuModal').style.display = 'block'; });
document.getElementById('closeMenuBtn').addEventListener('click', () => { document.getElementById('menuModal').style.display = 'none'; });

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}