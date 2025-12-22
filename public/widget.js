(function() {
    console.log(">>> Widget.js (v10.0 圖片上傳 + HMAC安全版) 啟動...");

    function renderUI() {
        if (document.getElementById('cb-container')) return;

        var style = document.createElement('style');
        style.innerHTML = `
            #cb-container { position: fixed; right: 20px; bottom: 48px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; pointer-events: auto; }
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
            
            /* 訊息氣泡與時間戳樣式 */
            .cb-msg-row { display: flex; flex-direction: column; max-width: 80%; margin-bottom: 8px; }
            .cb-msg-row.user { align-self: flex-end; align-items: flex-end; }
            .cb-msg-row.admin { align-self: flex-start; align-items: flex-start; }
            
            .cb-msg { padding: 10px 14px; border-radius: 18px; font-size: 15px; word-break: break-word; position: relative; }
            .cb-msg.user { background: #0084ff; color: white; border-bottom-right-radius: 4px; }
            .cb-msg.admin { background: #e4e6eb; color: #050505; border-bottom-left-radius: 4px; }
            
            /* 圖片訊息樣式 */
            .cb-msg.image { background: transparent !important; padding: 0; }
            .cb-msg-img { max-width: 150px; border-radius: 8px; cursor: pointer; border: 2px solid #ddd; }

            .cb-time { font-size: 10px; color: #999; margin-top: 2px; margin-left: 4px; margin-right: 4px; }

            /* 打字中動畫 */
            .typing-indicator { font-size: 12px; color: #888; padding: 5px 10px; display: none; font-style: italic; }
            .typing-dots::after { content: '...'; animation: typing 1.5s infinite; }
            @keyframes typing { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }

            /* Footer 加入上傳按鈕 */
            #cb-footer { padding: 10px; border-top: 1px solid #ddd; background: #fff; display: flex; align-items: center; gap: 8px; }
            #cb-input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 20px; outline: none; background: #f0f2f5; font-size: 16px; }
            
            /* 上傳按鈕 */
            #cb-upload-btn { cursor: pointer; font-size: 20px; color: #888; padding: 5px; line-height: 1; }
            #cb-upload-btn:hover { color: #0084ff; }
            #cb-file-input { display: none; }
        `;
        document.head.appendChild(style);

        var container = document.createElement('div');
        container.id = 'cb-container';
        container.innerHTML = `
            <div id="cb-box">
                <div id="cb-head"><span>客服中心</span><span id="cb-close-mobile" style="display:none;">&times;</span></div>
                <div id="cb-list"><div style="text-align:center;color:#999;padding:20px;">連線中...</div></div>
                <div class="typing-indicator">對方正在輸入<span class="typing-dots"></span></div>
                <div id="cb-footer">
                    <label for="cb-file-input" id="cb-upload-btn">📷</label>
                    <input type="file" id="cb-file-input" accept="image/*">
                    
                    <input id="cb-input" placeholder="輸入訊息...">
                </div>
            </div>
            <button id="cb-btn">💬</button>
        `;
        document.documentElement.appendChild(container);

        var btn = document.getElementById('cb-btn');
        var box = document.getElementById('cb-box');
        var closeMobile = document.getElementById('cb-close-mobile');
        function toggle() { var isHidden = (box.style.display === 'none' || box.style.display === ''); box.style.display = isHidden ? 'flex' : 'none'; if (window.innerWidth <= 768) document.body.style.overflow = isHidden ? 'hidden' : ''; }
        btn.onclick = toggle; closeMobile.onclick = toggle;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderUI);
    else renderUI();
    
    // --- 讀取 Cyberbiz 設定 ---
    var config = window.ChatWidgetConfig || {};
    if (!config.shopId) { var s = document.currentScript; if(s) config.shopId = s.getAttribute('data-shop-id'); }
    if (!config.shopId) return;

    var shopId = config.shopId;
    var token = config.token;
    var userId = config.userId;
    var userName = config.userName;
    var signature = config.signature; // ★★★ 1. 讀取簽章 ★★★
    
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
            auth: { 
                shopId: shopId, 
                token: token, 
                userId: userId, 
                userName: userName, 
                signature: signature, // ★★★ 2. 將簽章傳送給後端驗證 ★★★
                isAdmin: false 
            },
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

        // 支援圖片顯示
        function addMsg(msg) {
            var list = document.getElementById('cb-list');
            if(!list) return;

            var date = new Date(msg.timestamp);
            var timeStr = date.getHours().toString().padStart(2, '0') + ":" + date.getMinutes().toString().padStart(2, '0');

            var row = document.createElement('div');
            row.className = "cb-msg-row " + msg.sender;
            
            // 判斷是否為圖片
            let contentHtml = '';
            if (msg.msgType === 'image') {
                // 圖片連結點擊開新視窗
                contentHtml = `<div class="cb-msg image ${msg.sender}">
                    <a href="${msg.text}" target="_blank"><img src="${msg.text}" class="cb-msg-img"></a>
                </div>`;
            } else {
                contentHtml = `<div class="cb-msg ${msg.sender}">${msg.text}</div>`;
            }

            row.innerHTML = `
                ${contentHtml}
                <div class="cb-time">${timeStr}</div>
            `;
            
            list.appendChild(row);
            list.scrollTop = list.scrollHeight;
        }
        
        socket.on('history', function(msgs) { 
            var list = document.getElementById('cb-list');
            if(list) { list.innerHTML=''; msgs.forEach(addMsg); }
        });
        
        socket.on('newMessage', addMsg);

        // --- Typing Indicator ---
        var typingTimeout;
        socket.on('displayTyping', function(data) {
            var indicator = document.querySelector('.typing-indicator');
            if (!indicator) return;
            
            if (data.isTyping) {
                indicator.style.display = 'block';
                var list = document.getElementById('cb-list');
                list.scrollTop = list.scrollHeight; 
            } else {
                indicator.style.display = 'none';
            }
        });

        // 監聽上傳與發送
        var bindInterval = setInterval(function(){
            var input = document.getElementById('cb-input');
            var fileInput = document.getElementById('cb-file-input');

            if(input && fileInput) {
                clearInterval(bindInterval);

                // 1. 文字發送監聽
                input.addEventListener('input', function() {
                    socket.emit('typing', { isTyping: true });
                    clearTimeout(typingTimeout);
                    typingTimeout = setTimeout(function() {
                        socket.emit('typing', { isTyping: false });
                    }, 2000);
                });

                input.onkeypress = function(e) {
                    if (e.key === 'Enter' && input.value.trim()) {
                        // 注意：發送文字時，帶上 msgType: 'text'
                        socket.emit('sendMessage', { text: input.value, msgType: 'text' });
                        socket.emit('typing', { isTyping: false }); 
                        checkAutoReply();
                        input.value = '';
                    }
                };

                // 2. 圖片上傳監聽
                fileInput.onchange = async function() {
                    const file = fileInput.files[0];
                    if (!file) return;

                    const formData = new FormData();
                    formData.append('image', file);

                    try {
                        input.placeholder = "圖片上傳中...";
                        input.disabled = true;

                        // POST 到後端
                        const res = await fetch(SERVER_URL + '/upload', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await res.json();

                        if (data.url) {
                            // 上傳成功，發送圖片訊息
                            socket.emit('sendMessage', { 
                                text: data.url, 
                                msgType: 'image' 
                            });
                            checkAutoReply(); // 圖片也觸發自動回復檢查
                        }
                    } catch (err) {
                        console.error("Upload failed", err);
                        alert("圖片上傳失敗，請稍後再試");
                    } finally {
                        input.placeholder = "輸入訊息...";
                        input.disabled = false;
                        fileInput.value = ''; // 清空，允許重複選取
                    }
                };
            }
        }, 500);

        function checkAutoReply() {
            if (!autoReplyEnabled) return;
            var currentHour = new Date().getHours();
            if (currentHour < startHour || currentHour >= endHour) {
                setTimeout(function() {
                    addMsg({
                        text: offlineMsg, 
                        sender: 'admin',
                        msgType: 'text',
                        timestamp: Date.now()
                    });
                }, 1000);
            }
        }
    };
    
    document.head.appendChild(script);

})();