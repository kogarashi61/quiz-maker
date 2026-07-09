let savedQuizzes = []; 
let currentQuizData = [];
let originalQuizWords = []; 
let currentMode = 'sequential'; 
let currentIndex = 0;

let isWaitingForNext = false; 
let markTimeout; 
let mistakes = []; 
let isReorderMode = false; 

let editingQuiz = null; 

window.onload = function() {
    loadQuizzesFromStorage();
    renderQuizList();
};

function saveQuizzesToStorage() {
    localStorage.setItem('myQuizSets', JSON.stringify(savedQuizzes));
}

function loadQuizzesFromStorage() {
    const data = localStorage.getItem('myQuizSets');
    if (data) {
        savedQuizzes = JSON.parse(data);
    }
}

function parseRawText(text) {
    const newWords = [];
    const lines = text.split('\n');

    for (let line of lines) {
        line = line.trim();
        if (line === '') continue;

        const parts = line.split(/[ 　\t]+/);
        if (parts.length >= 2) {
            const q = parts[0];
            const a = parts.slice(1); 
            newWords.push({ q: q, a: a });
        }
    }
    return newWords;
}

document.getElementById('createNewBtn').addEventListener('click', function() {
    editingQuiz = null; 
    document.getElementById('homeScreen').style.display = 'none';
    document.getElementById('editScreen').style.display = 'block';
    
    document.getElementById('editTitle').value = '';
    document.getElementById('editTextarea').value = '';
    
    document.getElementById('editFontSize').value = 30;
    document.getElementById('fontSizeDisplay').textContent = 30;
});

document.getElementById('editQuizBtn').addEventListener('click', function() {
    document.getElementById('quizScreen').style.display = 'none';
    document.getElementById('editScreen').style.display = 'block';
    
    document.getElementById('editTitle').value = editingQuiz.title;
    
    const fSize = editingQuiz.fontSize || 30;
    document.getElementById('editFontSize').value = fSize;
    document.getElementById('fontSizeDisplay').textContent = fSize;
    
    if (editingQuiz.rawText) {
        document.getElementById('editTextarea').value = editingQuiz.rawText;
    } else {
        const text = editingQuiz.words.map(w => `${w.q}　${w.a.join(' ')}`).join('\n');
        document.getElementById('editTextarea').value = text;
    }
});

document.getElementById('editFontSize').addEventListener('input', function() {
    document.getElementById('fontSizeDisplay').textContent = this.value;
});

document.getElementById('saveEditBtn').addEventListener('click', function() {
    const titleInput = document.getElementById('editTitle').value;
    const rawText = document.getElementById('editTextarea').value;
    const parsedWords = parseRawText(rawText);
    const fontSizeVal = parseInt(document.getElementById('editFontSize').value, 10);

    if (parsedWords.length === 0) {
        alert('問題が正しく入力されていません。問題と解答がスペースで区切られているか確認してください。');
        return;
    }

    const finalTitle = titleInput !== '' ? titleInput : '無題のクイズ';

    if (editingQuiz) {
        const quizIndex = savedQuizzes.findIndex(q => q.id === editingQuiz.id);
        if (quizIndex !== -1) {
            savedQuizzes[quizIndex].title = finalTitle;
            savedQuizzes[quizIndex].rawText = rawText; 
            savedQuizzes[quizIndex].words = parsedWords;
            savedQuizzes[quizIndex].fontSize = fontSizeVal;
        }
    } else {
        savedQuizzes.unshift({
            id: Date.now().toString(),
            title: finalTitle,
            rawText: rawText,
            words: parsedWords,
            fontSize: fontSizeVal
        });
    }

    saveQuizzesToStorage();
    renderQuizList();
    
    document.getElementById('editScreen').style.display = 'none';
    document.getElementById('homeScreen').style.display = 'block';
    window.scrollTo(0, 0);
});

document.getElementById('cancelEditBtn').addEventListener('click', function() {
    document.getElementById('editScreen').style.display = 'none';
    
    if (editingQuiz) {
        document.getElementById('quizScreen').style.display = 'block';
    } else {
        document.getElementById('homeScreen').style.display = 'block';
    }
});

// 並び替え
document.getElementById('toggleReorderBtn').addEventListener('click', function() {
    isReorderMode = !isReorderMode;
    this.textContent = isReorderMode ? '完了' : '↑↓';
    this.style.backgroundColor = isReorderMode ? '#85c1a5' : '#f7f7f7';
    this.style.color = isReorderMode ? '#ffffff' : '#b0b0b0';
    renderQuizList();
});

function updateOrderFromDOM() {
    const listDiv = document.getElementById('quizList');
    const newOrderIds = [...listDiv.querySelectorAll('.quiz-item-container')].map(el => el.dataset.id);
    const newSavedQuizzes = [];
    newOrderIds.forEach(id => {
        const q = savedQuizzes.find(quiz => quiz.id === id);
        if (q) newSavedQuizzes.push(q);
    });
    savedQuizzes = newSavedQuizzes;
    saveQuizzesToStorage();
}

function makeDraggable(handle, container) {
    let startY = 0;
    let initialTop = 0;
    let placeholder = null;
    let scrollInterval = null;
    let currentClientY = 0;

    const stopScroll = () => {
        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = null;
        }
    };

    const checkCollision = () => {
        const listDiv = document.getElementById('quizList');
        const items = [...listDiv.querySelectorAll('.quiz-item-container:not(.placeholder)')];
        
        items.forEach(item => {
            if (item === container) return;
            const itemRect = item.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            if (containerRect.top + containerRect.height/2 > itemRect.top && 
                containerRect.top < itemRect.top + itemRect.height/2) {
                
                if (placeholder.nextSibling === item) {
                    listDiv.insertBefore(item, placeholder);
                } else {
                    listDiv.insertBefore(placeholder, item);
                }
            }
        });
    };

    const onStart = (e) => {
        if (e.type === 'touchstart') e.preventDefault(); 
        // 画面に追従させる
        currentClientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        startY = currentClientY;
        
        const rect = container.getBoundingClientRect();
        
        placeholder = document.createElement('div');
        placeholder.className = 'quiz-item-container placeholder';
        placeholder.style.height = `${rect.height}px`;
        placeholder.style.margin = '0';
        
        container.parentNode.insertBefore(placeholder, container);
        
        container.style.position = 'fixed';
        container.style.zIndex = '1000';
        container.style.width = `${rect.width}px`;
        container.style.boxSizing = 'border-box';
        container.style.opacity = '0.9';
        container.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
        
        container.style.top = `${rect.top}px`;
        container.style.left = `${rect.left}px`;
        initialTop = rect.top;

        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    };

    const onMove = (e) => {
        e.preventDefault();
        currentClientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        const diff = currentClientY - startY;
        container.style.top = `${initialTop + diff}px`;

        checkCollision();

        // 画面端の自動スクロール判定
        const scrollThreshold = 80;
        if (currentClientY < scrollThreshold) {
            if (!scrollInterval) {
                scrollInterval = setInterval(() => {
                    window.scrollBy(0, -10);
                    checkCollision();
                }, 20);
            }
        } else if (window.innerHeight - currentClientY < scrollThreshold) {
            if (!scrollInterval) {
                scrollInterval = setInterval(() => {
                    window.scrollBy(0, 10);
                    checkCollision();
                }, 20);
            }
        } else {
            stopScroll();
        }
    };

    const onEnd = () => {
        stopScroll();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchend', onEnd);
        
        container.style.position = '';
        container.style.zIndex = '';
        container.style.top = '';
        container.style.left = '';
        container.style.width = '';
        container.style.opacity = '';
        container.style.boxShadow = '';
        
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(container, placeholder);
            placeholder.parentNode.removeChild(placeholder);
        }
        updateOrderFromDOM();
    };

    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
}

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
        
        let displayTitle = quiz.title;
        if (displayTitle.length >= 16) {
            displayTitle = displayTitle.substring(0, 15) + '…';
        }

        if (isReorderMode) {
            playBtn.innerHTML = `
                <span style="flex-grow: 1; text-align: left; white-space: pre; padding-right: 60px;">${displayTitle}</span>
                <span style="color: #aaa; font-weight: normal; font-size: 14px; position: absolute; right: 15px; top: 50%; transform: translateY(-50%);">${quiz.words.length}問</span>
                <div class="drag-handle" style="color: #ccc; font-size: 24px; position: absolute; right: 0; top: 0; bottom: 0; width: 60px; display: flex; align-items: center; justify-content: center; background-color: #ffffff; z-index: 10; cursor: grab;">=</div>
            `;
            const dragHandle = playBtn.querySelector('.drag-handle');
            makeDraggable(dragHandle, container);
        } else {
            playBtn.innerHTML = `
                <span style="flex-grow: 1; text-align: left; white-space: pre;">${displayTitle}</span>
                <span style="color: #aaa; font-weight: normal; font-size: 14px;">${quiz.words.length}問</span>
            `;

            let startX = 0;
            let currentX = 0;
            let isRevealed = false; 
            let isMoved = false;    

            const handleStart = (e) => {
                startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
                currentX = startX;
                isMoved = false;
            };

            const handleMove = (e) => {
                if (startX === 0) return;
                currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
                const diff = currentX - startX;

                if (Math.abs(diff) > 10) {
                    isMoved = true;
                }

                if (isRevealed && diff > 0 && diff < 80) {
                    playBtn.style.transform = `translateX(${diff - 80}px)`;
                } else if (!isRevealed && diff < 0 && diff > -80) {
                    playBtn.style.transform = `translateX(${diff}px)`;
                }
            };

            const handleEnd = (e) => {
                if (startX === 0) return;
                const diff = currentX - startX;

                if (!isRevealed && diff < -30) {
                    playBtn.style.transform = 'translateX(-80px)';
                    isRevealed = true;
                } else if (isRevealed && diff > 30) {
                    playBtn.style.transform = 'translateX(0px)';
                    isRevealed = false;
                } else {
                    playBtn.style.transform = isRevealed ? 'translateX(-80px)' : 'translateX(0px)';
                }
                startX = 0; 
            };

            playBtn.addEventListener('mousedown', handleStart);
            playBtn.addEventListener('mousemove', handleMove);
            playBtn.addEventListener('mouseup', handleEnd);
            playBtn.addEventListener('mouseleave', handleEnd);
            
            playBtn.addEventListener('touchstart', handleStart, { passive: true });
            playBtn.addEventListener('touchmove', handleMove, { passive: true });
            playBtn.addEventListener('touchend', handleEnd);
            playBtn.addEventListener('touchcancel', handleEnd);

            playBtn.onclick = (e) => {
                if (isMoved) return;
                
                if (isRevealed) {
                    playBtn.style.transform = 'translateX(0px)';
                    isRevealed = false;
                    return;
                }
                startQuiz(quiz);
            };
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '削除';
        deleteBtn.onclick = () => deleteQuiz(quiz.id, quiz.title);

        container.appendChild(playBtn);
        if (!isReorderMode) {
            container.appendChild(deleteBtn);
        }
        listDiv.appendChild(container);
    });
}

function deleteQuiz(id, title) {
    if (confirm(`クイズ「${title}」を削除してもよろしいですか？`)) {
        savedQuizzes = savedQuizzes.filter(quiz => quiz.id !== id);
        saveQuizzesToStorage();
        renderQuizList();
    }
}

function startQuiz(quiz) {
    editingQuiz = quiz; 
    originalQuizWords = quiz.words; 
    
    document.getElementById('quizTitle').textContent = quiz.title;
    document.getElementById('homeScreen').style.display = 'none';
    document.getElementById('quizScreen').style.display = 'block';
    
    document.getElementById('modeSelectArea').style.display = 'block';
    document.getElementById('quizBoxArea').style.display = 'none';
    document.getElementById('quizControls').style.display = 'none';
}

document.getElementById('startSequentialBtn').addEventListener('click', function() {
    currentMode = 'sequential';
    currentQuizData = [...originalQuizWords]; 
    beginQuiz();
});

document.getElementById('startRandomBtn').addEventListener('click', function() {
    currentMode = 'random';
    currentQuizData = shuffleArray([...originalQuizWords]); 
    beginQuiz();
});

document.getElementById('cancelQuizBtn').addEventListener('click', function() {
    document.getElementById('quizScreen').style.display = 'none';
    document.getElementById('homeScreen').style.display = 'block';
});

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function beginQuiz() {
    mistakes = [];
    document.getElementById('mistakeContainer').style.display = 'none';

    document.getElementById('modeSelectArea').style.display = 'none';
    document.getElementById('quizBoxArea').style.display = 'block';
    
    const quizBox = document.getElementById('quizBoxArea');
    quizBox.style.padding = '30px';
    const questionEl = document.getElementById('question');
    
    const fSize = editingQuiz.fontSize || 30;
    questionEl.style.fontSize = `${fSize}px`;
    questionEl.style.marginTop = '10px';
    questionEl.style.marginBottom = '0px';
    questionEl.style.minHeight = '48px';
    
    document.getElementById('resultStats').style.marginBottom = '20px';

    document.getElementById('quizControls').style.display = 'flex';
    document.getElementById('resultStats').style.display = 'none';
    
    currentIndex = 0;
    document.getElementById('submitBtn').style.display = 'inline-block';
    document.getElementById('answerInput').style.display = 'block'; 
    document.getElementById('restartBtn').style.display = 'none';
    document.getElementById('endQuizBtn').style.display = 'block';
    document.getElementById('backBtn').style.display = 'none';
    
    showQuestion();
}

function showQuestion() {
    isWaitingForNext = false; 
    
    document.getElementById('progressDisplay').textContent = `${currentIndex + 1} / ${currentQuizData.length}`;
    document.getElementById('question').textContent = currentQuizData[currentIndex].q;
    
    const input = document.getElementById('answerInput');
    input.value = '';  
    document.getElementById('correctAnswerDisplay').textContent = ''; 
    document.getElementById('submitBtn').textContent = '答える';

    input.focus();
}

function checkAnswer() {
    if (isWaitingForNext) {
        currentIndex++;
        if (currentIndex < currentQuizData.length) {
            showQuestion();
        } else {
            finishQuiz();
        }
        return;
    }

    const input = document.getElementById('answerInput');
    const userAnswer = input.value.trim();
    
    const correctAnswers = currentQuizData[currentIndex].a; 
    const displayAnswer = correctAnswers.join(', '); 
    
    const overlay = document.getElementById('overlayMark');
    const isCorrect = correctAnswers.includes(userAnswer);

    if (isCorrect) {
        overlay.textContent = '◯';
        overlay.style.color = 'rgba(76, 175, 80, 0.4)'; 
        overlay.style.fontSize = '300px';
        overlay.style.transform = 'translate(-50%, -45%)'; 
        document.getElementById('correctAnswerDisplay').style.color = '#4CAF50';
    } else {
        overlay.textContent = '×';
        overlay.style.color = 'rgba(244, 67, 54, 0.4)';
        overlay.style.fontSize = '600px'; 
        overlay.style.transform = 'translate(-50%, -55%)'; 
        document.getElementById('correctAnswerDisplay').style.color = '#f44336';

        mistakes.push({
            q: currentQuizData[currentIndex].q,
            a: displayAnswer
        });
    }
    
    overlay.classList.add('show-mark');
    
    clearTimeout(markTimeout);
    markTimeout = setTimeout(() => {
        overlay.classList.remove('show-mark');
    }, 1000);

    document.getElementById('correctAnswerDisplay').textContent = displayAnswer;

    isWaitingForNext = true;
    
    if (currentIndex === currentQuizData.length - 1) {
        document.getElementById('submitBtn').textContent = '結果を見る';
    } else {
        document.getElementById('submitBtn').textContent = '次へ';
    }

    input.focus();
}

function renderMistakes() {
    const container = document.getElementById('mistakeContainer');
    const listDiv = document.getElementById('mistakeList');
    
    container.style.display = 'block'; 
    listDiv.innerHTML = ''; 
    
    if (mistakes.length === 0) {
        return;
    }
    
    mistakes.forEach(mistake => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'mistake-item';
        
        const qSpan = document.createElement('span');
        qSpan.className = 'mistake-q';
        qSpan.textContent = mistake.q;
        
        const aSpan = document.createElement('span');
        aSpan.className = 'mistake-a';
        aSpan.textContent = mistake.a;
        
        itemDiv.appendChild(qSpan);
        itemDiv.appendChild(aSpan);
        listDiv.appendChild(itemDiv);
    });
}

// 結果画面
function finishQuiz() {
    renderMistakes(); 

    const questionEl = document.getElementById('question');
    questionEl.textContent = '結果';
    questionEl.style.fontSize = '24px'; 
    questionEl.style.marginBottom = '14px';
    questionEl.style.marginTop = '0px';
    questionEl.style.minHeight = 'auto';
    
    const quizBox = document.getElementById('quizBoxArea');
    quizBox.style.padding = '6px 30px 26px'; 
    
    document.getElementById('progressDisplay').textContent = '';
    
    const total = currentQuizData.length;
    const wrong = mistakes.length;
    
    // 正解数の計算
    const answeredCount = Math.min(isWaitingForNext ? currentIndex + 1 : currentIndex, total);
    const right = answeredCount - wrong;
    document.getElementById('correctCountDisplay').textContent = `正解：${right}/${total}`;
    document.getElementById('incorrectCountDisplay').textContent = `不正解：${wrong}/${total}`;
    document.getElementById('resultStats').style.display = 'block';
    document.getElementById('resultStats').style.marginBottom = '-5px'; 
    
    const input = document.getElementById('answerInput');
    input.style.display = 'none';
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('correctAnswerDisplay').textContent = '';
    document.getElementById('endQuizBtn').style.display = 'none';
    document.getElementById('restartBtn').style.display = 'block';
    document.getElementById('backBtn').style.display = 'block';
    
    const mistakeContainer = document.getElementById('mistakeContainer');
    mistakeContainer.style.marginTop = '0px'; 
    mistakeContainer.style.paddingTop = '10px';
}

document.getElementById('endQuizBtn').addEventListener('click', function() {
    finishQuiz();
});

document.getElementById('submitBtn').addEventListener('mousedown', function(event) {
    event.preventDefault(); 
});

document.getElementById('submitBtn').addEventListener('click', checkAnswer);

document.getElementById('answerInput').addEventListener('keydown', function(event) {
    // 判定後、Enter以外のキー入力をキャンセルする
    if (isWaitingForNext && event.key !== 'Enter') {
        event.preventDefault();
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault(); 
        checkAnswer();
    }
});

document.getElementById('answerInput').addEventListener('input', function(event) {
    if (isWaitingForNext) {
        this.value = ''; // 文字が入っても即座に消去する
    }
});


document.getElementById('restartBtn').addEventListener('click', function() {
    mistakes = [];
    document.getElementById('mistakeContainer').style.display = 'none';

    if (currentMode === 'random') {
        currentQuizData = shuffleArray([...originalQuizWords]); 
    }
    
    currentIndex = 0;
    document.getElementById('resultStats').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'inline-block';
    document.getElementById('answerInput').style.display = 'block';
    document.getElementById('restartBtn').style.display = 'none';
    document.getElementById('endQuizBtn').style.display = 'block';
    document.getElementById('backBtn').style.display = 'none';
    
    const quizBox = document.getElementById('quizBoxArea');
    quizBox.style.padding = '30px';
    const questionEl = document.getElementById('question');
    const fSize = editingQuiz.fontSize || 30;
    questionEl.style.fontSize = `${fSize}px`;
    questionEl.style.marginTop = '5px';
    questionEl.style.marginBottom = '5px';
    questionEl.style.minHeight = '48px';
    document.getElementById('resultStats').style.marginBottom = '20px';
    
    showQuestion();
});

document.getElementById('backBtn').addEventListener('click', function() {
    document.getElementById('quizScreen').style.display = 'none';
    document.getElementById('homeScreen').style.display = 'block';
    renderQuizList();
});

// メニュー・バックアップ機能
document.getElementById('menuBtn').addEventListener('click', function() {
    document.getElementById('menuModal').style.display = 'flex';
    // 裏側のスクロールを防止
    document.body.style.overflow = 'hidden';
});

document.getElementById('closeMenuBtn').addEventListener('click', function() {
    document.getElementById('menuModal').style.display = 'none';
    // スクロール防止を解除
    document.body.style.overflow = '';
});

document.getElementById('exportBtn').addEventListener('click', function() {
    if (savedQuizzes.length === 0) {
        alert('保存するクイズがありません。');
        return;
    }
    const dataStr = JSON.stringify(savedQuizzes, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my_quizzes_backup.json'; 
    
    document.body.appendChild(a);
    a.click(); 
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

document.getElementById('importBtn').addEventListener('click', function() {
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (Array.isArray(importedData)) {
                if (confirm('現在のデータを上書きして復元しますか？\n（今のクイズは消え、バックアップファイルの内容になります）')) {
                    savedQuizzes = importedData;
                    saveQuizzesToStorage(); 
                    renderQuizList(); 
                    alert('データの復元が完了しました！');
                    document.getElementById('menuModal').style.display = 'none';
                    document.body.style.overflow = ''; // スクロール防止を解除
                }
            } else {
                alert('ファイルの形式が正しくありません。');
            }
        } catch (error) {
            alert('ファイルの読み込みに失敗しました。対応していないファイルかもしれません。');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
});
