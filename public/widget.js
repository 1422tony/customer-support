(function() {
    console.log(">>> Widget.js (v13.3 支援商品卡片版) 啟動...");

    function renderUI() {
        if (document.getElementById('cb-container')) return;

        var style = document.createElement('style');
        style.innerHTML = `
            /* 基礎 Z-Index 設定 */
            #cb-container { position: fixed; right: 20px; bottom: 48px; z-index: 2147483600; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; pointer-events: auto; font-family: sans-serif; }
            
            #cb-btn { width: 60px; height: 60px; background: #0084ff; border-radius: 50%; color: white; border: 2px solid white; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-size: 30px; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
            #cb-btn:active { transform: scale(0.95); }
            
            #cb-box { width: 340px; height: 480px; background: white; border-radius: 12px; overflow: hidden; display: none; flex-direction: column; border: 1px solid #eee; box-shadow: 0 5px 20px rgba(0,0,0,0.2); transform-origin: bottom right; animation: cbPop 0.2s ease-out; }
            @keyframes cbPop { from{opacity:0;transform:scale(0.8);} to{opacity:1;transform:scale(1);} }
            
            @media (max-width: 768px) { 
                #cb-container { bottom: 60px !important; right: 20px !important; } 
                #cb-btn { width: 55px; height: 55px; } 
                #cb-box { 
                    position: fixed; bottom: 0; right: 0; width: 100%; height: 100%; 
                    z-index: 2147483610; 
                    border-radius: 0; 
                } 
                #cb-close-mobile { display: block !important; cursor: pointer; font-size: 24px; padding: 0 10px;} 
            }

            #cb-head { background: #0084ff; color: white; padding: 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;}
            #cb-list { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; background: #f9f9f9; }
            
            .cb-msg-row { display: flex; flex-direction: column; max-width: 80%; margin-bottom: 8px; }
            .cb-msg-row.user { align-self: flex-end; align-items: flex-end; }
            .cb-msg-row.admin { align-self: flex-start; align-items: flex-start; }
            
            .cb-msg { padding: 10px 14px; border-radius: 18px; font-size: 15px; word-break: break-word; position: relative; }
            .cb-msg.user { background: #0084ff; color: white; border-bottom-right-radius: 4px; }
            .cb-msg.admin { background: #e4e6eb; color: #050505; border-bottom-left-radius: 4px; }
            .cb-msg.image { background: transparent !important; padding: 0; }
            .cb-msg-img { max-width: 150px; border-radius: 8px; cursor: zoom-in; border: 2px solid #ddd; }
            .cb-time { font-size: 10px; color: #999; margin-top: 2px; margin-left: 4px; margin-right: 4px; }

            /* ★★★ 修改重點 1：新增商品卡片 CSS ★★★ */
            .cb-msg.product { 
                padding: 0; 
                background: white !important; 
                color: #333 !important;
                border: 1px solid #ddd; 
                overflow: hidden; 
                width: 220px; 
                border-radius: 12px;
            }
            .p-card-img { width: 100%; height: 140px; object-fit: cover; background: #f9f9f9; border-bottom: 1px solid #eee; }
            .p-card-body { padding: 10px; }
            .p-card-title { font-size: 13px; font-weight: bold; margin-bottom: 5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #333; line-height: 1.4; }
            .p-card-price { color: #c62828; font-weight: bold; font-size: 14px; margin-bottom: 8px; }
            .p-card-btn { display: block; width: 100%; padding: 6px 0; background: #0084ff; color: white; text-align: center; text-decoration: none; border-radius: 4px; font-size: 12px; }
            .p-card-btn:hover { background: #006ec9; }

            .typing-indicator { font-size: 12px; color: #888; padding: 5px 10px; display: none; font-style: italic; }
            .typing-dots::after { content: '...'; animation: typing 1.5s infinite; }
            @keyframes typing { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }

            #cb-footer { 
                padding: 10px; 
                border-top: 1px solid #ddd; 
                background: #fff; 
                display: flex; 
                align-items: center; 
                gap: 8px; 
            }
            
            #cb-input { 
                flex: 1; 
                padding: 10px; 
                border: 1px solid #ddd; 
                border-radius: 20px; 
                outline: none; 
                background: #f0f2f5; 
                font-size: 16px; 
                height: 40px; 
                box-sizing: border-box;
            }
            
            #cb-upload-btn { 
                width: 40px;           
                height: 40px;           
                display: flex;         
                align-items: center;   
                justify-content: center; 
                cursor: pointer; 
                font-size: 26px; 
                color: #888; 
                line-height: 1; 
            }
            #cb-upload-btn:active { transform: scale(0.9); }
            #cb-file-input { display: none; }
            
            #cb-send-btn { 
                width: 36px;  
                height: 36px; 
                cursor: pointer; 
                transition: transform 0.1s;
                object-fit: contain; 
                margin-left: 2px;
            }
            #cb-send-btn:active { transform: scale(0.9); }

            #cb-image-modal { display: none; position: fixed; z-index: 2147483620; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.9); justify-content: center; align-items: center; backdrop-filter: blur(5px); animation: cbFadeIn 0.2s; }
            #cb-modal-img { max-width: 95%; max-height: 95%; border-radius: 4px; object-fit: contain; animation: cbZoomIn 0.2s; }
            #cb-close-modal { position: absolute; top: 20px; right: 20px; color: #fff; font-size: 30px; font-weight: bold; cursor: pointer; z-index: 2147483621; background: rgba(0,0,0,0.5); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
            @keyframes cbFadeIn { from {opacity:0;} to {opacity:1;} }
            @keyframes cbZoomIn { from {transform:scale(0.9);} to {transform:scale(1);} }
            
            .status-dot { display: inline-block; width: 10px; height: 10px; background-color: #ccc; border-radius: 50%; margin-right: 8px; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.2); transition: background-color 0.3s; }
            .status-dot.online { background-color: #2ecc71; box-shadow: 0 0 8px #2ecc71; } 
            .status-dot.offline { background-color: #e74c3c; } 
            #cb-head-title { display: flex; align-items: center; }
        `;
        document.head.appendChild(style);

        var container = document.createElement('div');
        container.id = 'cb-container';
        
        container.innerHTML = `
            <div id="cb-box">
                <div id="cb-head">
                    <div id="cb-head-title">
                        <span id="cb-status-dot" class="status-dot"></span>
                        <span id="cb-status-text">客服中心</span>
                    </div>
                    <span id="cb-close-mobile" style="display:none;">&times;</span>
                </div>
                <div id="cb-list"><div style="text-align:center;color:#999;padding:20px;">連線中...</div></div>
                <div class="typing-indicator">對方正在輸入<span class="typing-dots"></span></div>
                <div id="cb-footer">
                    <label for="cb-file-input" id="cb-upload-btn">📷</label>
                    <input type="file" id="cb-file-input" accept="image/*">
                    
                    <input id="cb-input" placeholder="輸入訊息...">
                    
                    <img src="https://customer-support-xtpx.onrender.com/icon/send.png" id="cb-send-btn" alt="Send">
                </div>
            </div>
            <button id="cb-btn">💬</button>

            <div id="cb-image-modal">
                <span id="cb-close-modal">&times;</span>
                <img id="cb-modal-img">
            </div>
        `;
        document.documentElement.appendChild(container);

        var btn = document.getElementById('cb-btn');
        var box = document.getElementById('cb-box');
        var closeMobile = document.getElementById('cb-close-mobile');
        var modal = document.getElementById('cb-image-modal');
        var closeBtn = document.getElementById('cb-close-modal');
        
        modal.onclick = function() { modal.style.display = "none"; };
        closeBtn.onclick = function() { modal.style.display = "none"; };

        window.cbShowImage = function(src) {
            var modalImg = document.getElementById('cb-modal-img');
            modal.style.display = "flex";
            modalImg.src = src;
        };

        function toggle() { 
            var isHidden = (box.style.display === 'none' || box.style.display === ''); 
            box.style.display = isHidden ? 'flex' : 'none'; 
            
            if (isHidden) {
                var list = document.getElementById('cb-list');
                if (list) {
                    setTimeout(function() {
                        list.scrollTop = list.scrollHeight;
                    }, 10); 
                }
            }

            if (window.innerWidth <= 768) document.body.style.overflow = isHidden ? 'hidden' : ''; 
        }
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

            // ★★★ 1. 只要連線(打開視窗)，就告訴 Server 我(user)已讀了客服的訊息
            socket.emit('markMessagesRead', { targetUserId: userId, reader: 'user' });

            // 1. 傳送 CRM 資料
            if (config.userProfile) {
                socket.emit('updateUserProfile', {
                    userId: userId,
                    ...config.userProfile
                });
            }
            
            // 2. ★★★ 新邏輯：從 sessionStorage 讀取商品資料 ★★★
            var storedProduct = sessionStorage.getItem('cb_current_product');
            
            if (storedProduct) {
                try {
                    var pData = JSON.parse(storedProduct);
                    socket.emit('pageChange', {
                        url: window.location.href,
                        title: pData.title,
                        price: pData.price // 這裡是純數字，後台可能要自己加 $ 符號
                    });
                } catch(e) {
                    reportPage(); // 解析失敗就回報一般頁面
                }
            } else {
                reportPage(); // 沒商品就回報一般頁面
            }
        });

        function reportPage() {
            var ogTitle = document.querySelector('meta[property="og:title"]');
            var ogImage = document.querySelector('meta[property="og:image"]');
            
            var payload = {
                url: window.location.href,
                title: ogTitle ? ogTitle.content : document.title,
                image: ogImage ? ogImage.content : ''
            };
            
            socket.emit('pageChange', payload);
        }

        socket.on('forceGuestMode', function(data) {
            userId = data.userId;
            localStorage.setItem(GUEST_KEY, data.userId);
        });

        socket.on('shopStatusUpdate', function(data) {
            var dot = document.getElementById('cb-status-dot');
            var text = document.getElementById('cb-status-text');
            if(!dot || !text) return;

            if (data.isOnline) {
                dot.className = 'status-dot online';
                text.innerText = "客服在線中";
            } else {
                dot.className = 'status-dot offline';
                text.innerText = "客服休息中";
            }
        });

        // ★★★ 2. 監聽：客服已讀了我的訊息
        socket.on('messagesWereRead', function(data) {
            if (data.reader === 'admin') {
                // 找到所有顯示 "送達" 的標籤，改成 "已讀"
                var statuses = document.querySelectorAll('.read-status');
                for (var i = 0; i < statuses.length; i++) {
                    statuses[i].innerText = '已讀';
                    statuses[i].style.color = '#0084ff'; // 變藍色
                    statuses[i].style.fontWeight = 'bold';
                }
            }
        });

        function addMsg(msg) {
            var list = document.getElementById('cb-list');
            if(!list) return;

            var date = new Date(msg.timestamp);
            var timeStr = date.getHours().toString().padStart(2, '0') + ":" + date.getMinutes().toString().padStart(2, '0');

            var row = document.createElement('div');
            row.className = "cb-msg-row " + msg.sender;
            
            // ★★★ 新增：判斷已讀狀態 (如果是自己發的訊息，才顯示已讀) ★★★
            let readHtml = '';
            if (msg.sender === 'user') { // 注意：Widget 端，使用者是 'user'
                const readText = msg.isRead ? '已讀' : '送達';
                const readClass = msg.isRead ? 'read' : '';
                // 加個小樣式讓它靠右
                readHtml = `<div class="read-status ${readClass}" style="font-size:10px;color:#999;text-align:right;margin-top:-2px;">${readText}</div>`;
            }

            let contentHtml = '';
            
            // ★★★ 修改重點 2：新增商品卡片 (product) 的渲染邏輯 ★★★
            if (msg.msgType === 'image') {
                contentHtml = `<div class="cb-msg image ${msg.sender}">
                    <img src="${msg.text}" class="cb-msg-img" onclick="window.cbShowImage(this.src)">
                </div>`;
            } 
            else if (msg.msgType === 'product') {
                // 解析 JSON 資料
                let p = {};
                try { p = JSON.parse(msg.text); } catch(e){}
                
                contentHtml = `
                    <div class="cb-msg product ${msg.sender}">
                        <img src="${p.image || ''}" class="p-card-img">
                        <div class="p-card-body">
                            <div class="p-card-title">${p.title}</div>
                            <div class="p-card-price">${p.price}</div>
                            <a href="${p.url}" target="_blank" class="p-card-btn">查看商品</a>
                        </div>
                    </div>
                `;
            }
            else {
                contentHtml = `<div class="cb-msg ${msg.sender}">${msg.text}</div>`;
            }

            row.innerHTML = `${contentHtml}<div class="cb-time">${timeStr}</div>${readHtml}`;
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
            var sendBtn = document.getElementById('cb-send-btn'); 

            if(input && fileInput && sendBtn) {
                clearInterval(bindInterval);

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
                    typingTimeout = setTimeout(function() { socket.emit('typing', { isTyping: false }); }, 2000);
                });

                input.onkeypress = function(e) {
                    if (e.key === 'Enter') sendText();
                };

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