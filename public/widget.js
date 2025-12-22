(function() {
    console.log(">>> Widget.js (v8.0 功能全開版) 啟動...");

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
            
            .cb-time { font-size: 10px; color: #999; margin-top: 2px; margin-left: 4px; margin-right: 4px; }

            /* 打字中動畫 */
            .typing-indicator { font-size: 12px; color: #888; padding: 5px 10px; display: none; font-style: italic; }
            .typing-dots::after { content: '...'; animation: typing 1.5s infinite; }
            @keyframes typing { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }

            #cb-footer { padding: 10px; border-top: 1px solid #ddd; background: #fff; display: flex; }
            #cb-input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 20px; outline: none; background: #f0f2f5; font-size: 16px; }
        `;
        document.head.appendChild(style);

        var container = document.createElement('div');
        container.id = 'cb-container';
        container.innerHTML = `
            <div id="cb-box">
                <div id="cb-head"><span>客服中心</span><span id="cb-close-mobile" style="display:none;">&times;</span></div>
                <div id="cb-list"><div style="text-align:center;color:#999;padding:20px;">連線中...</div></div>
                <div class="typing-indicator">對方正在輸入<span class="typing-dots"></span></div>
                <div id="cb-footer"><input id="cb-input" placeholder="輸入訊息..."></div>
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
    
    // ★ 讀取離線設定
    var autoReplyEnabled = config.autoReplyEnabled; // true/false
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
            auth: { shopId: shopId, token: token, userId: userId, userName: userName, isAdmin: false },
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

        // ★★★ 功能 1: 訊息 + 時間戳 ★★★
        function addMsg(msg) {
            var list = document.getElementById('cb-list');
            if(!list) return;

            // 時間格式化 (例如 14:30)
            var date = new Date(msg.timestamp);
            var timeStr = date.getHours().toString().padStart(2, '0') + ":" + date.getMinutes().toString().padStart(2, '0');

            var row = document.createElement('div');
            row.className = "cb-msg-row " + msg.sender;
            
            row.innerHTML = `
                <div class="cb-msg ${msg.sender}">${msg.text}</div>
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

        // ★★★ 功能 2: 顯示對方正在輸入 ★★★
        var typingTimeout;
        socket.on('displayTyping', function(data) {
            var indicator = document.querySelector('.typing-indicator');
            if (!indicator) return;
            
            if (data.isTyping) {
                indicator.style.display = 'block';
                var list = document.getElementById('cb-list');
                list.scrollTop = list.scrollHeight; // 自動捲動到底部
            } else {
                indicator.style.display = 'none';
            }
        });

        var bindInterval = setInterval(function(){
            var input = document.getElementById('cb-input');
            if(input) {
                clearInterval(bindInterval);

                // 監聽輸入：發送 "正在輸入"
                input.addEventListener('input', function() {
                    socket.emit('typing', { isTyping: true });
                    
                    // 防抖動：停止輸入 2 秒後，發送 "停止輸入"
                    clearTimeout(typingTimeout);
                    typingTimeout = setTimeout(function() {
                        socket.emit('typing', { isTyping: false });
                    }, 2000);
                });

                input.onkeypress = function(e) {
                    if (e.key === 'Enter' && input.value.trim()) {
                        // 傳送訊息
                        socket.emit('sendMessage', { text: input.value });
                        socket.emit('typing', { isTyping: false }); // 送出後馬上停止打字狀態
                        
                        // ★★★ 功能 3: 離線自動回復邏輯 ★★★
                        checkAutoReply();

                        input.value = '';
                    }
                };
            }
        }, 500);

        // 檢查是否需要自動回復
        function checkAutoReply() {
            if (!autoReplyEnabled) return;

            var currentHour = new Date().getHours();
            // 判斷是否在營業時間外 (例如設定 9~18，那 <9 或 >=18 就是離線)
            if (currentHour < startHour || currentHour >= endHour) {
                // 模擬延遲 1 秒後回復
                setTimeout(function() {
                    addMsg({
                        text: offlineMsg, // 從 Cyberbiz 設定讀取的訊息
                        sender: 'admin',
                        timestamp: Date.now()
                    });
                }, 1000);
            }
        }
    };
    
    document.head.appendChild(script);

})();