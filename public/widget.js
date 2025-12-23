(function() {
    console.log(">>> Widget.js (v11.0 傳送按鈕 + 燈箱版) 啟動...");

    function renderUI() {
        if (document.getElementById('cb-container')) return;

        var style = document.createElement('style');
        style.innerHTML = `
            #cb-container { position: fixed; right: 20px; bottom: 48px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; pointer-events: auto; font-family: sans-serif; }
            #cb-btn { width: 60px; height: 60px; background: #0084ff; border-radius: 50%; color: white; border: 2px solid white; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-size: 30px; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
            #cb-btn:active { transform: scale(0.95); }
            
            #cb-box { width: 340px; height: 480px; background: white; border-radius: 12px; overflow: hidden; display: none; flex-direction: column; border: 1px solid #eee; box-shadow: 0 5px 20px rgba(0,0,0,0.2); transform-origin: bottom right; animation: cbPop 0.2s ease-out; }
            @keyframes cbPop { from{opacity:0;transform:scale(0.8);} to{opacity:1;transform:scale(1);} }
            
            @media (max-width: 768px) { 
                #cb-container { bottom: 60px !important; right: 20px !important; } 
                #cb-btn { width: 55px; height: 55px; } 
                #cb-box { position: fixed; bottom: 0; right: 0; width: 100%; height: 100%; z-index: 2147483649; border-radius: 0; } 
                #cb-close-mobile { display: block !important; cursor: pointer; font-size: 24px; padding: 0 10px;} 
            }

            #cb-head { background: #0084ff; color: white; padding: 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;}
            #cb-list { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; background: #f9f9f9; }
            
            /* 訊息氣泡 */
            .cb-msg-row { display: flex; flex-direction: column; max-width: 80%; margin-bottom: 8px; }
            .cb-msg-row.user { align-self: flex-end; align-items: flex-end; }
            .cb-msg-row.admin { align-self: flex-start; align-items: flex-start; }
            
            .cb-msg { padding: 10px 14px; border-radius: 18px; font-size: 15px; word-break: break-word; position: relative; }
            .cb-msg.user { background: #0084ff; color: white; border-bottom-right-radius: 4px; }
            .cb-msg.admin { background: #e4e6eb; color: #050505; border-bottom-left-radius: 4px; }
            
            /* 圖片樣式 */
            .cb-msg.image { background: transparent !important; padding: 0; }
            .cb-msg-img { max-width: 150px; border-radius: 8px; cursor: zoom-in; border: 2px solid #ddd; }

            .cb-time { font-size: 10px; color: #999; margin-top: 2px; margin-left: 4px; margin-right: 4px; }

            .typing-indicator { font-size: 12px; color: #888; padding: 5px 10px; display: none; font-style: italic; }
            .typing-dots::after { content: '...'; animation: typing 1.5s infinite; }
            @keyframes typing { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }

            /* Footer 設定 */
            #cb-footer { padding: 10px; border-top: 1px solid #ddd; background: #fff; display: flex; align-items: center; gap: 8px; }
            #cb-input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 20px; outline: none; background: #f0f2f5; font-size: 16px; }
            
            /* 按鈕樣式 */
            #cb-upload-btn { cursor: pointer; font-size: 24px; color: #888; padding: 0 5px; line-height: 1; }
            #cb-file-input { display: none; }
            
            /* ★ 新增：傳送按鈕 (SVG) */
            #cb-send-btn { 
                width: 36px; height: 36px; 
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; border-radius: 50%; color: #0084ff;
                transition: background 0.1s;
            }
            #cb-send-btn:active { background: #f0f0f0; }
            #cb-send-btn svg { width: 24px; height: 24px; fill: currentColor; transform: rotate(-45deg); margin-left: -2px; margin-top: 2px; }

            /* ★ 新增：燈箱樣式 */
            #cb-image-modal {
                display: none; position: fixed; z-index: 2147483650;
                left: 0; top: 0; width: 100%; height: 100%;
                background-color: rgba(0,0,0,0.9);
                justify-content: center; align-items: center;
                backdrop-filter: blur(5px);
                animation: cbFadeIn 0.2s;
            }
            #cb-modal-img {
                max-width: 95%; max-height: 95%;
                border-radius: 4px;
                object-fit: contain;
                animation: cbZoomIn 0.2s;
            }
            #cb-close-modal {
                position: absolute; top: 20px; right: 20px;
                color: #fff; font-size: 30px; font-weight: bold;
                cursor: pointer; z-index: 2147483651; background: rgba(0,0,0,0.5);
                width: 40px; height: 40px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
            }
            @keyframes cbFadeIn { from {opacity:0;} to {opacity:1;} }
            @keyframes cbZoomIn { from {transform:scale(0.9);} to {transform:scale(1);} }
        `;
        document.head.appendChild(style);

        var container = document.createElement('div');
        container.id = 'cb-container';
        container.innerHTML = `
            <div id="cb-image-modal">
                <span id="cb-close-modal">&times;</span>
                <img id="cb-modal-img">
            </div>

            <div id="cb-box">
                <div id="cb-head"><span>客服中心</span><span id="cb-close-mobile" style="display:none;">&times;</span></div>
                <div id="cb-list"><div style="text-align:center;color:#999;padding:20px;">連線中...</div></div>
                <div class="typing-indicator">對方正在輸入<span class="typing-dots"></span></div>
                <div id="cb-footer">
                    <label for="cb-file-input" id="cb-upload-btn">📷</label>
                    <input type="file" id="cb-file-input" accept="image/*">
                    
                    <input id="cb-input" placeholder="輸入訊息...">
                    
                    <div id="cb-send-btn">
                        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </div>
                </div>
            </div>
            <button id="cb-btn">💬</button>
        `;
        document.documentElement.appendChild(container);

        var btn = document.getElementById('cb-btn');
        var box = document.getElementById('cb-box');
        var closeMobile = document.getElementById('cb-close-mobile');
        
        // 燈箱控制
        var modal = document.getElementById('cb-image-modal');
        var closeBtn = document.getElementById('cb-close-modal');
        
        modal.onclick = function() { modal.style.display = "none"; };
        closeBtn.onclick = function() { modal.style.display = "none"; };

        window.cbShowImage = function(src) {
            var modalImg = document.getElementById('cb-modal-img');
            modal.style.display = "flex";
            modalImg.src = src;
        };

        function toggle() { var isHidden = (box.style.display === 'none' || box.style.display === ''); box.style.display = isHidden ? 'flex' : 'none'; if (window.innerWidth <= 768) document.body.style.overflow = isHidden ? 'hidden' : ''; }
        btn.onclick = toggle; closeMobile.onclick = toggle;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderUI);
    else renderUI();
    
    // --- Config ---
    var config = window.ChatWidgetConfig || {};
    if (!config.shopId) { var s = document.currentScript; if(s) config.shopId = s.getAttribute('data-shop-id'); }
    if (!config.shopId) return;

    var shopId = config.shopId;
    var token = config.token;
    var userId = config.userId;
    var userName = config.userName;
    var signature = config.signature; 
    
    var autoReplyEnabled = config.autoReplyEnabled; 
    var offlineMsg = config.offlineMsg || "現在是非營業時間，我們會盡快回覆您。";
    var startHour = parseInt(config.startHour || "9");
    var endHour = parseInt(config.endHour || "18");

    var GUEST_KEY = "chat_guest_id_" + shopId;
    if (!userId) {
        var saved = localStorage.getItem(GUEST_KEY);
        if (saved) { userId = saved; userName = '訪客 (回訪)'; }
    }

    var script = document.createElement('script');
    script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    
    script.onload = function() {
        var SERVER_URL = 'https://customer-support-xtpx.onrender.com';
        var socket = io(SERVER_URL, {
            auth: { shopId, token, userId, userName, signature, isAdmin: false },
            transports: ['websocket', 'polling'], 
        });

        socket.on('connect', function() {
            var list = document.getElementById('cb-list');
            var btn = document.getElementById('cb-btn');
            if(list) list.innerHTML = ''; 
            if(btn) btn.style.borderColor = '#00ff00';
        });

        socket.on('forceGuestMode', function(data) {
            userId = data.userId;
            localStorage.setItem(GUEST_KEY, data.userId);
        });

        function addMsg(msg) {
            var list = document.getElementById('cb-list');
            if(!list) return;

            var date = new Date(msg.timestamp);
            var timeStr = date.getHours().toString().padStart(2, '0') + ":" + date.getMinutes().toString().padStart(2, '0');

            var row = document.createElement('div');
            row.className = "cb-msg-row " + msg.sender;
            
            let contentHtml = '';
            if (msg.msgType === 'image') {
                // ★ 改成點擊觸發 cbShowImage()
                contentHtml = `<div class="cb-msg image ${msg.sender}">
                    <img src="${msg.text}" class="cb-msg-img" onclick="window.cbShowImage(this.src)">
                </div>`;
            } else {
                contentHtml = `<div class="cb-msg ${msg.sender}">${msg.text}</div>`;
            }

            row.innerHTML = `${contentHtml}<div class="cb-time">${timeStr}</div>`;
            list.appendChild(row);
            list.scrollTop = list.scrollHeight;
        }
        
        socket.on('history', function(msgs) { 
            var list = document.getElementById('cb-list');
            if(list) { list.innerHTML=''; msgs.forEach(addMsg); }
        });
        
        socket.on('newMessage', addMsg);

        var typingTimeout;
        socket.on('displayTyping', function(data) {
            var indicator = document.querySelector('.typing-indicator');
            if (!indicator) return;
            if (data.isTyping) {
                indicator.style.display = 'block';
                document.getElementById('cb-list').scrollTop = document.getElementById('cb-list').scrollHeight; 
            } else {
                indicator.style.display = 'none';
            }
        });

        var bindInterval = setInterval(function(){
            var input = document.getElementById('cb-input');
            var fileInput = document.getElementById('cb-file-input');
            var sendBtn = document.getElementById('cb-send-btn'); // ★ 抓取傳送按鈕

            if(input && fileInput && sendBtn) {
                clearInterval(bindInterval);

                // ★ 統一發送函式
                function sendText() {
                    if (input.value.trim()) {
                        socket.emit('sendMessage', { text: input.value, msgType: 'text' });
                        socket.emit('typing', { isTyping: false }); 
                        checkAutoReply();
                        input.value = '';
                    }
                }

                input.addEventListener('input', function() {
                    socket.emit('typing', { isTyping: true });
                    clearTimeout(typingTimeout);
                    typingTimeout = setTimeout(function() {
                        socket.emit('typing', { isTyping: false });
                    }, 2000);
                });

                input.onkeypress = function(e) {
                    if (e.key === 'Enter') sendText();
                };

                // ★ 綁定點擊事件
                sendBtn.onclick = sendText;

                fileInput.onchange = async function() {
                    const file = fileInput.files[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('image', file);

                    try {
                        input.placeholder = "圖片上傳中...";
                        input.disabled = true;
                        const res = await fetch(SERVER_URL + '/upload', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (data.url) {
                            socket.emit('sendMessage', { text: data.url, msgType: 'image' });
                            checkAutoReply();
                        }
                    } catch (err) {
                        alert("上傳失敗");
                    } finally {
                        input.placeholder = "輸入訊息...";
                        input.disabled = false;
                        fileInput.value = '';
                    }
                };
            }
        }, 500);

        function checkAutoReply() {
            if (!autoReplyEnabled) return;
            var currentHour = new Date().getHours();
            if (currentHour < startHour || currentHour >= endHour) {
                setTimeout(function() {
                    addMsg({ text: offlineMsg, sender: 'admin', msgType: 'text', timestamp: Date.now() });
                }, 1000);
            }
        }
    };
    
    document.head.appendChild(script);

})();