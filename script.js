/*
 * Общий JavaScript всех страниц — курсовой проект.
 * На каждой странице запускается только её собственный блок.
 * Внешний supabase-js подключается в HTML до этого файла.
 */
(function () {
  'use strict';
  const page = document.body?.dataset.page || location.pathname.split('/').pop().replace('.html', '') || 'index';
  // Global theme: default is light. Only a saved 'dark' preference enables it.
  try { document.body.classList.toggle('dark', localStorage.getItem('theme') === 'dark'); } catch {}

  if (page === "games") {
        if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark')

        const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'
        const { createClient } = supabase
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

        let currentUserId = null
        let currentMoney = 0
        let pyodide = null
        let pyodideLoading = false
        let currentMode = 'task'
        let currentTask = null
        let taskSolved = false

        const PY_KEYWORDS = ['def','class','return','import','from','as','if','elif','else','for','while','in','not','and','or','is','None','True','False','try','except','finally','with','yield','lambda','pass','break','continue','raise','del','global','nonlocal','assert']
        const PY_BUILTINS = ['print','input','len','range','int','float','str','list','dict','tuple','set','bool','type','isinstance','hasattr','getattr','setattr','enumerate','zip','map','filter','sorted','reversed','sum','min','max','abs','round','open','super','property']

        function highlightPython(code) {
          return code.split('\n').map(line => {
            let result = '', i = 0
            while (i < line.length) {
              if (line[i] === '#') { result += `<span class="tok-comment">${escHtml(line.slice(i))}</span>`; break }
              if (line[i] === '"' || line[i] === "'") {
                const q = line[i]; let end = i+1
                const triple = line.slice(i,i+3)===q+q+q; if(triple) end=i+3
                while(end<line.length){if(triple&&line.slice(end,end+3)===q+q+q){end+=3;break}if(!triple&&line[end]===q&&line[end-1]!=='\\'){end++;break}end++}
                result+=`<span class="tok-string">${escHtml(line.slice(i,end))}</span>`; i=end; continue
              }
              if(/\d/.test(line[i])&&(i===0||/\W/.test(line[i-1]))){let end=i;while(end<line.length&&/[\d.xXbBoO]/.test(line[end]))end++;result+=`<span class="tok-number">${escHtml(line.slice(i,end))}</span>`;i=end;continue}
              if(line[i]==='@'){let end=i+1;while(end<line.length&&/[\w.]/.test(line[end]))end++;result+=`<span class="tok-decorator">${escHtml(line.slice(i,end))}</span>`;i=end;continue}
              if(/[a-zA-Z_]/.test(line[i])){
                let end=i;while(end<line.length&&/[\w]/.test(line[end]))end++
                const word=line.slice(i,end)
                if(PY_KEYWORDS.includes(word)){result+=(word==='None'||word==='True'||word==='False')?`<span class="tok-boolean">${word}</span>`:`<span class="tok-keyword">${word}</span>`}
                else if(PY_BUILTINS.includes(word))result+=`<span class="tok-builtin">${word}</span>`
                else if(word==='self'||word==='cls')result+=`<span class="tok-self">${word}</span>`
                else if(end<line.length&&line[end]==='(')result+=`<span class="tok-function">${word}</span>`
                else result+=escHtml(word)
                i=end;continue
              }
              if(/[+\-*\/=<>!&|^~%]/.test(line[i])){result+=`<span class="tok-operator">${escHtml(line[i])}</span>`;i++;continue}
              result+=escHtml(line[i]);i++
            }
            return result
          }).join('\n')
        }

        function escHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

        function setupHighlightedEditor(taId, preId) {
          const ta=document.getElementById(taId), pre=document.getElementById(preId)
          if(!ta||!pre) return
          function sync(){ pre.innerHTML=highlightPython(ta.value)+'\n'; pre.scrollTop=ta.scrollTop; pre.scrollLeft=ta.scrollLeft }
          ta.addEventListener('input',sync)
          ta.addEventListener('scroll',()=>{pre.scrollTop=ta.scrollTop;pre.scrollLeft=ta.scrollLeft})
          ta.addEventListener('keydown',function(e){if(e.key==='Tab'){e.preventDefault();const s=this.selectionStart,end=this.selectionEnd;this.value=this.value.substring(0,s)+'    '+this.value.substring(end);this.selectionStart=this.selectionEnd=s+4;sync()}})
          sync()
        }

        // ===== ЗАДАНИЯ =====
        const TASKS = [
          {id:1,title:'Сумма двух чисел',desc:'Напиши функцию `add(a, b)` которая возвращает сумму двух чисел.',examples:['add(2, 3) → 5'],tests:[{call:'add(2, 3)',expected:5},{call:'add(-1, 10)',expected:9},{call:'add(0, 0)',expected:0},{call:'add(100, 200)',expected:300}],reward:50},
          {id:2,title:'Чётное или нечётное',desc:'Напиши функцию `is_even(n)` которая возвращает `True` если число чётное.',examples:['is_even(4) → True'],tests:[{call:'is_even(4)',expected:true},{call:'is_even(7)',expected:false},{call:'is_even(0)',expected:true},{call:'is_even(-3)',expected:false}],reward:50},
          {id:3,title:'Максимум из трёх',desc:'Напиши функцию `max3(a, b, c)` которая возвращает наибольшее из трёх чисел.',examples:['max3(1, 5, 3) → 5'],tests:[{call:'max3(1, 5, 3)',expected:5},{call:'max3(10, 2, 8)',expected:10},{call:'max3(-1, -5, -3)',expected:-1},{call:'max3(7, 7, 7)',expected:7}],reward:60},
          {id:4,title:'Факториал',desc:'Напиши функцию `factorial(n)` которая возвращает факториал числа n.',examples:['factorial(5) → 120'],tests:[{call:'factorial(0)',expected:1},{call:'factorial(1)',expected:1},{call:'factorial(5)',expected:120},{call:'factorial(7)',expected:5040}],reward:80},
          {id:5,title:'Переворот строки',desc:'Напиши функцию `reverse_str(s)` которая возвращает строку в обратном порядке.',examples:['reverse_str("hello") → "olleh"'],tests:[{call:'reverse_str("hello")',expected:'olleh'},{call:'reverse_str("abc")',expected:'cba'},{call:'reverse_str("a")',expected:'a'}],reward:70},
          {id:6,title:'Сумма списка',desc:'Напиши функцию `sum_list(lst)` которая возвращает сумму всех элементов.',examples:['sum_list([1, 2, 3]) → 6'],tests:[{call:'sum_list([1, 2, 3])',expected:6},{call:'sum_list([10, -5, 3])',expected:8},{call:'sum_list([])',expected:0}],reward:60},
          {id:7,title:'Палиндром',desc:'Напиши функцию `is_palindrome(s)` которая возвращает `True` если строка палиндром.',examples:['is_palindrome("radar") → True'],tests:[{call:'is_palindrome("radar")',expected:true},{call:'is_palindrome("hello")',expected:false},{call:'is_palindrome("abba")',expected:true}],reward:80},
          {id:8,title:'Подсчёт гласных',desc:'Напиши функцию `count_vowels(s)` которая считает гласные (a,e,i,o,u).',examples:['count_vowels("hello") → 2'],tests:[{call:'count_vowels("hello")',expected:2},{call:'count_vowels("python")',expected:1},{call:'count_vowels("aeiou")',expected:5}],reward:70},
          {id:9,title:'Число Фибоначчи',desc:'Напиши функцию `fib(n)` которая возвращает n-е число Фибоначчи.',examples:['fib(6) → 8'],tests:[{call:'fib(0)',expected:0},{call:'fib(1)',expected:1},{call:'fib(6)',expected:8},{call:'fib(10)',expected:55}],reward:100},
          {id:10,title:'FizzBuzz',desc:'Напиши функцию `fizzbuzz(n)` — "Fizz", "Buzz", "FizzBuzz" или строка числа.',examples:['fizzbuzz(15) → "FizzBuzz"'],tests:[{call:'fizzbuzz(3)',expected:'Fizz'},{call:'fizzbuzz(5)',expected:'Buzz'},{call:'fizzbuzz(15)',expected:'FizzBuzz'},{call:'fizzbuzz(7)',expected:'7'}],reward:90}
        ]

        const TYPING_TEXTS = {
          easy: ['x = 5\ny = 10\nprint(x + y)','name = "Python"\nprint(name)','for i in range(5):\n    print(i)','a = [1, 2, 3]\nprint(len(a))','if x > 0:\n    print("positive")\nelse:\n    print("negative")'],
          medium: ['def add(a, b):\n    return a + b\n\nresult = add(3, 7)\nprint(result)','def is_even(n):\n    return n % 2 == 0\n\nfor i in range(10):\n    if is_even(i):\n        print(i)','numbers = [1, 2, 3, 4, 5]\nsquares = [x ** 2 for x in numbers]\nprint(squares)','def factorial(n):\n    if n == 0:\n        return 1\n    return n * factorial(n - 1)','words = ["hello", "world", "python"]\nfor word in words:\n    print(word.upper())'],
          hard: ['def binary_search(arr, target):\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return -1','class Stack:\n    def __init__(self):\n        self.items = []\n\n    def push(self, item):\n        self.items.append(item)\n\n    def pop(self):\n        return self.items.pop() if self.items else None\n\n    def is_empty(self):\n        return len(self.items) == 0','def merge_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    mid = len(arr) // 2\n    left = merge_sort(arr[:mid])\n    right = merge_sort(arr[mid:])\n    return merge(left, right)\n\ndef merge(left, right):\n    result = []\n    i = j = 0\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            result.append(left[i])\n            i += 1\n        else:\n            result.append(right[j])\n            j += 1\n    return result + left[i:] + right[j:]']
        }
        const TYPING_CONFIG = { easy:{time:30,base:50,perSec:5,label:'Лёгкий'}, medium:{time:30,base:100,perSec:10,label:'Средний'}, hard:{time:30,base:150,perSec:25,label:'Тяжёлый'} }
        let typingDiff=null,typingText='',typingTimer=null,typingTimeLeft=30,typingErrors=0,typingFinished=false

        const SORT_TYPES = [
          {id:'int',  label:'int',  example:'42',   cls:'int',  values:['0','1','-5','42','100','255','-1','999','7','13']},
          {id:'float',label:'float',example:'3.14', cls:'float',values:['3.14','0.5','-2.7','1.0','9.99','0.001','-0.5','2.718']},
          {id:'str',  label:'str',  example:'"hi"', cls:'str',  values:['"hello"','"Python"','"abc"','"world"','"123"','"test"','"OK"']},
          {id:'bool', label:'bool', example:'True', cls:'bool', values:['True','False']},
          {id:'None', label:'None', example:'None', cls:'none', values:['None','None','None']},
          {id:'list', label:'list', example:'[1,2]',cls:'list', values:['[1, 2]','[]','[True]','["a"]','[1, 2, 3]','[0]']},
        ]

        let sortLives=3, sortScore=0, sortTime=0, sortSpeed=1.0
        let sortGameLoop=null, sortTimerLoop=null, sortSpawnTimeout=null
        let sortFalling=[], sortBoxOffset=0, sortRunning=false, sortOver=false
        let sortTouchStartX=0

        async function init() {
          const {data:{session}} = await client.auth.getSession()
          if(!session){window.location.href='index.html';return}
          currentUserId=session.user.id
          const {data,error}=await client.from('profiles').select('name,profile_bg,profile_avatar,wins,win_streak,money').eq('id',session.user.id).single()
          if(error||!data){window.location.href='index.html';return}
          currentMoney=data.money??0
          document.getElementById('profile-name').textContent=data.name
          document.getElementById('wins-count').textContent=data.wins??0
          document.getElementById('streak-count').textContent=data.win_streak??0
          if(data.profile_avatar) document.getElementById('profile-avatar-img').src=data.profile_avatar
          if(data.profile_bg){const btn=document.getElementById('profile-btn');btn.style.backgroundImage=`url('${data.profile_bg}')`;const img=document.createElement('img');img.src=data.profile_bg;img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0;';btn.appendChild(img);btn.classList.add('has-bg')}
          showGameSelect()
        }

        function showGameSelect() {
          clearTypingTimer()
          stopSortGame()
          const content=document.getElementById('main-content')
          content.style.alignItems='center'
          content.style.justifyContent='center'
          content.innerHTML=`
            <div class="games-grid u-ac3f11f2e">
              <button class="game-card" onclick="showCompiler()">
                <div class="game-card-icon">🐍</div>
                <div class="game-card-title">Компилятор</div>
                <div class="game-card-desc">Реши задачи на Python или просто попробуй код</div>
              </button>
              <button class="game-card" onclick="showTypingSetup()">
                <div class="game-card-icon">⌨️</div>
                <div class="game-card-title">Быстрая печать</div>
                <div class="game-card-desc">Печатай Python код как можно быстрее</div>
              </button>
              <button class="game-card" onclick="showSortGame()">
                <div class="game-card-icon">🗂️</div>
                <div class="game-card-title">Сортировка</div>
                <div class="game-card-desc">Лови падающие данные и клади в нужную коробку</div>
              </button>
            </div>`
        }

        function showCompiler() {
          currentMode='task'
          const content=document.getElementById('main-content')
          content.style.alignItems='stretch'
          content.style.justifyContent='flex-start'
          content.innerHTML=`
            <div class="compiler-layout">
              <div class="compiler-sidebar">
                <button class="compiler-mode-btn active" id="btn-task" onclick="setMode('task')"><span class="compiler-mode-btn-icon">📋</span> Задание</button>
                <button class="compiler-mode-btn" id="btn-sandbox" onclick="setMode('sandbox')"><span class="compiler-mode-btn-icon">🏖️</span> Песочница</button>
                <div class="u-d9e88f748"></div>
                <button class="compiler-mode-btn u-db203cccd" onclick="showGameSelect()"><span class="compiler-mode-btn-icon">←</span> Назад</button>
              </div>
              <div class="compiler-content" id="compiler-content">
                <div class="pyodide-loader" id="pyodide-loader">
                  <div class="u-a9d3b59a6">🐍</div>
                  <div>Загрузка Python...</div>
                  <div class="pyodide-loader-bar"><div class="pyodide-loader-fill u-d2fba0f35" id="loader-fill"></div></div>
                  <div id="loader-text" class="u-32cb3aa02">Подготовка...</div>
                </div>
              </div>
            </div>`
          loadPyodide()
        }

        async function loadPyodide() {
          if(pyodide){renderMode();return}
          if(pyodideLoading)return
          pyodideLoading=true
          try{
            const fill=document.getElementById('loader-fill'),text=document.getElementById('loader-text')
            if(fill)fill.style.width='20%'
            const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';document.head.appendChild(script)
            await new Promise((res,rej)=>{script.onload=res;script.onerror=rej})
            if(fill)fill.style.width='50%';if(text)text.textContent='Инициализация Python...'
            pyodide=await window.loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'})
            if(fill)fill.style.width='100%';if(text)text.textContent='Готово!'
            await new Promise(r=>setTimeout(r,400));renderMode()
          }catch{const loader=document.getElementById('pyodide-loader');if(loader)loader.innerHTML='<div class="u-cf8b3e779">❌ Ошибка загрузки Python.</div>'}
        }

        function setMode(mode){currentMode=mode;document.getElementById('btn-task').classList.toggle('active',mode==='task');document.getElementById('btn-sandbox').classList.toggle('active',mode==='sandbox');renderMode()}
        function renderMode(){if(currentMode==='task')renderTaskMode();else renderSandboxMode()}

        function renderTaskMode(){
          if(!currentTask){currentTask=[...TASKS].sort(()=>Math.random()-0.5)[0];taskSolved=false}
          const content=document.getElementById('compiler-content')
          content.innerHTML=`
            <div class="compiler-topbar">
              <div class="compiler-topbar-left">
                <div class="compiler-page-title">📋 Задание</div>
                <button class="back-btn" onclick="newTask()">🔀 Новое задание</button>
              </div>
              <button class="compiler-run-btn" id="run-btn" onclick="runTask()" ${taskSolved?'disabled':''}>▶ Запустить</button>
            </div>
            <div class="compiler-body">
              <div class="task-panel">
                <div class="task-header"><div class="task-title">${currentTask.title}</div><div class="task-badge">+${currentTask.reward} 🪙</div></div>
                <div class="task-desc">${currentTask.desc}</div>
                <div class="task-examples">${currentTask.examples.map(e=>`<div class="task-example">${e}</div>`).join('')}</div>
              </div>
              <div class="editor-wrap">
                <div class="editor-label">Твой код</div>
                <div class="code-highlight-wrap">
                  <pre class="code-highlight-pre" id="highlight-pre"></pre>
                  <textarea class="code-editor" id="code-editor" spellcheck="false" placeholder="# Напиши функцию здесь..."></textarea>
                </div>
              </div>
              <div class="console-wrap">
                <div class="console-label">Результат <button class="console-clear-btn" onclick="clearConsole()">Очистить</button></div>
                <div class="console-output" id="console-output"><span class="info-line">// Запусти код чтобы увидеть результат</span></div>
              </div>
              ${taskSolved?'<div class="task-result pass">✅ Задание выполнено!</div>':''}
            </div>`
          setupHighlightedEditor('code-editor','highlight-pre')
        }

        function newTask(){currentTask=[...TASKS].sort(()=>Math.random()-0.5)[0];taskSolved=false;renderTaskMode()}

        async function runTask(){
          if(!pyodide||taskSolved)return
          const code=document.getElementById('code-editor').value
          const out=document.getElementById('console-output')
          out.innerHTML='<span class="info-line">// Выполняется...</span>'
          let passed=0,failed=0,lines=[]
          for(const test of currentTask.tests){
            try{
              pyodide.runPython(code+'\nresult = '+test.call)
              const result=pyodide.globals.get('result')
              const got=typeof result==='boolean'?result:(typeof result==='string'?result:Number(result))
              const ok=String(got)===String(test.expected)
              if(ok){passed++;lines.push(`<span class="ok-line">✅ ${test.call} → ${got}</span>`)}
              else{failed++;lines.push(`<span class="err-line">❌ ${test.call} → получено: ${got}, ожидалось: ${test.expected}</span>`)}
            }catch(e){failed++;lines.push(`<span class="err-line">❌ ${test.call} → ${e.message}</span>`)}
          }
          out.innerHTML=lines.join('\n')
          if(failed===0){
            out.innerHTML+=`\n<span class="ok-line">🎉 Все тесты пройдены! +${currentTask.reward} 🪙</span>`
            taskSolved=true
            const newMoney=currentMoney+currentTask.reward
            await client.from('profiles').update({money:newMoney}).eq('id',currentUserId)
            currentMoney=newMoney
            const runBtn=document.getElementById('run-btn');if(runBtn)runBtn.disabled=true
            const body=document.querySelector('.compiler-body')
            if(body){const div=document.createElement('div');div.className='task-result pass';div.textContent='✅ Задание выполнено! Награда получена.';body.appendChild(div)}
          }else{out.innerHTML+=`\n<span class="info-line">Пройдено: ${passed}/${currentTask.tests.length}</span>`}
        }

        function renderSandboxMode(){
          const content=document.getElementById('compiler-content')
          content.innerHTML=`
            <div class="compiler-topbar">
              <div class="compiler-topbar-left"><div class="compiler-page-title">🏖️ Песочница</div></div>
              <button class="compiler-run-btn" onclick="runSandbox()">▶ Запустить</button>
            </div>
            <div class="compiler-body">
              <div class="editor-wrap">
                <div class="editor-label">Код</div>
                <div class="code-highlight-wrap">
                  <pre class="code-highlight-pre" id="highlight-pre"></pre>
                  <textarea class="code-editor" id="code-editor" spellcheck="false" placeholder="# Пиши любой Python код...&#10;print('Hello, World!')"></textarea>
                </div>
              </div>
              <div class="console-wrap">
                <div class="console-label">Консоль <button class="console-clear-btn" onclick="clearConsole()">Очистить</button></div>
                <div class="console-output" id="console-output"><span class="info-line">// Запусти код чтобы увидеть вывод</span></div>
              </div>
            </div>`
          setupHighlightedEditor('code-editor','highlight-pre')
        }

        async function runSandbox(){
          if(!pyodide)return
          const code=document.getElementById('code-editor').value
          const out=document.getElementById('console-output')
          out.innerHTML=''
          let outputLines=[]
          pyodide.runPython(`import builtins\ndef _input(prompt=''):\n    import js\n    result = js.prompt(prompt)\n    return result if result is not None else ''\nbuiltins.input = _input`)
          pyodide.setStdout({batched:(t)=>outputLines.push(t)})
          pyodide.setStderr({batched:(t)=>outputLines.push(`<span class="err-line">${t}</span>`)})
          try{
            await pyodide.runPythonAsync(code)
            out.innerHTML=outputLines.length===0?'<span class="info-line">// Код выполнен без вывода</span>':outputLines.map(l=>l.startsWith('<span')?l:`<span class="out-line">${l}</span>`).join('\n')
          }catch(e){out.innerHTML=`<span class="err-line">${e.message}</span>`}
        }

        function clearConsole(){const out=document.getElementById('console-output');if(out)out.innerHTML='<span class="info-line">// Очищено</span>'}

        function showTypingSetup(){
          clearTypingTimer();typingDiff=null
          const content=document.getElementById('main-content')
          content.style.alignItems='center';content.style.justifyContent='center'
          content.innerHTML=`
            <div class="typing-setup-box">
              <div class="typing-setup-inner">
                <div class="typing-setup-title">⌨️ Быстрая печать</div>
                <div>
                  <div class="u-ea53f25c2">Сложность</div>
                  <div class="typing-diff-btns">
                    <button class="typing-diff-btn" data-diff="easy" onclick="selectDiff('easy')"><span class="typing-diff-icon">🟢</span><span>Лёгкий</span><span class="typing-diff-label">50 + 5/сек</span></button>
                    <button class="typing-diff-btn" data-diff="medium" onclick="selectDiff('medium')"><span class="typing-diff-icon">🟡</span><span>Средний</span><span class="typing-diff-label">100 + 10/сек</span></button>
                    <button class="typing-diff-btn" data-diff="hard" onclick="selectDiff('hard')"><span class="typing-diff-icon">🔴</span><span>Тяжёлый</span><span class="typing-diff-label">150 + 25/сек</span></button>
                  </div>
                </div>
                <div class="u-7e8cb3f43">30 секунд · -50 монет за ошибку</div>
                <button class="typing-start-btn" id="typing-start-btn" onclick="startTyping()" disabled>Начать</button>
                <button class="typing-result-btn secondary u-dac4fe6c9" onclick="showGameSelect()">← Назад к играм</button>
              </div>
            </div>`
        }

        function selectDiff(diff){typingDiff=diff;document.querySelectorAll('.typing-diff-btn').forEach(b=>b.classList.remove('selected'));document.querySelector(`[data-diff="${diff}"]`).classList.add('selected');document.getElementById('typing-start-btn').disabled=false}

        function startTyping(){
          if(!typingDiff)return
          typingText=TYPING_TEXTS[typingDiff][Math.floor(Math.random()*TYPING_TEXTS[typingDiff].length)]
          typingErrors=0;typingFinished=false;typingTimeLeft=TYPING_CONFIG[typingDiff].time
          const content=document.getElementById('main-content')
          content.style.alignItems='stretch';content.style.justifyContent='flex-start'
          content.innerHTML=`
            <div class="typing-game-layout">
              <div class="typing-topbar">
                <div class="typing-topbar-left">
                  <button class="back-btn" onclick="showTypingSetup()">← Назад</button>
                  <div class="typing-page-title">⌨️ ${TYPING_CONFIG[typingDiff].label}</div>
                </div>
                <div class="typing-stats">
                  <div class="typing-errors-badge">❌ <span id="errors-count">0</span> ошибок</div>
                  <div class="typing-timer" id="typing-timer">${typingTimeLeft}с</div>
                </div>
              </div>
              <div class="typing-display-wrap" id="typing-display-wrap">
                <pre class="typing-display-pre" id="typing-target">${escHtml(typingText)}</pre>
                <pre class="typing-chars-overlay" id="typing-chars"></pre>
                <textarea class="typing-input-overlay" id="typing-input" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"></textarea>
              </div>
            </div>`
          const input=document.getElementById('typing-input')
          input.focus();input.addEventListener('input',onTypingInput)
          typingTimer=setInterval(()=>{
            typingTimeLeft--
            const el=document.getElementById('typing-timer');if(!el){clearTypingTimer();return}
            el.textContent=typingTimeLeft+'с'
            if(typingTimeLeft<=10)el.classList.add('urgent')
            if(typingTimeLeft<=0){clearTypingTimer();finishTyping(false)}
          },1000)
        }

        function onTypingInput(){
          if(typingFinished)return
          const input=document.getElementById('typing-input'),typed=input.value,target=typingText
          const charsEl=document.getElementById('typing-chars')
          let html='',errorCount=0
          for(let i=0;i<typed.length;i++){
            if(i>=target.length)break
            const typedChar=typed[i],targetChar=target[i]
            if(targetChar===' '||targetChar==='\n'){
              if(typedChar===' '||typedChar==='\n')html+=`<span class="char-correct">${escHtml(targetChar)}</span>`
              else{html+=`<span class="char-wrong">${escHtml(targetChar)}</span>`;errorCount++}
            }else{
              if(typedChar===targetChar)html+=`<span class="char-correct">${escHtml(typedChar)}</span>`
              else{html+=`<span class="char-wrong">${escHtml(targetChar)}</span>`;errorCount++}
            }
          }
          charsEl.innerHTML=html;typingErrors=errorCount
          document.getElementById('errors-count').textContent=errorCount
          const norm=s=>s.replace(/[ \t]+/g,' ').replace(/\n /g,'\n').trim()
          if(norm(typed)===norm(target)){clearTypingTimer();finishTyping(true)}
        }

        function clearTypingTimer(){if(typingTimer){clearInterval(typingTimer);typingTimer=null}}

        async function finishTyping(completed){
          typingFinished=true;clearTypingTimer()
          const cfg=TYPING_CONFIG[typingDiff],secsLeft=typingTimeLeft,errorPenalty=typingErrors*50
          let reward=cfg.base+secsLeft*cfg.perSec-errorPenalty
          if(reward<0)reward=0;if(!completed)reward=Math.floor(reward*0.3)
          const newMoney=currentMoney+reward
          await client.from('profiles').update({money:newMoney}).eq('id',currentUserId)
          currentMoney=newMoney
          const content=document.getElementById('main-content')
          content.style.alignItems='center';content.style.justifyContent='center'
          content.innerHTML=`
            <div class="typing-setup-box">
              <div class="typing-result-box">
                <div class="typing-result-title">${completed?'🏆 Завершено!':'⏱ Время вышло!'}</div>
                <div class="typing-result-grid">
                  <div class="typing-stat-card good"><div class="typing-stat-label">Сложность</div><div class="typing-stat-value">${cfg.label}</div></div>
                  <div class="typing-stat-card ${typingErrors>0?'bad':'good'}"><div class="typing-stat-label">Ошибок</div><div class="typing-stat-value">${typingErrors}</div></div>
                  <div class="typing-stat-card info"><div class="typing-stat-label">Осталось секунд</div><div class="typing-stat-value">${completed?secsLeft:0}</div></div>
                  <div class="typing-stat-card bad"><div class="typing-stat-label">Штраф</div><div class="typing-stat-value">-${errorPenalty} 🪙</div></div>
                </div>
                <div class="typing-result-reward">💰 Награда<div class="typing-result-amount">+${reward} 🪙</div></div>
                <div class="u-6b00e7535">
                  <button class="typing-result-btn secondary u-7623f0554" onclick="showGameSelect()">← Игры</button>
                  <button class="typing-result-btn primary u-7623f0554" onclick="showTypingSetup()">Ещё раз</button>
                </div>
              </div>
            </div>`
        }

        function showSortGame(){
          stopSortGame()
          const content=document.getElementById('main-content')
          content.style.alignItems='stretch';content.style.justifyContent='flex-start'
          content.innerHTML=`
            <div class="sorting-layout" id="sorting-layout">
              <div class="sorting-topbar">
                <div class="sorting-topbar-left">
                  <button class="back-btn" onclick="stopSortGame();showGameSelect()">← Назад</button>
                  <div class="sorting-title">🗂️ Сортировка данных</div>
                </div>
                <div class="sorting-topbar-right">
                  <div class="sort-lives" id="sort-lives">
                    <div class="sort-life" id="sl-0"></div>
                    <div class="sort-life" id="sl-1"></div>
                    <div class="sort-life" id="sl-2"></div>
                  </div>
                  <div class="sort-timer-badge" id="sort-timer">0с</div>
                  <div class="sort-money-badge" id="sort-money">+0 🪙</div>
                </div>
              </div>
              <div id="sort-game-field">
                <div id="sort-catch-line"></div>
              </div>
              <div id="sort-boxes-zone">
                <div id="sort-boxes-hint">◀ ▶ стрелки или свайп — выбери тип коробки</div>
                <div id="sort-boxes-track">
                  <button class="sort-nav-btn" id="snav-left" onclick="sortRotateLeft()">◀</button>
                  <div id="sort-boxes-visible" class="u-09cc1ce11"></div>
                  <button class="sort-nav-btn" id="snav-right" onclick="sortRotateRight()">▶</button>
                </div>
              </div>
              <div id="sort-overlay">
                <div class="sort-overlay-box" id="sort-overlay-content"></div>
              </div>
            </div>`

          sortShowStartScreen()
          sortSetupSwipe()
          sortSetupKeys()
        }

        function sortShowStartScreen(){
          document.getElementById('sort-overlay-content').innerHTML=`
            <div class="sort-overlay-title">🗂️ Сортировка данных</div>
            <div class="sort-overlay-desc">Данные падают сверху — поймай каждое значение правильной коробкой!<br>◀ ▶ чтобы крутить ленту коробок.</div>
            <div class="type-legend">
              <span class="legend-chip u-290633916">int: 42</span>
              <span class="legend-chip u-c4096bcd0">float: 3.14</span>
              <span class="legend-chip u-6c369d224">str: "hi"</span>
              <span class="legend-chip u-4b2ca66aa">bool: True</span>
              <span class="legend-chip u-aec868931">None: None</span>
              <span class="legend-chip u-7a0770966">list: [1,2]</span>
            </div>
            <div class="u-7bac2dae3">3 жизни · 1 секунда = 5 монет · скорость растёт каждые 10с</div>
            <button class="sort-btn primary" onclick="sortStartGame()">Начать игру</button>`
          document.getElementById('sort-overlay').style.display='flex'
        }

        function sortStartGame(){
          document.getElementById('sort-overlay').style.display='none'
          sortLives=3;sortScore=0;sortTime=0;sortSpeed=1.0
          sortFalling=[];sortBoxOffset=0;sortRunning=true;sortOver=false
          sortUpdateLives();sortUpdateBoxes()

          sortTimerLoop=setInterval(()=>{
            if(sortOver)return
            sortTime++;sortScore=sortTime*5
            const t=document.getElementById('sort-timer'),m=document.getElementById('sort-money')
            if(t)t.textContent=sortTime+'с'
            if(m)m.textContent='+'+sortScore+' 🪙'
            if(sortTime%10===0){sortSpeed=Math.min(sortSpeed+0.15,3.5);sortResetSpawn()}
          },1000)

          let last=performance.now()
          function loop(now){
            if(sortOver)return
            sortUpdateFalling((now-last)/1000);last=now
            sortGameLoop=requestAnimationFrame(loop)
          }
          sortGameLoop=requestAnimationFrame(loop)
          sortScheduleSpawn()
        }

        function sortScheduleSpawn(){
          const interval=Math.max(700,2500-(sortSpeed-1)*600)
          sortSpawnTimeout=setTimeout(()=>{if(!sortOver){sortSpawnItem();sortScheduleSpawn()}},interval)
        }

        function sortResetSpawn(){clearTimeout(sortSpawnTimeout);sortScheduleSpawn()}

        function stopSortGame(){
          sortOver=true;sortRunning=false
          cancelAnimationFrame(sortGameLoop)
          clearInterval(sortTimerLoop)
          clearTimeout(sortSpawnTimeout)
          sortFalling.forEach(it=>{if(it.el&&it.el.parentNode)it.el.remove()})
          sortFalling=[]
          document.removeEventListener('keydown',sortKeyHandler)
        }

        function sortUpdateBoxes(){
          const vis=document.getElementById('sort-boxes-visible')
          if(!vis)return
          vis.innerHTML=''
          ;[-1,0,1].forEach(offset=>{
            const idx=((sortBoxOffset+offset)%SORT_TYPES.length+SORT_TYPES.length)%SORT_TYPES.length
            const type=SORT_TYPES[idx]
            const box=document.createElement('div')
            box.className=`sort-box sb-${type.cls} ${offset===0?'active':'side'}`
            box.innerHTML=`<div class="sort-box-label">${type.label}</div><div class="sort-box-example">${type.example}</div>`
            vis.appendChild(box)
          })
          const active=SORT_TYPES[((sortBoxOffset)%SORT_TYPES.length+SORT_TYPES.length)%SORT_TYPES.length]
          const colors={int:'#60a5fa',float:'#a78bfa',str:'#34d399',bool:'#fbbf24',None:'#f87171',list:'#fb923c'}
          const line=document.getElementById('sort-catch-line')
          if(line){line.style.background=colors[active.id]||'#FDD835';line.style.boxShadow=`0 0 12px ${colors[active.id]||'#FDD835'}60`}
        }

        function sortRotateLeft(){sortBoxOffset=(sortBoxOffset-1+SORT_TYPES.length)%SORT_TYPES.length;sortUpdateBoxes()}
        function sortRotateRight(){sortBoxOffset=(sortBoxOffset+1)%SORT_TYPES.length;sortUpdateBoxes()}
        function sortGetActive(){return SORT_TYPES[((sortBoxOffset)%SORT_TYPES.length+SORT_TYPES.length)%SORT_TYPES.length]}

        function sortSpawnItem(){
          if(sortOver)return
          const field=document.getElementById('sort-game-field')
          if(!field)return
          const w=field.offsetWidth
          const type=SORT_TYPES[Math.floor(Math.random()*SORT_TYPES.length)]
          const value=type.values[Math.floor(Math.random()*type.values.length)]
          const el=document.createElement('div')
          el.className=`sort-item si-${type.cls}`
          el.textContent=value
          const x=80+Math.random()*(w-160)
          el.style.left=x+'px';el.style.top='-50px'
          field.appendChild(el)
          sortFalling.push({el,type:type.id,x,y:-50,caught:false})
        }

        function sortUpdateFalling(dt){
          const field=document.getElementById('sort-game-field')
          if(!field)return
          const fieldH=field.offsetHeight-110
          const catchY=fieldH-20
          const speed=80*sortSpeed

          sortFalling=sortFalling.filter(item=>{
            if(item.caught)return false
            item.y+=speed*dt
            item.el.style.top=item.y+'px'
            if(item.y>=catchY-10&&item.y<=catchY+35){
              if(sortGetActive().id===item.type){sortCatchItem(item,true)}
              return true
            }
            if(item.y>fieldH+30){sortCatchItem(item,false);return false}
            return true
          })
        }

        function sortCatchItem(item,correct){
          if(item.caught)return
          item.caught=true
          item.el.classList.add(correct?'anim-ok':'anim-err')
          sortSpawnParticles(item.x,item.y,correct?'#34d399':'#ef4444')
          setTimeout(()=>{if(item.el&&item.el.parentNode)item.el.remove()},400)
          if(!correct){sortLives--;sortUpdateLives();if(sortLives<=0)setTimeout(sortEndGame,450)}
        }

        function sortUpdateLives(){
          for(let i=0;i<3;i++){const d=document.getElementById('sl-'+i);if(d)d.classList.toggle('lost',i>=sortLives)}
        }

        function sortSpawnParticles(x,y,color){
          const field=document.getElementById('sort-game-field')
          if(!field)return
          for(let i=0;i<6;i++){
            const p=document.createElement('div');p.className='sort-particle'
            const angle=(i/6)*Math.PI*2,dist=30+Math.random()*40
            p.style.cssText=`left:${x}px;top:${y}px;width:6px;height:6px;background:${color};--tx:${Math.cos(angle)*dist}px;--ty:${Math.sin(angle)*dist}px;`
            field.appendChild(p);setTimeout(()=>p.remove(),700)
          }
        }

        async function sortEndGame(){
          stopSortGame()
          const reward=sortScore
          const newMoney=currentMoney+reward
          await client.from('profiles').update({money:newMoney}).eq('id',currentUserId)
          currentMoney=newMoney

          const oc=document.getElementById('sort-overlay-content')
          if(!oc)return
          oc.innerHTML=`
            <div class="sort-overlay-title">💔 Игра окончена!</div>
            <div class="sort-result-grid">
              <div class="sort-stat-card good"><div class="sort-stat-label">Время</div><div class="sort-stat-value good">${sortTime}с</div></div>
              <div class="sort-stat-card bad"><div class="sort-stat-label">Жизней осталось</div><div class="sort-stat-value bad">0 / 3</div></div>
            </div>
            <div class="sort-reward-box">💰 Награда<div class="sort-reward-amount">+${reward} 🪙</div><div class="u-fcc6adb81">1 секунда = 5 монет</div></div>
            <div class="u-6b00e7535">
              <button class="sort-btn secondary u-7623f0554" onclick="showGameSelect()">← Назад</button>
              <button class="sort-btn primary u-7623f0554" onclick="sortStartGame()">Ещё раз</button>
            </div>`
          document.getElementById('sort-overlay').style.display='flex'
        }

        function sortSetupSwipe(){
          const field=document.getElementById('sort-game-field')
          if(!field)return
          field.addEventListener('touchstart',e=>{sortTouchStartX=e.touches[0].clientX},{passive:true})
          field.addEventListener('touchend',e=>{
            const dx=e.changedTouches[0].clientX-sortTouchStartX
            if(Math.abs(dx)>40){if(dx<0)sortRotateRight();else sortRotateLeft()}
          },{passive:true})
        }

        let sortKeyHandler=null
        function sortSetupKeys(){
          sortKeyHandler=e=>{
            if(!sortRunning||sortOver)return
            if(e.key==='ArrowLeft'){sortRotateLeft();e.preventDefault()}
            if(e.key==='ArrowRight'){sortRotateRight();e.preventDefault()}
          }
          document.addEventListener('keydown',sortKeyHandler)
        }

        function toggleDropdown(e){e.stopPropagation();document.getElementById('profile-btn').classList.toggle('open')}
        document.addEventListener('click',function(e){const p=document.getElementById('profile-btn');if(p&&!p.contains(e.target))p.classList.remove('open')})
        async function logout(){await client.auth.signOut();window.location.href='index.html'}

    
        if (typeof clearConsole === "function") window.clearConsole = clearConsole;
        if (typeof clearTypingTimer === "function") window.clearTypingTimer = clearTypingTimer;
        if (typeof escHtml === "function") window.escHtml = escHtml;
        if (typeof finishTyping === "function") window.finishTyping = finishTyping;
        if (typeof highlightPython === "function") window.highlightPython = highlightPython;
        if (typeof init === "function") window.init = init;
        if (typeof loadPyodide === "function") window.loadPyodide = loadPyodide;
        if (typeof logout === "function") window.logout = logout;
        if (typeof newTask === "function") window.newTask = newTask;
        if (typeof onTypingInput === "function") window.onTypingInput = onTypingInput;
        if (typeof renderMode === "function") window.renderMode = renderMode;
        if (typeof renderSandboxMode === "function") window.renderSandboxMode = renderSandboxMode;
        if (typeof renderTaskMode === "function") window.renderTaskMode = renderTaskMode;
        if (typeof runSandbox === "function") window.runSandbox = runSandbox;
        if (typeof runTask === "function") window.runTask = runTask;
        if (typeof selectDiff === "function") window.selectDiff = selectDiff;
        if (typeof setMode === "function") window.setMode = setMode;
        if (typeof setupHighlightedEditor === "function") window.setupHighlightedEditor = setupHighlightedEditor;
        if (typeof showCompiler === "function") window.showCompiler = showCompiler;
        if (typeof showGameSelect === "function") window.showGameSelect = showGameSelect;
        if (typeof showSortGame === "function") window.showSortGame = showSortGame;
        if (typeof showTypingSetup === "function") window.showTypingSetup = showTypingSetup;
        if (typeof sortCatchItem === "function") window.sortCatchItem = sortCatchItem;
        if (typeof sortEndGame === "function") window.sortEndGame = sortEndGame;
        if (typeof sortGetActive === "function") window.sortGetActive = sortGetActive;
        if (typeof sortResetSpawn === "function") window.sortResetSpawn = sortResetSpawn;
        if (typeof sortRotateLeft === "function") window.sortRotateLeft = sortRotateLeft;
        if (typeof sortRotateRight === "function") window.sortRotateRight = sortRotateRight;
        if (typeof sortScheduleSpawn === "function") window.sortScheduleSpawn = sortScheduleSpawn;
        if (typeof sortSetupKeys === "function") window.sortSetupKeys = sortSetupKeys;
        if (typeof sortSetupSwipe === "function") window.sortSetupSwipe = sortSetupSwipe;
        if (typeof sortShowStartScreen === "function") window.sortShowStartScreen = sortShowStartScreen;
        if (typeof sortSpawnItem === "function") window.sortSpawnItem = sortSpawnItem;
        if (typeof sortSpawnParticles === "function") window.sortSpawnParticles = sortSpawnParticles;
        if (typeof sortStartGame === "function") window.sortStartGame = sortStartGame;
        if (typeof sortUpdateBoxes === "function") window.sortUpdateBoxes = sortUpdateBoxes;
        if (typeof sortUpdateFalling === "function") window.sortUpdateFalling = sortUpdateFalling;
        if (typeof sortUpdateLives === "function") window.sortUpdateLives = sortUpdateLives;
        if (typeof startTyping === "function") window.startTyping = startTyping;
        if (typeof stopSortGame === "function") window.stopSortGame = stopSortGame;
        if (typeof toggleDropdown === "function") window.toggleDropdown = toggleDropdown;

    init()
  
  }

  if (page === "group") {
        const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'

        const { createClient } = supabase
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

        if (localStorage.getItem('theme') === 'dark') {
          document.body.classList.add('dark')
        }  

        let currentUser = null
        let isTeacher = false
        let teacherPassword = null
    
        let allLessons = []   
        let allSections = []   
        let allLectures = []   
        let allProfiles = []  
        let allResults = []    

        let currentLessonId = null
        let currentSectionId = null
        let viewingGroup = null

        async function init() {
          const { data: { session } } = await client.auth.getSession()
          if (!session) { window.location.href = 'index.html'; return }

          const { data, error } = await client
            .from('profiles')
            .select('id, name, group, profile_bg, profile_avatar, wins, win_streak')
            .eq('id', session.user.id)
            .single()

          if (error || !data) { window.location.href = 'index.html'; return }

          currentUser = data
          viewingGroup = data.group

          document.getElementById('profile-name').textContent = data.name
          document.getElementById('wins-count').textContent = data.wins ?? 0
          document.getElementById('streak-count').textContent = data.win_streak ?? 0
      
          if (data.profile_avatar) document.getElementById('profile-avatar-img').src = data.profile_avatar
          if (data.profile_bg) {
            const btn = document.getElementById('profile-btn')
            btn.style.backgroundImage = `url('${data.profile_bg}')`
            btn.classList.add('has-bg')
          }

          await loadTeacherPassword()
          await loadData()
        }

        async function loadTeacherPassword() {
          try {
            const { data, error } = await client.storage
              .from('config')
              .download('teacher_password.txt')
            if (error || !data) return
            teacherPassword = (await data.text()).trim()
          } catch (e) {
            teacherPassword = null
          }
        }

        async function loadData() {
          const [lessonsRes, sectionsRes, lecturesRes, profilesRes, resultsRes] = await Promise.all([
            client.from('lessons').select('*').order('id'),
            client.from('sections').select('*').order('order'),
            client.from('lectures').select('*').order('order'),
            client.from('profiles').select('id, name, group, profile_avatar'),
            client.from('quiz_results').select('*')
          ])

          allLessons = lessonsRes.data || []
          allSections = sectionsRes.data || []
          allLectures = lecturesRes.data || []
          allProfiles = profilesRes.data || []
          allResults = resultsRes.data || []

          renderLessonsBar()
        }

        function renderLessonsBar() {
          const bar = document.getElementById('lessons-bar')
          if (!bar) return

          bar.innerHTML = allLessons.map(lesson => `
            <button class="lesson-tab-btn ${currentLessonId === lesson.id ? 'active' : ''}" 
                    onclick="selectLesson('${lesson.id}')">
              📚 ${lesson.name}
            </button>`).join('')

          if (!currentLessonId && allLessons.length > 0) {
            selectLesson(allLessons[0].id)
          }
        }

        function selectLesson(lessonId) {
          currentLessonId = lessonId
          currentSectionId = null
          renderLessonsBar()
          renderSidebar()
      
          document.getElementById('group-content').innerHTML = `
            <div class="group-empty">
              <div class="group-empty-icon">📂</div>
              <div class="group-empty-text">Выбери раздел предмета слева</div>
            </div>`
        }

        function renderSidebar() {
          const sidebar = document.getElementById('sections-sidebar')
      
          const filteredSections = allSections.filter(s => String(s.lesson_id) === String(currentLessonId))

          if (filteredSections.length === 0) {
            sidebar.innerHTML = '<div class="u-1e885dda2">Разделов нет</div>'
          } else {
            sidebar.innerHTML = filteredSections.map(s => `
              <button class="group-section-btn ${currentSectionId === s.id ? 'active' : ''}"
                onclick="selectSection('${s.id}')">
                📁 ${s.title}
              </button>`).join('')
          }

          if (isTeacher) {
            const groups = [...new Set(allProfiles.map(p => p.group).filter(Boolean))]
            sidebar.innerHTML += `
              <div class="group-sidebar-divider"></div>
              <div class="group-sidebar-title">Группа</div>
              ${groups.map(g => `
                <button class="group-section-btn ${viewingGroup === g ? 'active' : ''}"
                  onclick="selectGroup('${g}')">
                  👥 ${g}
                </button>`).join('')}`
          }
        }

        function selectSection(sectionId) {
          currentSectionId = sectionId
          renderSidebar()
          renderTable()
        }

        function selectGroup(group) {
          viewingGroup = group
          renderSidebar()
          if (currentSectionId) renderTable()
        }

        function renderTable() {
          if (!currentSectionId) return

          const section = allSections.find(s => s.id === currentSectionId)
          const sectionLectures = allLectures.filter(l => l.section_id === currentSectionId)
          const totalLectures = sectionLectures.length
          const students = allProfiles.filter(p => p.group === viewingGroup)
          const content = document.getElementById('group-content')

          if (students.length === 0) {
            content.innerHTML = `<div class="group-empty"><div class="group-empty-text">В группе ${viewingGroup} нет студентов</div></div>`
            return
          }

          const rows = students.map(student => {
            let totalPercent = 0
            const cells = sectionLectures.map(lecture => {
              const result = allResults.find(r => r.user_id === student.id && r.lecture_id === lecture.id)
              if (result) {
                totalPercent += result.percent
                return `<td class="grade-cell has-grade">${result.percent}%</td>`
              }
              return `<td class="grade-cell no-grade">—</td>`
            })

            const finalScore = totalLectures > 0 ? Math.round((totalPercent / totalLectures) * 10) / 10 : 0
            const totalClass = finalScore >= 70 ? 'high' : finalScore >= 40 ? 'mid' : 'low'
            const isMe = student.id === currentUser.id

            return `
              <tr>
                <td>
                  <div class="student-name-cell">
                    <img class="student-avatar" src="${student.profile_avatar || 'icons/profile-default.png'}">
                    ${student.name} ${isMe ? '<span class="me-badge">Я</span>' : ''}
                  </div>
                </td>
                ${cells.join('')}
                <td class="grade-cell grade-total ${totalClass}">${finalScore}%</td>
              </tr>`
          })

          content.innerHTML = `
            <div class="group-header">
              <div class="group-title">${section?.title || ''}</div>
              <div class="group-badge">${viewingGroup} · ${students.length} чел.</div>
            </div>
            <div class="grades-table-wrap">
              <table class="grades-table">
                <thead>
                  <tr>
                    <th>Студент</th>
                    ${sectionLectures.map(l => `<th>${l.title}</th>`).join('')}
                    <th>Итог</th>
                  </tr>
                </thead>
                <tbody>${rows.join('')}</tbody>
              </table>
            </div>`
        }

        function openTeacherModal() {
          if (isTeacher) {
            isTeacher = false
            viewingGroup = currentUser.group
            currentSectionId = null
            document.getElementById('teacher-btn').classList.remove('active')
            document.getElementById('teacher-btn').textContent = '🔑 Преподаватель'
            renderSidebar()
            return
          }
          document.getElementById('teacher-modal').classList.add('active')
          document.getElementById('teacher-password-input').value = ''
        }

        function closeTeacherModal() {
          document.getElementById('teacher-modal').classList.remove('active')
        }

        function checkPassword() {
          const input = document.getElementById('teacher-password-input').value
          const err = document.getElementById('teacher-modal-err')

          if (input === teacherPassword) {
            isTeacher = true
            closeTeacherModal()
            document.getElementById('teacher-btn').classList.add('active')
            document.getElementById('teacher-btn').textContent = '✅ Режим преподавателя'
            renderSidebar()
          } else {
            err.textContent = 'Неверный пароль'
          }
        }
    
        function toggleDropdown(e) {
          e.stopPropagation()
          document.getElementById('profile-btn').classList.toggle('open')
        }

        document.addEventListener('click', (e) => {
          const profile = document.getElementById('profile-btn')
          if (profile && !profile.contains(e.target)) profile.classList.remove('open')
          const modal = document.getElementById('teacher-modal')
          if (e.target === modal) closeTeacherModal()
        })

        async function logout() {
          await client.auth.signOut()
          window.location.href = 'index.html'
        }

    
        if (typeof checkPassword === "function") window.checkPassword = checkPassword;
        if (typeof closeTeacherModal === "function") window.closeTeacherModal = closeTeacherModal;
        if (typeof init === "function") window.init = init;
        if (typeof loadData === "function") window.loadData = loadData;
        if (typeof loadTeacherPassword === "function") window.loadTeacherPassword = loadTeacherPassword;
        if (typeof logout === "function") window.logout = logout;
        if (typeof openTeacherModal === "function") window.openTeacherModal = openTeacherModal;
        if (typeof renderLessonsBar === "function") window.renderLessonsBar = renderLessonsBar;
        if (typeof renderSidebar === "function") window.renderSidebar = renderSidebar;
        if (typeof renderTable === "function") window.renderTable = renderTable;
        if (typeof selectGroup === "function") window.selectGroup = selectGroup;
        if (typeof selectLesson === "function") window.selectLesson = selectLesson;
        if (typeof selectSection === "function") window.selectSection = selectSection;
        if (typeof toggleDropdown === "function") window.toggleDropdown = toggleDropdown;

    init()
  }

  if (page === "index") {
        if (localStorage.getItem('theme') === 'dark') {
          document.body.classList.add('dark')
        }

        const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'

        const { createClient } = supabase
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

        // Имя и группа хранятся в метаданных Supabase Auth, чтобы их не терять
        // после подтверждения email или входа на другом устройстве.
        async function syncRegistrationProfile(user) {
          if (!user || !user.id) return
          const email = String(user.email || '').trim().toLowerCase()
          const meta = user.user_metadata || {}
          let pending = null
          try {
            const saved = JSON.parse(localStorage.getItem('pendingProfile') || 'null')
            if (saved && saved.name && (!saved.email || String(saved.email).toLowerCase() === email)) {
              pending = saved
            }
          } catch (_) {}

          const name = String(pending?.name || meta.name || meta.full_name || '').trim()
          const group = String(pending?.group || meta.group || '').trim()
          try {
            const { data: profile, error: readError } = await client
              .from('profiles').select('id, name, group').eq('id', user.id).single()
            // Отсутствующий профиль — обычная ситуация при первом входе.
            if (!profile) {
              if (!name) return
              const { error } = await client.from('profiles').insert({id:user.id, name, group})
              if (error) { console.warn('Не удалось создать профиль:', error); return }
            } else {
              const currentName = String(profile.name || '').trim()
              const placeholder = !currentName || currentName.toLowerCase() === email ||
                currentName.toLowerCase() === email.split('@')[0]
              const patch = {}
              // Не заменять уже установленный пользователем ник автоматически.
              if (placeholder && name && currentName !== name) patch.name = name
              if (!profile.group && group) patch.group = group
              if (Object.keys(patch).length) {
                const { error } = await client.from('profiles').update(patch).eq('id', user.id)
                if (error) { console.warn('Не удалось восстановить имя:', error); return }
              }
            }
            if (pending) localStorage.removeItem('pendingProfile')
          } catch (err) { console.warn('Ошибка синхронизации профиля:', err) }
        }

        window.onload = async () => {
          const { data: { session } } = await client.auth.getSession()
          if (session) {
            await syncRegistrationProfile(session.user)
            window.location.href = 'main.html'
          }
        }

        function updateGroupPreview() {
          const prefix = document.getElementById('reg-group-prefix').value
          const year = document.getElementById('reg-group-year').value
          const preview = document.getElementById('group-preview')

          if (prefix && year) {
            preview.innerHTML = `Группа: <span>${prefix}${year}</span>`
          } else if (prefix) {
            preview.innerHTML = `Группа: <span>${prefix}__</span>`
          } else {
            preview.innerHTML = `Группа: <span>—</span>`
          }
        }

        function showLogin() {
          document.getElementById('register-form').style.display = 'none'
          document.getElementById('forgot-form').style.display = 'none'
          document.getElementById('login-form').style.display = 'block'
        }

        function showRegister() {
          document.getElementById('login-form').style.display = 'none'
          document.getElementById('forgot-form').style.display = 'none'
          document.getElementById('register-form').style.display = 'block'
        }

        function showForgot() {
          document.getElementById('register-form').style.display = 'none'
          document.getElementById('login-form').style.display = 'none'
          document.getElementById('forgot-form').style.display = 'block'
        }

        function setMessage(id, text, isSuccess = false) {
          const el = document.getElementById(id)
          el.textContent = text
          el.className = 'auth-message' + (isSuccess ? ' success' : '')
        }

        async function register() {
          const name = document.getElementById('reg-name').value.trim()
          const email = document.getElementById('reg-email').value.trim()
          const password = document.getElementById('reg-password').value
          const prefix = document.getElementById('reg-group-prefix').value
          const yearVal = parseInt(document.getElementById('reg-group-year').value)

          if (!name || !prefix || !yearVal || !email || !password) {
            setMessage('reg-message', 'Заполни все поля!')
            return
          }

          if (yearVal < 20 || yearVal > 30) {
            setMessage('reg-message', 'Год группы должен быть от 20 до 30!')
            return
          }

          const group = `${prefix}-${yearVal}`

          localStorage.setItem('pendingProfile', JSON.stringify({ name, group, email }))

          const { error } = await client.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin + window.location.pathname,
              data: { name, full_name: name, group }
            }
          })

          if (error) {
            localStorage.removeItem('pendingProfile')
            setMessage('reg-message', 'Ошибка: ' + error.message)
            return
          }

          setMessage('reg-message', '✅ Письмо отправлено! Подтверди email чтобы завершить регистрацию.', true)
        }

        async function login() {
          const email = document.getElementById('login-email').value.trim()
          const password = document.getElementById('login-password').value

          if (!email || !password) {
            setMessage('login-message', 'Заполни все поля!')
            return
          }

          const { data, error } = await client.auth.signInWithPassword({ email, password })

          if (error) {
            setMessage('login-message', 'Ошибка: ' + error.message)
            return
          }
      
          if (!data.user.email_confirmed_at) {
            await client.auth.signOut()
            setMessage('login-message', 'Сначала подтверди email — проверь почту!')
            return
          }

          await syncRegistrationProfile(data.user)
          window.location.href = 'main.html'
        }

        async function sendReset() {
          const email = document.getElementById('forgot-email').value.trim()

          if (!email) {
            setMessage('forgot-message', 'Введи email!')
            return
          }

          const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://dimon733133kz-srg.github.io/projectsite/reset.html'
          })

          if (error) {
            setMessage('forgot-message', 'Ошибка: ' + error.message)
            return
          }

          setMessage('forgot-message', '✅ Письмо отправлено! Проверь почту.', true)
        }
  

        if (typeof login === "function") window.login = login;
        if (typeof register === "function") window.register = register;
        if (typeof sendReset === "function") window.sendReset = sendReset;
        if (typeof setMessage === "function") window.setMessage = setMessage;
        if (typeof showForgot === "function") window.showForgot = showForgot;
        if (typeof showLogin === "function") window.showLogin = showLogin;
        if (typeof showRegister === "function") window.showRegister = showRegister;
        if (typeof updateGroupPreview === "function") window.updateGroupPreview = updateGroupPreview;
  }

  if (page === "leaderboard") {
    const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'

    const { createClient } = supabase
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark')
    }  

    let allUsers = []
    let currentUser = null
    let mode = 'all'
    let sortType = 'streak'
    let currentAudio = null 
    let shopSounds = {} 

    async function init() {
        const { data: { session } } = await client.auth.getSession()
        if (!session) { window.location.href = 'index.html'; return }

        const { data: shopItems } = await client
            .from('shop_items')
            .select('image_url, audio_url')
    
        if (shopItems) {
            shopItems.forEach(item => {
                if (item.image_url && item.audio_url) {
                    shopSounds[item.image_url] = item.audio_url;
                }
            });
        }

        const { data: me } = await client
            .from('profiles')
            .select('name, "group", profile_bg, profile_avatar, wins, win_streak')
            .eq('id', session.user.id)
            .single()

        currentUser = me
        if (me) {
            document.getElementById('profile-name').textContent = me.name
            document.getElementById('wins-count').textContent = me.wins ?? 0
            document.getElementById('streak-count').textContent = me.win_streak ?? 0
            if (me.profile_avatar) document.getElementById('profile-avatar-img').src = me.profile_avatar
            if (me.profile_bg) {
                const btn = document.getElementById('profile-btn')
                btn.style.backgroundImage = `url('${me.profile_bg}')`
                btn.classList.add('has-bg')
            }
        }

        const { data: usersData } = await client
            .from('profiles')
            .select('name, "group", profile_bg, profile_avatar, wins, win_streak')

        allUsers = usersData || []
        render()
    }


    function setMode(m, btn) {
        mode = m
        document.querySelectorAll('.lb-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        render()
    }

    function setSort(s, btn) {
        sortType = s
        document.querySelectorAll('.lb-sort-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        render()
    }

    function render() {
        let users = [...allUsers]

        if (mode === 'groups') {
            const best = {}
            users.forEach(u => {
                const val = sortType === 'streak' ? 'win_streak' : 'wins'
                if (!best[u.group] || (u[val] || 0) > (best[u.group][val] || 0)) {
                    best[u.group] = u
                }
            })
            users = Object.values(best)
        }

        if (mode === 'my' && currentUser) {
            users = users.filter(u => u.group === currentUser.group)
        }

        users.sort((a, b) => {
            const valA = sortType === 'streak' ? (a.win_streak ?? 0) : (a.wins ?? 0)
            const valB = sortType === 'streak' ? (b.win_streak ?? 0) : (b.wins ?? 0)
            return valB - valA
        })

        const container = document.getElementById('leaders-list')
        container.innerHTML = ''

        if (users.length === 0) {
            container.innerHTML = '<div class="empty-state">Пока никого нет</div>'
            return
        }

        users.forEach((u, index) => {
            const isMe = currentUser && u.name === currentUser.name && u.group === currentUser.group
        
            let rankClass = ''
            let rankLabel = ''
            if (index === 0) { rankClass = 'rank-gold'; rankLabel = '🥇' }
            else if (index === 1) { rankClass = 'rank-silver'; rankLabel = '🥈' }
            else if (index === 2) { rankClass = 'rank-bronze'; rankLabel = '🥉' }
            else rankLabel = `${index + 1}`

            const el = document.createElement('div')
            el.className = `leader-card ${rankClass} ${isMe ? 'leader-card-me' : ''}`
            if (u.profile_bg) el.style.backgroundImage = `url('${u.profile_bg}')`

            el.innerHTML = `
                <div class="leader-overlay"></div>
                <div class="leader-inner">
                    <div class="leader-left">
                        <div class="leader-rank">${rankLabel}</div>
                        <div class="leader-avatar">
                            <img src="${u.profile_avatar || 'icons/profile-default.png'}" alt="${u.name}">
                        </div>
                        <div class="leader-text">
                            <div class="leader-name">${u.name}</div>
                            <div class="leader-group">${u.group}</div>
                        </div>
                    </div>
                    <div class="leader-stats">
                        <div class="stat-badge streak">
                            <img src="icons/streak.png"> <span>${u.win_streak ?? 0}</span>
                        </div>
                        <div class="stat-badge wins">
                            <img src="icons/wins.png"> <span>${u.wins ?? 0}</span>
                        </div>
                    </div>
                </div>`

            const soundUrl = shopSounds[u.profile_bg]; 
            let cardAudio = null;

            if (soundUrl) {
                cardAudio = new Audio(soundUrl);
                cardAudio.preload = 'auto';
            }

            el.onmouseenter = () => {
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }
                if (cardAudio) {
                    currentAudio = cardAudio;
                    currentAudio.play().catch(() => { /* бл*/ });
                }
            };

            el.onmouseleave = () => {
                if (cardAudio) {
                    cardAudio.pause();
                    cardAudio.currentTime = 0; // тут сброс звука
                }
                if (currentAudio === cardAudio) {
                    currentAudio = null;
                }
            };

            container.appendChild(el)
        })
    }

    function toggleDropdown(e) {
        e.stopPropagation()
        document.getElementById('profile-btn').classList.toggle('open')
    }

    document.addEventListener('click', (e) => {
        const profile = document.getElementById('profile-btn')
        if (profile && !profile.contains(e.target)) profile.classList.remove('open')
    })

    async function logout() {
        await client.auth.signOut()
        window.location.href = 'index.html'
    }


        if (typeof init === "function") window.init = init;
        if (typeof logout === "function") window.logout = logout;
        if (typeof render === "function") window.render = render;
        if (typeof setMode === "function") window.setMode = setMode;
        if (typeof setSort === "function") window.setSort = setSort;
        if (typeof toggleDropdown === "function") window.toggleDropdown = toggleDropdown;

    init()
  
  }

  if (page === "lectures") {
        if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark')

        const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'

        const { createClient } = supabase
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

        let currentUserId = null
        let currentMoney = 0
        let teacherPassword = null
        let isTeacher = false

        let allLessons = []
        let allSections = []
        let allLectures = []
        let completedLectureIds = []
        let currentLessonId = null
        let activeLectureBtn = null

        let quizQuestions = [], quizLectureId = null, quizOrder = [], quizIndex = 0
        let quizCorrect = 0, quizWrong = 0, quizSkipped = 0, quizTimer = null

        let editingLecture = null
        let originalJson = ''

        function shuffle(arr) {
          const a = [...arr]
          for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]]
          }
          return a
        }

        async function init() {
          const { data: { session } } = await client.auth.getSession()
          if (!session) { window.location.href = 'index.html'; return }
          currentUserId = session.user.id

          const { data, error } = await client
            .from('profiles')
            .select('name, profile_bg, profile_avatar, wins, win_streak, money')
            .eq('id', session.user.id)
            .single()

          if (error || !data) { window.location.href = 'index.html'; return }

          currentMoney = data.money ?? 0
          document.getElementById('profile-name').textContent = data.name
          document.getElementById('wins-count').textContent = data.wins ?? 0
          document.getElementById('streak-count').textContent = data.win_streak ?? 0
          if (data.profile_avatar) document.getElementById('profile-avatar-img').src = data.profile_avatar
          if (data.profile_bg) {
            const btn = document.getElementById('profile-btn')
            btn.style.backgroundImage = `url('${data.profile_bg}')`
            const img = document.createElement('img')
            img.src = data.profile_bg
            img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0;'
            btn.appendChild(img)
            btn.classList.add('has-bg')
          }

          await loadTeacherPassword()
          // Restore saved quiz results BEFORE the sidebar calculates locked lectures.
          if (!await loadCompletedLectures()) return
          await loadLessons()
        }

        async function loadTeacherPassword() {
          try {
            const { data, error } = await client.storage.from('config').download('teacher_password.txt')
            if (!error && data) teacherPassword = (await data.text()).trim()
          } catch {}
        }

        async function loadLessons() {
          const { data } = await client.from('lessons').select('id, name').order('id')
          allLessons = data || []

          const sel = document.getElementById('lesson-selector')
          sel.innerHTML = allLessons.map(l => `<option value="${l.id}">${l.name}</option>`).join('')

          if (allLessons.length > 0) {
            currentLessonId = allLessons[0].id
            sel.value = currentLessonId
            await loadSections()
          }
        }

        async function loadCompletedLectures() {
          const { data, error } = await client
            .from('quiz_results')
            .select('lecture_id')
            .eq('user_id', currentUserId)

          if (error) {
            console.error('Не удалось загрузить сохранённые результаты лекций:', error)
            // Do not render a misleading list with all lectures locked on network failure.
            document.getElementById('sections-list').innerHTML =
              '<div class="lecture-progress-error">Не удалось загрузить сохранённый прогресс. ' +
              '<button type="button" onclick="retryLectureProgress()">Повторить</button></div>'
            return false
          }

          // IDs from different queries can be numbers or strings. Compare consistently.
          completedLectureIds = [...new Set((data || [])
            .filter(row => row.lecture_id != null)
            .map(row => String(row.lecture_id)))]

          if (allSections.length > 0) renderSidebar()
          return true
        }

        async function retryLectureProgress() {
          if (!await loadCompletedLectures()) return
          if (currentLessonId) await loadSections()
          else await loadLessons()
        }

        async function onLessonChange() {
          currentLessonId = document.getElementById('lesson-selector').value
          activeLectureBtn = null
          document.getElementById('lecture-content').innerHTML = `
            <div class="lecture-placeholder">
              <div class="lecture-placeholder-icon">📖</div>
              <div class="lecture-placeholder-text">Выбери лекцию из меню слева</div>
            </div>`
          await loadSections()
        }

        async function loadSections() {
          if (!currentLessonId) return

          const { data: sections } = await client
            .from('sections')
            .select('id, title, order')
            .eq('lesson_id', currentLessonId)
            .order('order')

          const { data: lectures } = await client
            .from('lectures')
            .select('id, title, section_id, order')
            .eq('lesson_id', currentLessonId)
            .order('order')

          allSections = sections || []
          allLectures = lectures || []

          renderSidebar()
        }

        function renderSidebar() {
          const list = document.getElementById('sections-list')

          if (allSections.length === 0) {
            list.innerHTML = '<div class="u-ec614c789">Разделов пока нет</div>'
            return
          }

          let allPrevSectionDone = true

          list.innerHTML = ''
          allSections.forEach((section, sIdx) => {
            const sectionLectures = allLectures.filter(l => l.section_id === section.id)
            const sectionEl = document.createElement('div')
            sectionEl.className = 'section-item'

            let sectionAllDone = true
            let lecturesBtnHtml = ''

            sectionLectures.forEach((lec, lIdx) => {
              const isDone = completedLectureIds.includes(String(lec.id))
          
              let isLocked = false
              if (!allPrevSectionDone) {
                isLocked = true
              } else if (lIdx > 0) {
                const prevLec = sectionLectures[lIdx - 1]
                isLocked = !completedLectureIds.includes(String(prevLec.id))
              }

              if (isDone) isLocked = false
              if (!isDone) sectionAllDone = false

              if (isTeacher) {
                lecturesBtnHtml += `
                  <div class="lecture-btn-wrap">
                    <button class="lecture-btn ${isDone ? 'active' : ''}" onclick="loadLecture('${lec.id}', this)">
                      ${isDone ? '✅ ' : ''}${lec.title}
                    </button>
                    <button class="lecture-delete-btn" onclick="confirmDeleteLecture('${lec.id}', '${lec.title.replace(/'/g,"\\'")}', '${lec.section_id}')">✕</button>
                  </div>`
              } else if (isLocked) {
                lecturesBtnHtml += `
                  <div class="lecture-btn-wrap">
                    <button class="lecture-btn locked" disabled>
                      ${lec.title}
                    </button>
                    <span class="lecture-lock">🔒</span>
                  </div>`
              } else {
                lecturesBtnHtml += `
                  <div class="lecture-btn-wrap">
                    <button class="lecture-btn ${isDone ? '' : ''}" onclick="loadLecture('${lec.id}', this)">
                      ${isDone ? '✅ ' : ''}${lec.title}
                    </button>
                  </div>`
              }
            })

            if (sectionLectures.length === 0) {
              lecturesBtnHtml = '<div class="u-1e1a9436e">Лекций пока нет</div>'
            }

            const headerHtml = isTeacher
              ? `<div class="section-header-wrap">
                  <button class="section-toggle" onclick="toggleSection(this)">
                    ${section.title}<span class="section-arrow">▼</span>
                  </button>
                  <button class="section-delete-btn" onclick="confirmDeleteSection('${section.id}', '${section.title.replace(/'/g,"\\'")}')">🗑</button>
                </div>`
              : `<button class="section-toggle" onclick="toggleSection(this)">
                  ${section.title}<span class="section-arrow">▼</span>
                </button>`

            sectionEl.innerHTML = `
              ${headerHtml}
              <div class="section-lectures">
                ${lecturesBtnHtml}
              </div>`
            list.appendChild(sectionEl)

            if (!sectionAllDone) allPrevSectionDone = false
          })
        }

        function toggleSection(btn) {
          btn.classList.toggle('open')
          const lectures = btn.closest('.section-item').querySelector('.section-lectures')
          if (lectures) lectures.classList.toggle('open')
        }
    
        async function loadLecture(lectureId, btn) {
          if (activeLectureBtn) activeLectureBtn.classList.remove('active')
          activeLectureBtn = btn
          btn.classList.add('active')

          const content = document.getElementById('lecture-content')
          content.innerHTML = '<div class="lecture-placeholder"><div class="lecture-placeholder-text">Загрузка...</div></div>'

          const { data: lecture } = await client
            .from('lectures')
            .select('file_url, title')
            .eq('id', lectureId)
            .single()

          if (!lecture) {
            content.innerHTML = '<div class="lecture-placeholder"><div class="lecture-placeholder-text">Ошибка загрузки</div></div>'
            return
          }

          try {
            const res = await fetch(lecture.file_url + '?t=' + Date.now())
            const json = await res.json()

            const { data: existingResult } = await client
              .from('quiz_results')
              .select('*')
              .eq('user_id', currentUserId)
              .eq('lecture_id', lectureId)
              .single()

            renderLecture(json, lectureId, existingResult || null, lecture.file_url)
          } catch {
            content.innerHTML = '<div class="lecture-placeholder"><div class="lecture-placeholder-text">Ошибка чтения файла</div></div>'
          }
        }

        // All image src values can be either HTTPS URLs or paths relative to the JSON file.
        function resolveLectureImage(src, jsonUrl) {
          if (typeof src !== 'string' || !src.trim()) return ''
          try {
            const imageUrl = new URL(src.trim(), jsonUrl || window.location.href)
            if (imageUrl.protocol !== 'https:' && imageUrl.protocol !== 'http:') return ''
            return imageUrl.href
          } catch { return '' }
        }

        function lectureText(value) {
          return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
          })[ch])
        }

        function renderLecture(data, lectureId, existingResult, jsonUrl = '') {
          const content = document.getElementById('lecture-content')
          let blocksHtml = ''
          const blocks = Array.isArray(data.content) ? data.content : []
          blocks.forEach(block => {
            if (!block || typeof block !== 'object') return
            if (block.type === 'heading') {
              blocksHtml += `<div class="lecture-block-heading">${lectureText(block.text)}</div>`
            } else if (block.type === 'paragraph') {
              blocksHtml += `<p class="lecture-block-paragraph">${lectureText(block.text)}</p>`
            } else if (block.type === 'code') {
              blocksHtml += `<pre class="lecture-block-code"><code>${lectureText(block.text)}</code></pre>`
            } else if (block.type === 'image') {
              const src = resolveLectureImage(block.src || block.url, jsonUrl)
              if (!src) return
              const alt = lectureText(block.alt || block.caption || 'Иллюстрация к лекции')
              const caption = block.caption ? `<figcaption class="lecture-image-caption">${lectureText(block.caption)}</figcaption>` : ''
              blocksHtml += `<figure class="lecture-image-figure"><img class="lecture-block-image" src="${lectureText(src)}" alt="${alt}" loading="lazy" decoding="async">${caption}</figure>`
            }
          })

          const questions = Array.isArray(data.questions) ? data.questions : []
          const hasQ = questions.length > 0
          let btnHtml = ''
          if (hasQ) {
            if (existingResult) {
              btnHtml = `<button class="start-test-btn saved-test-result" id="start-test-btn">
                📊 Посмотреть результат (${lectureText(existingResult.percent)}%)
              </button>`
            } else {
              btnHtml = `<button class="start-test-btn" id="start-test-btn">🧪 Начать тест (${questions.length})</button>`
            }
          }

          content.innerHTML = `
            <div class="lecture-body">
              <h1>${lectureText(data.title)}</h1>
              ${data.description ? `<div class="lecture-description">${lectureText(data.description)}</div>` : ''}
              ${blocksHtml}
            </div>
            ${btnHtml}`

          if (hasQ) {
            document.getElementById('start-test-btn').onclick = () => {
              if (existingResult) showSavedResult(existingResult)
              else startQuiz(questions, lectureId)
            }
          }
        }

        function startQuiz(questions, lectureId) {
          if (!questions || !questions.length) return
          quizQuestions = questions
          quizLectureId = lectureId
          quizOrder = shuffle(questions.map((_, i) => i))
          quizIndex = quizCorrect = quizWrong = quizSkipped = 0
          document.getElementById('quiz-overlay').classList.add('active')
          showQuestion()
        }

        function showQuestion() {
          if (quizIndex >= quizOrder.length) { showResults(); return }
          clearInterval(quizTimer)
          const q = quizQuestions[quizOrder[quizIndex]]
          let timeLeft = 20, answered = false
          const opts = shuffle(q.options.map((o, i) => ({ text: o, idx: i })))

          document.getElementById('quiz-box').innerHTML = `
            <div class="quiz-top">
              <div class="u-753927c34">${quizIndex+1}/${quizOrder.length}</div>
              <div class="quiz-timer" id="quiz-timer">⏱ ${timeLeft}</div>
            </div>
            <div class="quiz-question">${q.question}</div>
            <div class="quiz-options">
              ${opts.map(o => `<button class="quiz-option" data-id="${o.idx}">${o.text}</button>`).join('')}
            </div>`

          document.querySelectorAll('.quiz-option').forEach(btn => {
            btn.onclick = () => {
              if (answered) return
              answered = true
              clearInterval(quizTimer)
              answerQ(parseInt(btn.dataset.id), q.answer)
            }
          })

          quizTimer = setInterval(() => {
            timeLeft--
            const el = document.getElementById('quiz-timer')
            if (!el) { clearInterval(quizTimer); return }
            el.textContent = `⏱ ${timeLeft}`
            if (timeLeft <= 5) el.classList.add('urgent')
            if (timeLeft <= 0) {
              if (answered) return
              answered = true
              clearInterval(quizTimer)
              quizSkipped++; quizIndex++; showQuestion()
            }
          }, 1000)
        }

        function answerQ(sel, correct) {
          if (sel === correct) quizCorrect++; else quizWrong++
          quizIndex++; showQuestion()
        }

        async function showResults() {
          const total = quizOrder.length
          const percent = total > 0 ? Math.round((quizCorrect / total) * 1000) / 10 : 0
          let reward = quizCorrect * 10
          const allOk = quizCorrect === total && quizSkipped === 0 && quizWrong === 0
          if (allOk) reward *= 2

          if (currentUserId) {
            const newMoney = currentMoney + reward
            await client.from('profiles').update({ money: newMoney }).eq('id', currentUserId)
            currentMoney = newMoney
            const { error: saveError } = await client.from('quiz_results').insert({
              user_id: currentUserId, lecture_id: quizLectureId,
              correct: quizCorrect, wrong: quizWrong, skipped: quizSkipped,
              total, percent, reward
            })
            if (!saveError) {
              const savedId = String(quizLectureId)
              if (!completedLectureIds.includes(savedId)) completedLectureIds.push(savedId)
              renderSidebar()
            } else {
              console.error('Не удалось сохранить результат теста:', saveError)
            }
          }

          window._lastQuizResult = { correct: quizCorrect, wrong: quizWrong, skipped: quizSkipped, total, percent, reward }
          renderResultsBox(window._lastQuizResult, allOk)
        }

        function showSavedResult(r) {
          document.getElementById('quiz-overlay').classList.add('active')
          renderResultsBox(r, r.correct === r.total && r.skipped === 0 && r.wrong === 0)
        }

        function renderResultsBox(r, allOk) {
          document.getElementById('quiz-box').innerHTML = `
            <div class="quiz-results">
              <div class="quiz-results-title">Результаты теста</div>
              <div class="quiz-results-score">${r.percent}%</div>
              <div class="quiz-results-grid">
                <div class="quiz-stat-card total"><div class="quiz-stat-label">Всего</div><div class="quiz-stat-value">${r.total}</div></div>
                <div class="quiz-stat-card correct"><div class="quiz-stat-label">Правильно</div><div class="quiz-stat-value">${r.correct}</div></div>
                <div class="quiz-stat-card wrong"><div class="quiz-stat-label">Неправильно</div><div class="quiz-stat-value">${r.wrong}</div></div>
                <div class="quiz-stat-card skipped"><div class="quiz-stat-label">Пропущено</div><div class="quiz-stat-value">${r.skipped}</div></div>
              </div>
              <div class="quiz-reward">
                ${allOk ? '🎉 Все правильно! Бонус x2!' : '💰 Награда'}
                <div class="quiz-reward-amount">+${r.reward} 🪙</div>
              </div>
              <button class="quiz-close-btn" onclick="closeQuiz()">Закрыть</button>
            </div>`
        }

        function closeQuiz() {
          clearInterval(quizTimer)
          document.getElementById('quiz-overlay').classList.remove('active')
          if (window._lastQuizResult && activeLectureBtn) {
            const r = window._lastQuizResult
            const btn = document.getElementById('start-test-btn')
            if (btn) {
              btn.style.background = 'linear-gradient(to right,#475569,#64748b)'
              btn.style.color = 'white'
              btn.textContent = `📊 Посмотреть результат (${r.percent}%)`
              btn.onclick = () => showSavedResult(r)
            }
            window._lastQuizResult = null
          }
        }

        function openPasswordModal() {
          if (isTeacher) {
            isTeacher = false
            document.getElementById('teacher-sidebar-btn').classList.remove('active')
            document.getElementById('teacher-sidebar-btn').textContent = '🔑 Преподаватель'
            document.getElementById('manage-btn').hidden = true
            document.getElementById('manage-btn').style.display = 'none'
            renderSidebar()
            return
          }
          document.getElementById('password-err').textContent = ''
          document.getElementById('teacher-pass-input').value = ''
          openModal('password-modal')
          setTimeout(() => document.getElementById('teacher-pass-input').focus(), 100)
        }

        function checkTeacherPassword() {
          const input = document.getElementById('teacher-pass-input').value
          const err = document.getElementById('password-err')
          if (!teacherPassword) { err.textContent = 'Пароль не загружен'; return }
          if (input === teacherPassword) {
            isTeacher = true
            closeModal('password-modal')
            document.getElementById('teacher-sidebar-btn').classList.add('active')
            document.getElementById('teacher-sidebar-btn').textContent = '✅ Режим преподавателя'
            document.getElementById('manage-btn').hidden = false
            document.getElementById('manage-btn').style.display = 'flex'
            renderSidebar()
          } else {
            err.textContent = 'Неверный пароль'
            document.getElementById('teacher-pass-input').value = ''
            document.getElementById('teacher-pass-input').focus()
          }
        }

        function confirmDeleteLecture(lecId, lecTitle, sectionId) {
          document.getElementById('confirm-title').textContent = 'Удалить лекцию?'
          document.getElementById('confirm-desc').textContent = `"${lecTitle}"`
          document.getElementById('confirm-ok-btn').onclick = () => deleteLecture(lecId)
          openModal('confirm-modal')
        }

        async function deleteLecture(lecId) {
          if (!isTeacher) return
          await client.from('quiz_results').delete().eq('lecture_id', lecId)
          await client.from('lectures').delete().eq('id', lecId)
          closeModal('confirm-modal')
          await loadSections()
        }

        function confirmDeleteSection(secId, secTitle) {
          document.getElementById('confirm-title').textContent = 'Удалить раздел?'
          document.getElementById('confirm-desc').textContent = `Раздел "${secTitle}" и ВСЕ его лекции будут удалены.`
          document.getElementById('confirm-ok-btn').onclick = () => {
            closeModal('confirm-modal')
            document.getElementById('confirm2-desc').textContent = `Вы собираетесь удалить раздел "${secTitle}" со всеми лекциями. Это действие необратимо!`
            document.getElementById('confirm2-ok-btn').onclick = () => deleteSection(secId)
            openModal('confirm2-modal')
          }
          openModal('confirm-modal')
        }

        async function deleteSection(secId) {
          if (!isTeacher) return
          const { data: lecs } = await client.from('lectures').select('id').eq('section_id', secId)
          if (lecs) {
            for (const l of lecs) {
              await client.from('quiz_results').delete().eq('lecture_id', l.id)
              await client.from('lectures').delete().eq('id', l.id)
            }
          }
          await client.from('sections').delete().eq('id', secId)
          closeModal('confirm2-modal')
          await loadSections()
        }

        async function openManageModal() {
          if (!isTeacher) {
            openPasswordModal()
            return
          }
          const addSel = document.getElementById('add-lesson-select')
          const editSel = document.getElementById('edit-lesson-select')
          addSel.innerHTML = '<option value="">— Выбери предмет —</option>'
          editSel.innerHTML = '<option value="">— Выбери предмет —</option>'
          allLessons.forEach(l => {
            addSel.innerHTML += `<option value="${l.id}">${l.name}</option>`
            editSel.innerHTML += `<option value="${l.id}">${l.name}</option>`
          })

          document.getElementById('add-lesson-select').value = ''
          document.getElementById('add-section-select').innerHTML = '<option value="">— Сначала выбери предмет —</option><option value="__new__">+ Создать новый раздел</option>'
          document.getElementById('new-section-wrap').style.display = 'none'
          document.getElementById('new-section-input').value = ''
          document.getElementById('add-lecture-title').value = ''
          document.getElementById('add-file-zone').textContent = '📄 Нажми чтобы выбрать .json файл'
          document.getElementById('add-file-zone').className = 'file-drop-zone'
          document.getElementById('add-file-input').value = ''
          document.getElementById('add-preview-wrap').style.display = 'none'
          document.getElementById('add-err').textContent = ''
          document.getElementById('add-success').textContent = ''
          selectedAddFile = null
          selectedAddJson = null

          openModal('manage-modal')
        }

        document.getElementById('add-lesson-select').addEventListener('change', async function() {
          const lessonId = this.value
          const sel = document.getElementById('add-section-select')
          sel.innerHTML = '<option value="">— Загрузка... —</option>'
          if (!lessonId) { sel.innerHTML = '<option value="">— Сначала выбери предмет —</option><option value="__new__">+ Создать новый раздел</option>'; return }
          const { data } = await client.from('sections').select('id, title').eq('lesson_id', lessonId).order('order')
          sel.innerHTML = '<option value="">— Выбери раздел —</option>'
          if (data) data.forEach(s => { sel.innerHTML += `<option value="${s.id}">${s.title}</option>` })
          sel.innerHTML += '<option value="__new__">+ Создать новый раздел</option>'
        })

        function onAddSectionChange() {
          const val = document.getElementById('add-section-select').value
          document.getElementById('new-section-wrap').style.display = val === '__new__' ? 'block' : 'none'
        }

        let selectedAddFile = null, selectedAddJson = null

        function onAddFileSelected() {
          const file = document.getElementById('add-file-input').files[0]
          if (!file) return
          selectedAddFile = file
          const reader = new FileReader()
          reader.onload = (e) => {
            try {
              selectedAddJson = JSON.parse(e.target.result)
              document.getElementById('add-file-zone').textContent = `✅ ${file.name}`
              document.getElementById('add-file-zone').className = 'file-drop-zone has-file'
              renderAddPreview(selectedAddJson)
            } catch {
              document.getElementById('add-err').textContent = 'Файл не является валидным JSON'
              selectedAddJson = null
            }
          }
          reader.readAsText(file)
        }

        function renderAddPreview(data) {
          let html = `<div class="preview-heading">${lectureText(data.title || 'Без названия')}</div>`
          if (data.description) html += `<div class="preview-paragraph">${lectureText(data.description)}</div>`
          if (Array.isArray(data.content)) {
            data.content.slice(0, 4).forEach(b => {
              if (b.type === 'heading') html += `<div class="preview-heading">${lectureText(b.text)}</div>`
              else if (b.type === 'paragraph') html += `<div class="preview-paragraph">${lectureText(b.text)}</div>`
              else if (b.type === 'code') html += `<pre class="preview-code">${lectureText(b.text)}</pre>`
              else if (b.type === 'image') html += `<div class="preview-paragraph">🖼️ Изображение: ${lectureText(b.caption || b.alt || b.src || b.url || '')}</div>`
            })
            if (data.content.length > 4) html += `<div class="preview-more">... ещё ${data.content.length - 4} блоков</div>`
          }
          if (data.questions?.length) html += `<div class="preview-questions">✅ ${data.questions.length} вопросов</div>`
          document.getElementById('add-preview-box').innerHTML = html
          document.getElementById('add-preview-wrap').style.display = 'block'
        }

        async function addLecture() {
          if (!isTeacher) return
          const lessonId = document.getElementById('add-lesson-select').value
          const sectionVal = document.getElementById('add-section-select').value
          const newSecTitle = document.getElementById('new-section-input').value.trim()
          const title = document.getElementById('add-lecture-title').value.trim()
          const err = document.getElementById('add-err')
          const success = document.getElementById('add-success')
          const btn = document.getElementById('add-confirm-btn')

          err.textContent = ''; success.textContent = ''

          if (!lessonId) { err.textContent = 'Выбери предмет!'; return }
          if (!sectionVal) { err.textContent = 'Выбери раздел!'; return }
          if (sectionVal === '__new__' && !newSecTitle) { err.textContent = 'Введи название нового раздела!'; return }
          if (!title) { err.textContent = 'Введи название лекции!'; return }
          if (!selectedAddJson || !selectedAddFile) { err.textContent = 'Выбери JSON файл!'; return }

          btn.disabled = true; btn.textContent = 'Сохранение...'

          try {
            let sectionId = sectionVal
            if (sectionVal === '__new__') {
              const { data: existingSecs } = await client.from('sections').select('order').eq('lesson_id', lessonId).order('order', { ascending: false }).limit(1)
              const maxOrder = existingSecs?.[0]?.order ?? 0
              const { data: newSec, error: secErr } = await client.from('sections').insert({ title: newSecTitle, lesson_id: lessonId, order: maxOrder + 1 }).select().single()
              if (secErr) { err.textContent = 'Ошибка создания раздела: ' + secErr.message; return }
              sectionId = newSec.id
            }

            const fileName = `${Date.now()}_${selectedAddFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
            const { error: uploadErr } = await client.storage.from('lectures').upload(fileName, selectedAddFile, { contentType: 'application/json' })
            if (uploadErr) { err.textContent = 'Ошибка загрузки: ' + uploadErr.message; return }

            const { data: urlData } = client.storage.from('lectures').getPublicUrl(fileName)

            const { data: existingLecs } = await client.from('lectures').select('order').eq('section_id', sectionId).order('order', { ascending: false }).limit(1)
            const maxLecOrder = existingLecs?.[0]?.order ?? 0

            const { error: lecErr } = await client.from('lectures').insert({ title, section_id: sectionId, lesson_id: lessonId, file_url: urlData.publicUrl, order: maxLecOrder + 1 })
            if (lecErr) { err.textContent = 'Ошибка добавления: ' + lecErr.message; return }

            success.textContent = '✅ Лекция добавлена!'
            btn.textContent = '✅ Добавлено'
            await loadSections()
            setTimeout(() => closeModal('manage-modal'), 1500)
          } catch (e) {
            err.textContent = 'Ошибка: ' + e.message
          } finally {
            btn.disabled = false
            if (btn.textContent === 'Сохранение...') btn.textContent = 'Добавить лекцию'
          }
        }

        function switchManageTab(tab, btn) {
          document.querySelectorAll('.manage-tab').forEach(b => b.classList.remove('active'))
          document.querySelectorAll('.manage-panel').forEach(p => p.classList.remove('active'))
          btn.classList.add('active')
          document.getElementById('tab-' + tab).classList.add('active')
        }

        async function loadEditSections() {
          const lessonId = document.getElementById('edit-lesson-select').value
          const sel = document.getElementById('edit-section-select')
          sel.innerHTML = '<option value="">— Загрузка —</option>'
          document.getElementById('edit-lecture-select').innerHTML = '<option value="">— Выбери раздел —</option>'
          document.getElementById('editor-wrap').style.display = 'none'
          if (!lessonId) return
          const { data } = await client.from('sections').select('id, title').eq('lesson_id', lessonId).order('order')
          sel.innerHTML = '<option value="">— Выбери раздел —</option>'
          if (data) data.forEach(s => { sel.innerHTML += `<option value="${s.id}">${s.title}</option>` })
        }

        async function loadEditLectures() {
          const sectionId = document.getElementById('edit-section-select').value
          const sel = document.getElementById('edit-lecture-select')
          sel.innerHTML = '<option value="">— Загрузка —</option>'
          document.getElementById('editor-wrap').style.display = 'none'
          if (!sectionId) return
          const { data } = await client.from('lectures').select('id, title, file_url').eq('section_id', sectionId).order('order')
          sel.innerHTML = '<option value="">— Выбери лекцию —</option>'
          if (data) data.forEach(l => { sel.innerHTML += `<option value="${l.id}" data-url="${l.file_url}">${l.title}</option>` })
        }

        async function loadEditLecture() {
          const sel = document.getElementById('edit-lecture-select')
          const opt = sel.options[sel.selectedIndex]
          if (!opt || !opt.dataset.url) { document.getElementById('editor-wrap').style.display = 'none'; return }

          document.getElementById('edit-err').textContent = ''
          document.getElementById('edit-success').textContent = ''

          try {
            const res = await fetch(opt.dataset.url + '?t=' + Date.now())
            const json = await res.json()
            const text = JSON.stringify(json, null, 2)
            originalJson = text
            editingLecture = { id: sel.value, url: opt.dataset.url }
            document.getElementById('json-editor').value = text
            document.getElementById('editor-wrap').style.display = 'block'
          } catch {
            document.getElementById('edit-err').textContent = 'Ошибка загрузки файла'
          }
        }

        function formatJson() {
          try {
            const parsed = JSON.parse(document.getElementById('json-editor').value)
            document.getElementById('json-editor').value = JSON.stringify(parsed, null, 2)
            document.getElementById('edit-err').textContent = ''
          } catch (e) {
            document.getElementById('edit-err').textContent = 'Ошибка JSON: ' + e.message
          }
        }

        function validateJson() {
          try {
            JSON.parse(document.getElementById('json-editor').value)
            document.getElementById('edit-success').textContent = '✅ JSON валидный'
            document.getElementById('edit-err').textContent = ''
          } catch (e) {
            document.getElementById('edit-err').textContent = 'Ошибка: ' + e.message
            document.getElementById('edit-success').textContent = ''
          }
        }

        function cancelEdit() {
          document.getElementById('json-editor').value = originalJson
          document.getElementById('edit-err').textContent = ''
          document.getElementById('edit-success').textContent = ''
        }

        async function saveEdit() {
          if (!isTeacher) return
          const text = document.getElementById('json-editor').value
          const err = document.getElementById('edit-err')
          const success = document.getElementById('edit-success')

          try {
            JSON.parse(text)
          } catch (e) {
            err.textContent = 'Ошибка JSON: ' + e.message; return
          }

          if (!editingLecture) return

          try {
            const urlParts = editingLecture.url.split('/')
            const fileName = urlParts[urlParts.length - 1].split('?')[0]

            const blob = new Blob([text], { type: 'application/json' })
            const { error } = await client.storage.from('lectures').update(fileName, blob, { contentType: 'application/json', upsert: true })

            if (error) { err.textContent = 'Ошибка сохранения: ' + error.message; return }

            originalJson = text
            success.textContent = '✅ Сохранено!'
            err.textContent = ''
          } catch (e) {
            err.textContent = 'Ошибка: ' + e.message
          }
        }

        function openModal(id) {
          if (id === 'manage-modal' && !isTeacher) { openPasswordModal(); return }
          document.getElementById(id).classList.add('active')
        }
        function closeModal(id) { document.getElementById(id).classList.remove('active') }

        document.addEventListener('click', function(e) {
          const profile = document.getElementById('profile-btn')
          if (profile && !profile.contains(e.target)) profile.classList.remove('open')

          ;['password-modal','confirm-modal','confirm2-modal','manage-modal'].forEach(id => {
            const el = document.getElementById(id)
            if (el && el.classList.contains('active') && e.target === el) closeModal(id)
          })
        })

        function toggleDropdown(e) {
          e.stopPropagation()
          document.getElementById('profile-btn').classList.toggle('open')
        }

        async function logout() {
          await client.auth.signOut()
          window.location.href = 'index.html'
        }

    
        if (typeof addLecture === "function") window.addLecture = addLecture;
        if (typeof answerQ === "function") window.answerQ = answerQ;
        if (typeof cancelEdit === "function") window.cancelEdit = cancelEdit;
        if (typeof checkTeacherPassword === "function") window.checkTeacherPassword = checkTeacherPassword;
        if (typeof closeModal === "function") window.closeModal = closeModal;
        if (typeof closeQuiz === "function") window.closeQuiz = closeQuiz;
        if (typeof confirmDeleteLecture === "function") window.confirmDeleteLecture = confirmDeleteLecture;
        if (typeof confirmDeleteSection === "function") window.confirmDeleteSection = confirmDeleteSection;
        if (typeof deleteLecture === "function") window.deleteLecture = deleteLecture;
        if (typeof deleteSection === "function") window.deleteSection = deleteSection;
        if (typeof formatJson === "function") window.formatJson = formatJson;
        if (typeof init === "function") window.init = init;
        if (typeof lectureText === "function") window.lectureText = lectureText;
        if (typeof loadCompletedLectures === "function") window.loadCompletedLectures = loadCompletedLectures;
        if (typeof retryLectureProgress === "function") window.retryLectureProgress = retryLectureProgress;
        if (typeof loadEditLecture === "function") window.loadEditLecture = loadEditLecture;
        if (typeof loadEditLectures === "function") window.loadEditLectures = loadEditLectures;
        if (typeof loadEditSections === "function") window.loadEditSections = loadEditSections;
        if (typeof loadLecture === "function") window.loadLecture = loadLecture;
        if (typeof loadLessons === "function") window.loadLessons = loadLessons;
        if (typeof loadSections === "function") window.loadSections = loadSections;
        if (typeof loadTeacherPassword === "function") window.loadTeacherPassword = loadTeacherPassword;
        if (typeof logout === "function") window.logout = logout;
        if (typeof onAddFileSelected === "function") window.onAddFileSelected = onAddFileSelected;
        if (typeof onAddSectionChange === "function") window.onAddSectionChange = onAddSectionChange;
        if (typeof onLessonChange === "function") window.onLessonChange = onLessonChange;
        if (typeof openManageModal === "function") window.openManageModal = openManageModal;
        if (typeof openModal === "function") window.openModal = openModal;
        if (typeof openPasswordModal === "function") window.openPasswordModal = openPasswordModal;
        if (typeof renderAddPreview === "function") window.renderAddPreview = renderAddPreview;
        if (typeof renderLecture === "function") window.renderLecture = renderLecture;
        if (typeof renderResultsBox === "function") window.renderResultsBox = renderResultsBox;
        if (typeof renderSidebar === "function") window.renderSidebar = renderSidebar;
        if (typeof resolveLectureImage === "function") window.resolveLectureImage = resolveLectureImage;
        if (typeof saveEdit === "function") window.saveEdit = saveEdit;
        if (typeof showQuestion === "function") window.showQuestion = showQuestion;
        if (typeof showResults === "function") window.showResults = showResults;
        if (typeof showSavedResult === "function") window.showSavedResult = showSavedResult;
        if (typeof shuffle === "function") window.shuffle = shuffle;
        if (typeof startQuiz === "function") window.startQuiz = startQuiz;
        if (typeof switchManageTab === "function") window.switchManageTab = switchManageTab;
        if (typeof toggleDropdown === "function") window.toggleDropdown = toggleDropdown;
        if (typeof toggleSection === "function") window.toggleSection = toggleSection;
        if (typeof validateJson === "function") window.validateJson = validateJson;

    init()
  
  }

  if (page === "main") {
        const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'

        const { createClient } = supabase
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

        if (localStorage.getItem('theme') === 'dark') {
          document.body.classList.add('dark')
        }  

        async function init() {
          const { data: { session } } = await client.auth.getSession()
          if (!session) { window.location.href = 'index.html'; return }

          const { data, error } = await client
            .from('profiles')
            .select('name, profile_bg, profile_avatar, wins, win_streak')
            .eq('id', session.user.id)
            .single()

          if (error || !data) { window.location.href = 'index.html'; return }

          document.getElementById('profile-name').textContent = data.name
          document.getElementById('wins-count').textContent = data.wins ?? 0
          document.getElementById('streak-count').textContent = data.win_streak ?? 0

          if (data.profile_avatar) {
            document.getElementById('profile-avatar-img').src = data.profile_avatar
          }

          if (data.profile_bg) {
            const btn = document.getElementById('profile-btn')
            btn.style.backgroundImage = `url('${data.profile_bg}')`

    const img = document.createElement('img')
    img.src = data.profile_bg
    img.style.position = 'absolute'
    img.style.inset = '0'
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'contain'
    img.style.zIndex = '0'

    btn.appendChild(img)

            btn.classList.add('has-bg')
          }
        }

        function toggleDropdown(e) {
          e.stopPropagation()
          document.getElementById('profile-btn').classList.toggle('open')
        }

        document.addEventListener('click', function(e) {
          const profile = document.getElementById('profile-btn')
          if (profile && !profile.contains(e.target)) profile.classList.remove('open')
        })

        async function logout() {
          await client.auth.signOut()
          window.location.href = 'index.html'
        }

    
        if (typeof init === "function") window.init = init;
        if (typeof logout === "function") window.logout = logout;
        if (typeof toggleDropdown === "function") window.toggleDropdown = toggleDropdown;

    init()
  
  }

  if (page === "quiz") {
        const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'
        const STORAGE_BASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co/storage/v1/object/public/quiz/'

        const { createClient } = supabase
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

        let currentUserId = null, currentMoney = 0, currentWins = 0, currentStreak = 0
        let allLessons = [], completedLectures = []
        let selectedLessonId = null, selectedDifficulty = 'easy', selectedCount = 10, selectedTime = 20
        let quizQuestions = [], quizIndex = 0, quizCorrect = 0, quizWrong = 0, quizLives = 3, quizTimer = null
        // Protect the setup screen from out-of-order Supabase responses.
        let setupRevision = 0, setupReady = false
        let availableDifficulties = { easy: true, medium: false, hard: false }
        let currentQuizFile = ''
        const quizDebug = new URLSearchParams(window.location.search).get('debugQuiz') === '1'

        async function init() {
          if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark')
      
          const { data: { session } } = await client.auth.getSession()
          if (!session) { window.location.href = 'index.html'; return }
          currentUserId = session.user.id

          const [profRes, lessonsRes, progRes] = await Promise.all([
            client.from('profiles').select('*').eq('id', currentUserId).single(),
            client.from('lessons').select('*').order('id'),
            client.from('quiz_results').select('lecture_id').eq('user_id', currentUserId)
          ])

          if (profRes.data) {
            const d = profRes.data
            currentMoney = d.money ?? 0
            currentWins = d.wins ?? 0
            currentStreak = d.win_streak ?? 0
        
            document.getElementById('profile-name').textContent = d.name
            document.getElementById('wins-count').textContent = currentWins
            document.getElementById('streak-count').textContent = currentStreak
        
            if (d.profile_avatar) {
              document.getElementById('profile-avatar-img').src = d.profile_avatar
            }

            if (d.profile_bg) {
              const btn = document.getElementById('profile-btn');
              if (btn) {
                btn.style.backgroundImage = `url('${d.profile_bg}')`;
                btn.classList.add('has-bg');

                let bgImg = btn.querySelector('.dynamic-bg');
                if (!bgImg) {
                  bgImg = document.createElement('img');
                  bgImg.className = 'dynamic-bg';
                  bgImg.style.position = 'absolute';
                  bgImg.style.inset = '0';
                  bgImg.style.width = '100%';
                  bgImg.style.height = '100%';
                  bgImg.style.objectFit = 'cover';
                  bgImg.style.zIndex = '0';
                  btn.appendChild(bgImg);
                }
                bgImg.src = d.profile_bg;
              }
            }
          }

          allLessons = lessonsRes.data || []
          completedLectures = progRes.data?.map(r => r.lecture_id) || []
      
          if (allLessons.length > 0) selectedLessonId = allLessons[0].id
      
          showSetup()
        }

        async function showSetup() {
          const layout = document.getElementById('quiz-page-layout')
          const revision = ++setupRevision
          const lessonId = selectedLessonId
          setupReady = false
          const existingStartButton = document.getElementById('start-btn')
          if (existingStartButton) existingStartButton.disabled = true

          let access = { easy: true, medium: false, hard: false }
          try {
            if (lessonId != null) {
              const { data: sections, error: sectionError } = await client
                .from('sections').select('id').eq('lesson_id', lessonId).order('order', { ascending: true })
              if (sectionError) throw sectionError
              if (sections && sections.length > 0) {
                const { data: l1, error: firstError } = await client.from('lectures').select('id').eq('section_id', sections[0].id)
                if (firstError) throw firstError
                if (l1 && l1.length > 0 && l1.every(lec => completedLectures.some(id => String(id) === String(lec.id)))) {
                  access.medium = true
                }
                if (sections.length > 1) {
                  const { data: l2, error: secondError } = await client.from('lectures').select('id').eq('section_id', sections[1].id)
                  if (secondError) throw secondError
                  if (l2 && l2.length > 0 && l2.every(lec => completedLectures.some(id => String(id) === String(lec.id)))) {
                    access.hard = true
                  }
                }
              }
            }
          } catch (error) {
            // The locked difficulties remain unavailable if progress cannot be read.
            console.warn('Не удалось проверить доступ к сложностям викторины', error)
          }

          // Never render stale settings over a more recent lesson/difficulty choice.
          if (revision !== setupRevision || String(lessonId) !== String(selectedLessonId)) return
          if (!access[selectedDifficulty]) selectedDifficulty = 'easy'
          availableDifficulties = access
          setupReady = true
          const currentLesson = allLessons.find(l => String(l.id) === String(selectedLessonId))
          const debugFile = currentLesson && currentLesson.quiz ? `${currentLesson.quiz}_${selectedDifficulty}_quiz.json` : 'не выбран'

          layout.innerHTML = `
            <div class="quiz-setup-box">
              <div class="quiz-setup-title">Настройка викторины</div>

              <div class="quiz-setup-section">
                <div class="quiz-setup-label">1. Выберите дисциплину</div>
                <select class="quiz-lesson-select" onchange="changeLesson(this.value)">
                  ${allLessons.map(l => `<option value="${l.id}" ${selectedLessonId == l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
                </select>
              </div>

              <div class="quiz-setup-section">
                <div class="quiz-setup-label">2. Сложность</div>
                <div class="quiz-setup-options">
                  <button class="quiz-setup-opt ${selectedDifficulty === 'easy' ? 'selected' : ''}" onclick="updateDifficulty('easy')">
                    <span>Легко</span>
                    <span class="difficulty-multiplier">x0.5</span>
                  </button>
                  <button class="quiz-setup-opt ${selectedDifficulty === 'medium' ? 'selected' : ''}" ${!access.medium ? 'disabled' : ''} onclick="updateDifficulty('medium')">
                    <span>Средне</span>
                    <span class="difficulty-multiplier">x1.0</span>
                  </button>
                  <button class="quiz-setup-opt ${selectedDifficulty === 'hard' ? 'selected' : ''}" ${!access.hard ? 'disabled' : ''} onclick="updateDifficulty('hard')">
                    <span>Сложно</span>
                    <span class="difficulty-multiplier">x2.0</span>
                  </button>
                </div>
              </div>

              <div class="quiz-setup-section">
                <div class="quiz-setup-label">3. Количество вопросов</div>
                <div class="quiz-setup-options">
                  <button class="quiz-setup-opt ${selectedCount === 10 ? 'selected' : ''}" onclick="updateCount(10)">10</button>
                  <button class="quiz-setup-opt ${selectedCount === 20 ? 'selected' : ''}" onclick="updateCount(20)">20</button>
                  <button class="quiz-setup-opt ${selectedCount === 30 ? 'selected' : ''}" onclick="updateCount(30)">30</button>
                </div>
              </div>

              <div class="quiz-setup-section">
                <div class="quiz-setup-label">4. Время на раздумья</div>
                <div class="quiz-setup-options">
                  <button class="quiz-setup-opt ${selectedTime === 15 ? 'selected' : ''}" onclick="updateTime(15)">15 сек</button>
                  <button class="quiz-setup-opt ${selectedTime === 20 ? 'selected' : ''}" onclick="updateTime(20)">20 сек</button>
                  <button class="quiz-setup-opt ${selectedTime === 30 ? 'selected' : ''}" onclick="updateTime(30)">30 сек</button>
                </div>
              </div>

              <button class="quiz-start-btn" id="start-btn" onclick="prepareQuiz()">Запустить викторину</button>
              <div id="setup-err" class="u-bef507196"></div>
              ${quizDebug ? `<p class="quiz-debug-source">Файл вопросов: <code>${debugFile}</code></p>` : ''}
            </div>`
        }

        function changeLesson(val) { selectedLessonId = val; showSetup(); }
        function updateDifficulty(val) {
          if (!['easy', 'medium', 'hard'].includes(val)) return
          selectedDifficulty = val
          showSetup()
        }
        function updateCount(val) { selectedCount = val; showSetup(); }
        function updateTime(val) { selectedTime = val; showSetup(); }

        async function prepareQuiz() {
          const btn = document.getElementById('start-btn')
          const err = document.getElementById('setup-err')
          // The same button is also used for «Ещё раз» on the result screen.
          const retryFromResults = !btn && !!document.querySelector('.quiz-result-box')
          if (!retryFromResults && (!setupReady || !btn || !err || btn.disabled)) return

          const lesson = allLessons.find(l => String(l.id) === String(selectedLessonId))
          const difficulty = selectedDifficulty
          const lessonId = selectedLessonId
          const count = selectedCount
          if (!lesson || !lesson.quiz) {
            if (err) err.textContent = '⚠️ Не указан файл викторины для выбранной дисциплины.'
            return
          }
          if (!availableDifficulties[difficulty]) {
            if (err) err.textContent = '⚠️ Эта сложность пока недоступна.'
            return
          }

          // Exactly ONE source file is used, matching the selected difficulty.
          const fileName = `${lesson.quiz}_${difficulty}_quiz.json`
          if (btn) btn.disabled = true
          if (err) err.textContent = ''
          const retryErr = document.getElementById('retry-err')
          if (retryErr) retryErr.textContent = ''
          try {
            // Query parameter avoids stale cached questions after JSON changes in Storage.
            const url = STORAGE_BASE_URL + encodeURI(fileName) + '?v=' + Date.now()
            console.info('[Викторина] Загрузка вопросов:', fileName)
            const res = await fetch(url, { cache: 'no-store' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const json = await res.json()
            const questions = json.questions
            if (!Array.isArray(questions) || !questions.length) {
              throw new Error('В файле нет массива questions с вопросами')
            }
            // A choice changed while the request was pending; ignore the old response.
            if (String(selectedLessonId) !== String(lessonId) || selectedDifficulty !== difficulty || (!setupReady && !retryFromResults)) return
            currentQuizFile = fileName
            quizQuestions = shuffle(questions).slice(0, Math.min(count, questions.length))
            setupReady = false
            ++setupRevision
            startQuizLoop()
          } catch (e) {
            console.error('[Викторина] Не удалось загрузить', fileName, e)
            if (String(selectedLessonId) === String(lessonId) && selectedDifficulty === difficulty) {
              const message = `⚠️ Не удалось загрузить вопросы уровня «${{easy:'Лёгкий',medium:'Средний',hard:'Сложный'}[difficulty]}» (${fileName}).`
              if (err) err.textContent = message
              if (retryErr) retryErr.textContent = message
              if (btn) btn.disabled = false
            }
          }
        }

        function shuffle(arr) {
          const a = [...arr];
          for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
          }
          return a;
        }

        function startQuizLoop() {
          quizIndex = 0; quizCorrect = 0; quizWrong = 0; quizLives = 3;
          showQuestion();
        }

        function showQuestion() {
          clearInterval(quizTimer);
          if (quizIndex >= quizQuestions.length) { showResults(true); return; }

          const q = quizQuestions[quizIndex];
          let timeLeft = selectedTime;
          let answered = false;
          const opts = shuffle(q.options.map((opt, i) => ({ text: opt, idx: i })));

          const layout = document.getElementById('quiz-page-layout');
          layout.innerHTML = `
            <div class="quiz-game-box">
              <div class="quiz-game-top">
                <div class="quiz-lives" id="lives-row">${renderHearts()}</div>
                <div class="quiz-game-counter" title="Источник: ${currentQuizFile}">${quizIndex + 1} / ${quizQuestions.length}</div>
                <div class="quiz-game-timer" id="qtimer">${timeLeft}</div>
              </div>
              <div class="quiz-timer-bar-wrap">
                <div class="quiz-timer-bar u-0466783d9" id="timer-bar"></div>
              </div>
              <div class="quiz-game-question">${q.question}</div>
              <div class="quiz-game-options">
                ${opts.map(opt => `<button class="quiz-game-option" data-id="${opt.idx}">${opt.text}</button>`).join('')}
              </div>
            </div>`;

          document.querySelectorAll('.quiz-game-option').forEach(btn => {
            btn.onclick = () => {
              if (answered) return;
              answered = true;
              clearInterval(quizTimer);
              const sel = parseInt(btn.dataset.id);
              if (sel === q.answer) {
                btn.classList.add('correct');
                quizCorrect++;
                setTimeout(() => { quizIndex++; showQuestion(); }, 600);
              } else {
                btn.classList.add('wrong');
                quizWrong++;
                loseLife(false);
              }
            }
          });

          quizTimer = setInterval(() => {
            timeLeft--;
            const tEl = document.getElementById('qtimer');
            const bEl = document.getElementById('timer-bar');
            if (!tEl) return clearInterval(quizTimer);
            tEl.textContent = timeLeft;
            if (bEl) bEl.style.width = `${(timeLeft / selectedTime) * 100}%`;
            if (timeLeft <= 0 && !answered) { answered = true; clearInterval(quizTimer); quizWrong++; loseLife(true); }
          }, 1000);
        }

        function renderHearts() {
          let h = '';
          for (let i = 0; i < 3; i++) h += `<span class="quiz-heart ${i >= quizLives ? 'lost' : ''}" aria-label="Жизнь">❤️</span>`;
          return h;
        }

        function loseLife(isTimeout) {
          quizLives--;
          if (quizLives <= 0) setTimeout(() => showResults(false), 600);
          else setTimeout(() => { quizIndex++; showQuestion(); }, 600);
        }

        async function showResults(won) {
          clearInterval(quizTimer);
          const total = quizQuestions.length;
          const percent = total > 0 ? Math.round((quizCorrect / total) * 100) : 0;
      
          let base = quizCorrect * 5 + 30 * quizLives;
          if (quizLives === 3) base += 100;

          const diffMult = selectedDifficulty === 'easy' ? 0.5 : selectedDifficulty === 'medium' ? 1 : 2;
          const streakMult = 1 + (currentStreak * 0.1);
          const timeMult = selectedTime === 15 ? 1.5 : selectedTime === 20 ? 1.25 : 1;

          let reward = Math.round(base * streakMult * timeMult * diffMult);
          if (quizLives === 3) reward = Math.round(reward * 1.5);

          let newStreak = won ? currentStreak + 1 : 0;
          let newWins = won ? currentWins + 1 : currentWins;
          let newMoney = currentMoney + reward;

          await client.from('profiles').update({ money: newMoney, wins: newWins, win_streak: newStreak }).eq('id', currentUserId);

          currentMoney = newMoney; currentWins = newWins; currentStreak = newStreak;
          document.getElementById('wins-count').textContent = newWins;
          document.getElementById('streak-count').textContent = newStreak;

          const layout = document.getElementById('quiz-page-layout');
          layout.innerHTML = `
            <div class="quiz-result-box">
              <div class="quiz-result-title">${won ? '🏆 Победа!' : '💔 Конец игры'}</div>
              <div class="quiz-result-score">${percent}%</div>
              <div class="quiz-result-grid">
                <div class="quiz-result-card correct"><div>Правильно</div><div>${quizCorrect}</div></div>
                <div class="quiz-result-card wrong"><div>Неправильно</div><div>${quizWrong}</div></div>
                <div class="quiz-result-card streak"><div>Стрик</div><div>${newStreak}</div></div>
                <div class="quiz-result-card info"><div>Сложность</div><div>${selectedDifficulty}</div></div>
              </div>
              <div class="quiz-result-reward">💰 Награда<div>+${reward} 🪙</div></div>
              <div class="u-6eca02d53">
                <button class="quiz-result-btn u-12401528d" onclick="showSetup()">← Назад</button>
                <button class="quiz-result-btn u-7623f0554" onclick="prepareQuiz()">Ещё раз</button>
              </div>
              <p id="retry-err" role="alert"></p>
            </div>`;
        }

        function toggleDropdown(e) { e.stopPropagation(); document.getElementById('profile-btn').classList.toggle('open'); }
        document.addEventListener('click', (e) => { const p = document.getElementById('profile-btn'); if (p && !p.contains(e.target)) p.classList.remove('open'); });
        async function logout() { await client.auth.signOut(); window.location.href = 'index.html'; }

    
        if (typeof changeLesson === "function") window.changeLesson = changeLesson;
        if (typeof init === "function") window.init = init;
        if (typeof logout === "function") window.logout = logout;
        if (typeof loseLife === "function") window.loseLife = loseLife;
        if (typeof prepareQuiz === "function") window.prepareQuiz = prepareQuiz;
        if (typeof renderHearts === "function") window.renderHearts = renderHearts;
        if (typeof showQuestion === "function") window.showQuestion = showQuestion;
        if (typeof showResults === "function") window.showResults = showResults;
        if (typeof showSetup === "function") window.showSetup = showSetup;
        if (typeof shuffle === "function") window.shuffle = shuffle;
        if (typeof startQuizLoop === "function") window.startQuizLoop = startQuizLoop;
        if (typeof toggleDropdown === "function") window.toggleDropdown = toggleDropdown;
        if (typeof updateCount === "function") window.updateCount = updateCount;
        if (typeof updateDifficulty === "function") window.updateDifficulty = updateDifficulty;
        if (typeof updateTime === "function") window.updateTime = updateTime;

    init();
  
  }

  if (page === "reset") {
        if (localStorage.getItem('theme') === 'dark') {
          document.body.classList.add('dark')
        }

        const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'

        const { createClient } = supabase
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

        function setMessage(text, isSuccess = false) {
          const el = document.getElementById('reset-message')
          el.textContent = text
          el.className = 'auth-message' + (isSuccess ? ' success' : '')
        }

        async function resetPassword() {
          const newPass = document.getElementById('new-password').value
          const confirm = document.getElementById('confirm-password').value

          if (!newPass || !confirm) {
            setMessage('Заполни оба поля!')
            return
          }

          if (newPass.length < 6) {
            setMessage('Пароль должен быть минимум 6 символов!')
            return
          }

          if (newPass !== confirm) {
            setMessage('Пароли не совпадают!')
            return
          }

          const { error } = await client.auth.updateUser({ password: newPass })

          if (error) {
            setMessage('Ошибка: ' + error.message)
            return
          }

          setMessage('✅ Пароль изменён! Перенаправляем...', true)
          setTimeout(() => window.location.href = 'index.html', 2000)
        }
  

        if (typeof resetPassword === "function") window.resetPassword = resetPassword;
        if (typeof setMessage === "function") window.setMessage = setMessage;
  }

  if (page === "settings") {
        const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'

        const { createClient } = supabase
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

        // Применяем тему сразу при загрузке
        if (localStorage.getItem('theme') === 'dark') {
          document.body.classList.add('dark')
        }

        let settingsUserId = null

        async function init() {
          const { data: { session } } = await client.auth.getSession()
          if (!session) { window.location.href = 'index.html'; return }
          settingsUserId = session.user.id

          const { data, error } = await client
            .from('profiles')
            .select('name, profile_bg, profile_avatar, wins, win_streak')
            .eq('id', session.user.id)
            .single()

          if (error || !data) { window.location.href = 'index.html'; return }

          document.getElementById('profile-name').textContent = data.name
          document.getElementById('profile-name-input').value = data.name || ''
          document.getElementById('wins-count').textContent = data.wins ?? 0
          document.getElementById('streak-count').textContent = data.win_streak ?? 0

          if (data.profile_avatar) document.getElementById('profile-avatar-img').src = data.profile_avatar

          if (data.profile_bg) {
            const btn = document.getElementById('profile-btn')
            btn.style.backgroundImage = `url('${data.profile_bg}')`
            const img = document.createElement('img')
            img.src = data.profile_bg
            img.style.position = 'absolute'
            img.style.inset = '0'
            img.style.width = '100%'
            img.style.height = '100%'
            img.style.objectFit = 'contain'
            img.style.zIndex = '0'
            btn.appendChild(img)
            btn.classList.add('has-bg')
          }

          // Устанавливаем состояние переключателя
          document.getElementById('dark-toggle').checked = localStorage.getItem('theme') === 'dark'
        }

        async function saveProfileName(event) {
          event.preventDefault()
          const message = document.getElementById('profile-name-message')
          const name = document.getElementById('profile-name-input').value.trim()
          if (name.length < 2 || name.length > 80) {
            message.textContent = 'Имя должно содержать от 2 до 80 символов.'
            return
          }
          if (!settingsUserId) { message.textContent = 'Сначала войди в аккаунт.'; return }
          const { error } = await client.from('profiles').update({ name }).eq('id', settingsUserId)
          if (error) { message.textContent = 'Ошибка сохранения: ' + error.message; return }
          document.getElementById('profile-name').textContent = name
          message.textContent = '✅ Имя сохранено.'
          // В метаданных Auth храним имя на случай восстановления профиля.
          try { await client.auth.updateUser({ data: { name, full_name: name } }) } catch (_) {}
        }

        document.getElementById('profile-name-form').addEventListener('submit', saveProfileName)

        function toggleTheme() {
          const isDark = document.getElementById('dark-toggle').checked
          if (isDark) {
            document.body.classList.add('dark')
            localStorage.setItem('theme', 'dark')
          } else {
            document.body.classList.remove('dark')
            localStorage.setItem('theme', 'light')
          }
        }

        function toggleDropdown(e) {
          e.stopPropagation()
          document.getElementById('profile-btn').classList.toggle('open')
        }

        document.addEventListener('click', function(e) {
          const profile = document.getElementById('profile-btn')
          if (profile && !profile.contains(e.target)) profile.classList.remove('open')
        })

        async function logout() {
          await client.auth.signOut()
          window.location.href = 'index.html'
        }

    
        if (typeof init === "function") window.init = init;
        if (typeof logout === "function") window.logout = logout;
        if (typeof toggleDropdown === "function") window.toggleDropdown = toggleDropdown;
        if (typeof toggleTheme === "function") window.toggleTheme = toggleTheme;

    init()
  
  }

  if (page === "shop") {
    const SUPABASE_URL = 'https://rnijptnxsheusvxepiht.supabase.co'
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWpwdG54c2hldXN2eGVwaWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODgyMTUsImV4cCI6MjA5MTA2NDIxNX0.TZ9u8fJXhS02UX9ulQARcr_ITV4FAOMMaboOOPZzo5w'

    const { createClient } = supabase
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

    if (localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark')
    }

    let currentUser = null
    let currentMode = 'buy'
    let currentCategory = 'background'
    let ownedIds = []
    let activeBg = null
    let activeAvatar = null
    let shopSounds = {}
    let currentAudio = null

    async function init() {
      const { data: { session } } = await client.auth.getSession()
      if (!session) { window.location.href = 'index.html'; return }

      const { data: shopItemsData } = await client
        .from('shop_items')
        .select('image_url, audio_url')
  
      if (shopItemsData) {
        shopItemsData.forEach(item => {
          if (item.image_url && item.audio_url) {
            shopSounds[item.image_url] = item.audio_url
          }
        })
      }

      const { data, error } = await client
        .from('profiles')
        .select('name, money, profile_bg, profile_avatar, wins, win_streak')
        .eq('id', session.user.id)
        .single()

      if (error || !data) { window.location.href = 'index.html'; return }

      currentUser = session.user
      activeBg = data.profile_bg ?? null
      activeAvatar = data.profile_avatar ?? null

      document.getElementById('profile-name').textContent = data.name;
      document.getElementById('user-money').textContent = data.money ?? 0;
      document.getElementById('wins-count').textContent = data.wins ?? 0;
      document.getElementById('streak-count').textContent = data.win_streak ?? 0;

      if (data.profile_avatar) {
        document.getElementById('profile-avatar-img').src = data.profile_avatar
      }

      if (data.profile_bg) {
        updateProfileBgDisplay(data.profile_bg);
      }

      await loadOwned()
      await loadItems()
    }

    function updateProfileBgDisplay(url) {
      const btn = document.getElementById('profile-btn');
      if (!btn) return;
      const existingImgs = btn.querySelectorAll('img:not(#profile-avatar-img)');
      existingImgs.forEach(el => el.remove());
      if (url) {
        btn.style.backgroundImage = `url('${url}')`;
        btn.style.backgroundSize = 'cover';
        btn.style.backgroundPosition = 'center';
        const img = document.createElement('img');
        img.src = url;
        img.style.position = 'absolute';
        img.style.inset = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain'; 
        img.style.zIndex = '0';
        btn.appendChild(img);
        btn.classList.add('has-bg');
      } else {
        btn.style.backgroundImage = '';
        btn.classList.remove('has-bg');
      }
    }

    async function loadOwned() {
      const { data } = await client
        .from('owned_avatars')
        .select('item_id')
        .eq('user_id', currentUser.id)
      ownedIds = data ? data.map(d => d.item_id) : []
    }

    function setMode(mode) {
      currentMode = mode
      document.getElementById('btn-buy').classList.toggle('active', mode === 'buy')
      document.getElementById('btn-inventory').classList.toggle('active', mode === 'inventory')
      updateTitle()
      loadItems()
    }

    function setCategory(category, btn) {
      currentCategory = category
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      updateTitle()
      loadItems()
    }

    function updateTitle() {
      const modeLabel = currentMode === 'buy' ? 'Купить' : 'Инвентарь'
      const catLabel = currentCategory === 'background' ? 'Фон профиля' : 'Фото профиля'
      document.getElementById('shop-title').textContent = `${modeLabel} — ${catLabel}`
    }

    async function loadItems() {
      if (currentMode === 'buy') await loadShopItems()
      else await loadInventory()
    }

    async function loadShopItems() {
      const grid = document.getElementById('items-grid')
      grid.innerHTML = '<p class="u-ebbc48fd8">Загрузка...</p>'
      const { data: cases, error } = await client.from('cases').select('*')
      if (error || !cases || cases.length === 0) {
        grid.innerHTML = `<div class="empty-state">Нет доступных кейсов</div>`
        return
      }
      grid.innerHTML = ''
      for (const c of cases) {
        const { data: items } = await client.from('shop_items').select('*').eq('case_id', c.id)
        if (!items || !items.some(i => i.type === currentCategory)) continue
        grid.innerHTML += `
          <div class="item-card">
            ${c.image_url ? `<img class="item-img" src="${c.image_url}">` : `<div class="item-img-placeholder">📦</div>`}
            <div class="item-info">
              <div class="item-name">${c.name}</div>
              <div class="item-price"><span class="item-price-coin">🪙</span> ${c.price}</div>
              <div class="u-49cd09213">
                <button class="item-btn" onclick="openCasePreview('${c.id}')">?</button>
                <button class="item-btn buy" onclick="handleOpenCase('${c.id}', ${c.price})">Открыть</button>
              </div>
            </div>
          </div>`
      }
    }

    async function loadInventory() {
      const grid = document.getElementById('items-grid');
      grid.innerHTML = '<p class="u-ebbc48fd8">Загрузка предметов и звуков...</p>';

      const { data: ownedData } = await client
        .from('owned_avatars')
        .select('item_id')
        .eq('user_id', currentUser.id)
        .eq('type', currentCategory);

      const ownedOfType = ownedData ? ownedData.map(d => d.item_id) : [];

      if (ownedOfType.length === 0) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎒</div><div class="empty-state-text">Инвентарь пуст</div></div>`;
        return;
      }

      const { data, error } = await client.from('shop_items').select('*').in('id', ownedOfType);
      if (error || !data) { grid.innerHTML = 'Ошибка загрузки'; return; }

      grid.innerHTML = '';

      const promises = data.map(item => {
        return new Promise((resolve) => {
          const isEquipped = currentCategory === 'background' ? activeBg === item.image_url : activeAvatar === item.image_url;
          const soundUrl = shopSounds[item.image_url];
      
          const card = document.createElement('div');
          card.className = 'item-card';
          card.style.opacity = '0'; 
          card.style.transition = 'opacity 0.3s ease';

          const img = document.createElement('img');
          img.className = 'item-img';
          img.src = item.image_url || '';

          const info = document.createElement('div');
          info.className = 'item-info';
          info.innerHTML = `
            <div class="item-name">${item.name}</div>
            ${isEquipped 
              ? `<button class="item-btn equipped" disabled>✨ Активно</button>
                 <button class="item-btn unequip" onclick="unequipItem('${item.type}')">Снять</button>`
              : `<button class="item-btn equip" onclick="equipItem('${item.image_url}', '${item.name}', '${item.type}')">Надеть</button>`}
          `;

          card.appendChild(img);
          card.appendChild(info);

          if (soundUrl) {
            const audio = new Audio(soundUrl);
            audio.preload = 'auto';

            audio.addEventListener('canplaythrough', () => {
              card.style.opacity = '1';
              resolve();
            }, { once: true });

            setTimeout(() => { card.style.opacity = '1'; resolve(); }, 2000);

            img.onmouseenter = () => {
              if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; }
              currentAudio = audio;
              currentAudio.play().catch(() => {});
            };

            img.onmouseleave = () => {
              audio.pause();
              audio.currentTime = 0;
              if (currentAudio === audio) currentAudio = null;
            };
          } else {
            card.style.opacity = '1';
            resolve();
          }

          grid.appendChild(card);
        });
      });

      await Promise.all(promises);
    }

    async function handleOpenCase(caseId, price) {
      const { data: profile } = await client.from('profiles').select('money').eq('id', currentUser.id).single();
      if (profile.money < price) { showToast('Недостаточно монет!', 'error'); return; }
      await client.from('profiles').update({ money: profile.money - price }).eq('id', currentUser.id);
      document.getElementById('user-money').textContent = profile.money - price;
      const { data: items } = await client.from('shop_items').select('*').eq('case_id', caseId);
      const win = rollItem(items);
      await client.from('owned_avatars').insert({ user_id: currentUser.id, item_id: win.id, type: win.type });
      startRouletteAnimation(items, win);
    }

    function rollItem(items) {
      const total = items.reduce((sum, i) => sum + (i.chance || 0), 0)
      const random = Math.random() * total
      let current = 0
      for (const item of items) {
        current += (item.chance || 0)
        if (random <= current) return item
      }
      return items[0]
    }

    async function openCasePreview(caseId) {
      const { data: items } = await client.from('shop_items').select('*').eq('case_id', caseId);
      if (!items) return;
      const total = items.reduce((sum, i) => sum + (i.chance || 0), 0);
      let html = `<div class="u-c5c3aa138"><h3 class="u-15ed03f85">Содержимое кейса</h3><div class="custom-scroll u-dd2794aec">`;
      items.forEach(i => {
        const percent = ((i.chance || 0) / total * 100).toFixed(1);
        html += `<div class="u-c39dfa717"><img src="${i.image_url}" class="u-59615fb9a"><div class="u-72e4ac0b6">${i.name}</div><div class="u-d73b38bce">${percent}%</div></div>`;
      });
      html += `</div><button class="item-btn u-a426bfcc8" onclick="closeModal()">Понятно</button></div>`;
      showModal(html);
    }

    function startRouletteAnimation(items, winItem) {
      const modal = document.createElement('div');
      modal.id = 'modal';
      modal.style = "position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;";
      modal.innerHTML = `<div class="u-e3011ff00"><div id="roulette-track" class="u-58546d264"></div><div class="u-2f0b8bffb"></div></div><p class="u-2e1a67308">Удача улыбается тебе...</p>`;
      document.body.appendChild(modal);
      const track = document.getElementById('roulette-track');
      const totalItemsCount = 100; winIndex = 80; const elements = [];
      for (let i = 0; i < totalItemsCount; i++) { elements.push(items[Math.floor(Math.random() * items.length)]); }
      elements[winIndex] = winItem;
      track.innerHTML = elements.map(i => `<div class="u-768b2e86b"><img src="${i.image_url}" class="u-43ce3d93f"></div>`).join('');
      const rollSound = new Audio('sounds/caseroll.mp3'); const resultSound = new Audio('sounds/caseresult.mp3');
      const animationDuration = 7.3;
      rollSound.play().catch(() => {});
      setTimeout(() => {
        track.style.transition = `transform ${animationDuration}s cubic-bezier(0.15, 0, 0.05, 1)`;
        const itemWidth = 130; const centerOffset = 300 - (itemWidth / 2);
        const finalShift = (winIndex * itemWidth) - centerOffset + (Math.floor(Math.random() * 80) - 40);
        track.style.transform = `translateX(-${finalShift}px)`;
      }, 50);
      setTimeout(() => {
        rollSound.pause(); rollSound.currentTime = 0;
        resultSound.play().catch(() => {});
        modal.remove(); showWin(winItem); loadOwned();
      }, (animationDuration * 1000));
    }

    function showWin(item) {
      showModal(`<div class="u-aa64fb7bb"><h2 class="u-d462248a4">Выпал предмет!</h2><img src="${item.image_url}" width="150" height="150" class="u-5cdfbdc7b"><h3>${item.name}</h3><button class="item-btn buy u-824efce4e" onclick="closeModal()">Ура!</button></div>`)
    }

    async function equipItem(imageUrl, itemName, type) {
      const field = type === 'background' ? 'profile_bg' : 'profile_avatar'
      await client.from('profiles').update({ [field]: imageUrl }).eq('id', currentUser.id)
      if (type === 'background') { activeBg = imageUrl; updateProfileBgDisplay(imageUrl) }
      else { activeAvatar = imageUrl; document.getElementById('profile-avatar-img').src = imageUrl }
      showToast(`✨ Надето: ${itemName}`); loadInventory()
    }

    async function unequipItem(type) {
      const field = type === 'background' ? 'profile_bg' : 'profile_avatar'
      await client.from('profiles').update({ [field]: null }).eq('id', currentUser.id)
      if (type === 'background') { activeBg = null; updateProfileBgDisplay(null) }
      else { activeAvatar = null; document.getElementById('profile-avatar-img').src = 'icons/profile-default.png' }
      showToast('Снято'); loadInventory()
    }

    function showModal(html) {
      closeModal(); const modal = document.createElement('div'); modal.id = 'modal'
      modal.style = "position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;"
      modal.innerHTML = html; document.body.appendChild(modal)
    }

    function closeModal() { const m = document.getElementById('modal'); if (m) m.remove() }

    function showToast(msg, type = 'success') {
      const toast = document.getElementById('toast'); toast.textContent = msg
      toast.className = `toast ${type} show`; setTimeout(() => toast.classList.remove('show'), 3000)
    }

    function toggleDropdown(e) { e.stopPropagation(); document.getElementById('profile-btn').classList.toggle('open') }

    document.addEventListener('click', (e) => {
      const profile = document.getElementById('profile-btn')
      if (profile && !profile.contains(e.target)) profile.classList.remove('open')
    })

    async function logout() { await client.auth.signOut(); window.location.href = 'index.html' }


        if (typeof closeModal === "function") window.closeModal = closeModal;
        if (typeof equipItem === "function") window.equipItem = equipItem;
        if (typeof handleOpenCase === "function") window.handleOpenCase = handleOpenCase;
        if (typeof init === "function") window.init = init;
        if (typeof loadInventory === "function") window.loadInventory = loadInventory;
        if (typeof loadItems === "function") window.loadItems = loadItems;
        if (typeof loadOwned === "function") window.loadOwned = loadOwned;
        if (typeof loadShopItems === "function") window.loadShopItems = loadShopItems;
        if (typeof logout === "function") window.logout = logout;
        if (typeof openCasePreview === "function") window.openCasePreview = openCasePreview;
        if (typeof rollItem === "function") window.rollItem = rollItem;
        if (typeof setCategory === "function") window.setCategory = setCategory;
        if (typeof setMode === "function") window.setMode = setMode;
        if (typeof showModal === "function") window.showModal = showModal;
        if (typeof showToast === "function") window.showToast = showToast;
        if (typeof showWin === "function") window.showWin = showWin;
        if (typeof startRouletteAnimation === "function") window.startRouletteAnimation = startRouletteAnimation;
        if (typeof toggleDropdown === "function") window.toggleDropdown = toggleDropdown;
        if (typeof unequipItem === "function") window.unequipItem = unequipItem;
        if (typeof updateProfileBgDisplay === "function") window.updateProfileBgDisplay = updateProfileBgDisplay;
        if (typeof updateTitle === "function") window.updateTitle = updateTitle;

    init()
  
  }

})();
