(function() {
    console.log(">>> Widget.js (v6.0 自動網址版) 啟動...");

    // ... (保留原本的 renderUI 函式，因為您沒給我新的 CSS，請維持您原本那段 renderUI 代碼) ...
    // --- 這裡請貼上您原本漂亮的 renderUI 函式 ---
    function renderUI() {
        if (document.getElementById('cb-container')) return;
        // ... (這裡內容維持不變)
        // 簡單來說，您不用改動 renderUI 裡面的任何 CSS
        // 我只列出 socket 連線部分的修改
        var style = document.createElement('style');
        style.innerHTML = `
            #cb-container { position: fixed; right: 20px; bottom: 48px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; pointer-events: auto; }
            #cb-btn { width: 60px; height: 60px; background: #0084ff; border-radius: 50%; color: white; border: 2px solid white; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-size: 30px; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
            #cb-btn:active { transform: scale(0.95); }
            #cb-box { width: 340px; height: 480px; background: white; border-radius: 12px; display: none; flex-direction: column; border: 1px solid #eee; box-shadow: 0 5px 20px rgba(0,0,0,0.2); transform-origin: bottom right; animation: cbPop 0.2s ease-out; }
            @keyframes cbPop { from{opacity:0;transform:scale(0.8);} to{opacity:1;transform:scale(1);} }
            @media (max-width: 768px) { #cb-container { bottom: 120px !important; right: 20px !important; } #cb-btn { width: 55px; height: 55px; } #cb-box { position: fixed; bottom: 0; right: 0; width: 100%; height: 100%; z-index: 2147483649; border-radius: 0; } #cb-close-mobile { display: block !important; cursor: pointer; font-size: 24px; padding: 0 10px;} }
            #cb-head { background: #0084ff; color: white; padding: 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;}
            #cb-list { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; background: #f9f9f9; }
            .cb-msg { max-width: 80%; padding: 10px 14px; border-radius: 18px; font-size: 15px; word-break: break-word; }
            .cb-msg.user { align-self: flex-end; background: #0084ff; color: white; }
            .cb-msg.admin { align-self: flex-start; background: #e4e6eb; color: #050505; }
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
    
    // --- 連線邏輯 ---
    var config = window.ChatWidgetConfig || {};
    if (!config.shopId) { var s = document.currentScript; if(s) config.shopId = s.getAttribute('data-shop-id'); }
    if (!config.shopId) return;

    var shopId = config.shopId;
    var token = config.token;
    var userId = config.userId;
    var userName = config.userName;

    var GUEST_KEY = "chat_guest_id_" + shopId;
    if (!userId) {
        var saved = localStorage.getItem(GUEST_KEY);
        if (saved) { userId = saved; userName = '訪客 (回訪)'; }
    }

    var script = document.createElement('script');
    script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    
    script.onload = function() {
        // ★ 自動判斷網址：
        // 如果 widget.js 是從 render 載入的，就連到 render
        // 如果是用 ngrok，就連到 ngrok
        var src = document.currentScript ? document.currentScript.src : '';
        var SERVER_URL = 'https://leonore-untranspired-smudgily.ngrok-free.dev'; // 預設值 (Ngrok)
        
        // 如果這個腳本是從 Render 載入的，我們就直接用那個網域
        if (src && src.includes('onrender.com')) {
            var urlObj = new URL(src);
            SERVER_URL = urlObj.origin; // 例如 https://myapp.onrender.com
            console.log("[Widget] 自動偵測到正式環境:", SERVER_URL);
        }

        var socket = io(SERVER_URL, {
            auth: { shopId: shopId, token: token, userId: userId, userName: userName, isAdmin: false },
            transportOptions: { polling: { extraHeaders: { "ngrok-skip-browser-warning": "true" } } },
            transports: ['polling', 'websocket'],
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
            var d = document.createElement('div');
            d.className = "cb-msg " + msg.sender;
            d.innerText = msg.text;
            list.appendChild(d);
            list.scrollTop = list.scrollHeight;
        }
        
        socket.on('history', function(msgs) { 
            var list = document.getElementById('cb-list');
            if(list) { list.innerHTML=''; msgs.forEach(addMsg); }
        });
        
        socket.on('newMessage', addMsg);

        var bindInterval = setInterval(function(){
            var input = document.getElementById('cb-input');
            if(input) {
                clearInterval(bindInterval);
                input.onkeypress = function(e) {
                    if (e.key === 'Enter' && input.value.trim()) {
                        socket.emit('sendMessage', { text: input.value });
                        input.value = '';
                    }
                };
            }
        }, 500);
    };
    
    document.head.appendChild(script);

})();