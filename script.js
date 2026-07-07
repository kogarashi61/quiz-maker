let savedQuizzes = []; 
let currentQuizData = [];
let originalQuizWords = []; 
let currentMode = 'sequential'; 
let currentIndex = 0;

let isWaitingForNext = false; 
let markTimeout; 
let mistakes = []; 

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

// 【変更点1】別解を配列として取得するように修正
function parseRawText(text) {
    const newWords = [];
    const lines = text.split('\n');

    for (let line of lines) {
        line = line.trim();
        if (line === '') continue;

        // スペースやタブで区切る
        const parts = line.split(/[ 　\t]+/);
        if (parts.length >= 2) {
            const q = parts[0];
            // 2番目以降の要素をすべて「正解の配列」として扱う
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
});

// 【変更点2】生テキストがない場合のフォールバックを配列対応に修正
document.getElementById('editQuizBtn').addEventListener('click', function() {
    document.getElementById('quizScreen').style.display = 'none';
    document.getElementById('editScreen').style.display = 'block';
    
    document.getElementById('editTitle').value = editingQuiz.title;
    
    if (editingQuiz.rawText) {
        document.getElementById('editTextarea').value = editingQuiz.rawText;
    } else {
        // 答えが配列になっているのでスペースで結合してテキストエリアに戻す
        const text = editingQuiz.words.map(w => `${w.q}　${w.a.join(' ')}`).join('\n');
        document.getElementById('editTextarea').value = text;
    }
});

document.getElementById('saveEditBtn').addEventListener('click', function() {
    const titleInput = document.getElementById('editTitle').value.trim();
    const rawText = document.getElementById('editTextarea').value;
    const parsedWords = parseRawText(rawText);

    if (parsedWords.length === 0) {
        alert('問題が正しく入力されていません。スペースで区切られているか確認してください。');
        return;
    }

    const finalTitle = titleInput !== '' ? titleInput : '無題のクイズ';

    if (editingQuiz) {
        const quizIndex = savedQuizzes.findIndex(q => q.id === editingQuiz.id);
        if (quizIndex !== -1) {
            savedQuizzes[quizIndex].title = finalTitle;
            savedQuizzes[quizIndex].rawText = rawText; 
            savedQuizzes[quizIndex].words = parsedWords;
        }
    } else {
        savedQuizzes.unshift({
            id: Date.now().toString(),
            title: finalTitle,
            rawText: rawText,
            words: parsedWords
        });
    }

    saveQuizzesToStorage();
    renderQuizList();
    
    document.getElementById('editScreen').style.display = 'none';
    document.getElementById('homeScreen').style.display = 'block';
});

document.getElementById('cancelEditBtn').addEventListener('click', function() {
    document.getElementById('editScreen').style.display = 'none';
    
    if (editingQuiz) {
        document.getElementById('quizScreen').style.display = 'block';
    } else {
        document.getElementById('homeScreen').style.display = 'block';
    }
});

function renderQuizList() {
    const listDiv = document.getElementById('quizList');
    listDiv.innerHTML = ''; 

    if (savedQuizzes.length === 0) {
        listDiv.innerHTML = '<p style="text-align:center; color:#888;">クイズがありません。<br>上のボタンから作成してください。</p>';
        return;
    }

    savedQuizzes.forEach(quiz => {
        const container = document.createElement('div');
        container.className = 'quiz-item-container';

        const playBtn = document.createElement('button');
        playBtn.className = 'quiz-item-btn';
        playBtn.innerHTML = `<span>${quiz.title}</span><span>${quiz.words.length}問</span>`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '削除';
        deleteBtn.onclick = () => deleteQuiz(quiz.id, quiz.title);

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

        container.appendChild(playBtn);
        container.appendChild(deleteBtn);
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
    renderMistakes();

    document.getElementById('modeSelectArea').style.display = 'none';
    document.getElementById('quizBoxArea').style.display = 'block';
    document.getElementById('quizControls').style.display = 'flex';
    
    currentIndex = 0;
    document.getElementById('submitBtn').style.display = 'inline-block';
    document.getElementById('answerInput').style.display = 'inline-block';
    document.getElementById('restartBtn').style.display = 'none';
    
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

// 【変更点3】答え合わせ処理を「配列にユーザーの回答が含まれているか」に変更し、表示をカンマ区切りに
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
    
    // 正解は配列になっている
    const correctAnswers = currentQuizData[currentIndex].a; 
    // 表示用に「カンマと半角スペース」で結合する
    const displayAnswer = correctAnswers.join(', '); 
    
    const overlay = document.getElementById('overlayMark');
    
    // ユーザーの入力が正解の配列のどれかと一致すれば正解（isCorrectがtrueになる）
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

        // 間違えた問題リストにも「カンマ区切り」の答えを渡す
        mistakes.push({
            q: currentQuizData[currentIndex].q,
            a: displayAnswer
        });
        renderMistakes(); 
    }
    
    overlay.classList.add('show-mark');
    
    clearTimeout(markTimeout);
    markTimeout = setTimeout(() => {
        overlay.classList.remove('show-mark');
    }, 1000);

    // 画面に「赤, 赤色」のように正解を表示
    document.getElementById('correctAnswerDisplay').textContent = displayAnswer;

    isWaitingForNext = true;
    document.getElementById('submitBtn').textContent = '次へ';

    input.focus();
}

function renderMistakes() {
    const container = document.getElementById('mistakeContainer');
    const listDiv = document.getElementById('mistakeList');
    
    if (mistakes.length === 0) {
        container.style.display = 'none'; 
        return;
    }
    
    container.style.display = 'block'; 
    listDiv.innerHTML = ''; 
    
    mistakes.forEach(mistake => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'mistake-item';
        
        const qSpan = document.createElement('span');
        qSpan.className = 'mistake-q';
        qSpan.textContent = mistake.q;
        
        const aSpan = document.createElement('span');
        aSpan.className = 'mistake-a';
        aSpan.textContent = mistake.a; // ここにはカンマ区切りの文字列が入る
        
        itemDiv.appendChild(qSpan);
        itemDiv.appendChild(aSpan);
        listDiv.appendChild(itemDiv);
    });
}

function finishQuiz() {
    document.getElementById('question').textContent = '終了！';
    document.getElementById('progressDisplay').textContent = '';
    
    const input = document.getElementById('answerInput');
    input.style.display = 'none';
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('correctAnswerDisplay').textContent = '';
    document.getElementById('restartBtn').style.display = 'inline-block';
}

document.getElementById('submitBtn').addEventListener('mousedown', function(event) {
    event.preventDefault(); 
});

document.getElementById('submitBtn').addEventListener('click', checkAnswer);

document.getElementById('answerInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); 
        checkAnswer();
    } else if (isWaitingForNext) {
        event.preventDefault();
    }
});

document.getElementById('restartBtn').addEventListener('click', function() {
    mistakes = [];
    renderMistakes();

    if (currentMode === 'random') {
        currentQuizData = shuffleArray([...originalQuizWords]); 
    }
    
    currentIndex = 0;
    document.getElementById('submitBtn').style.display = 'inline-block';
    document.getElementById('answerInput').style.display = 'inline-block';
    document.getElementById('restartBtn').style.display = 'none';
    showQuestion();
});

document.getElementById('backBtn').addEventListener('click', function() {
    document.getElementById('quizScreen').style.display = 'none';
    document.getElementById('homeScreen').style.display = 'block';
    renderQuizList();
});
