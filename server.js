const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();

// --- 1. 資料庫連線設定 (MongoDB) ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ 嚴重錯誤：未設定 MONGO_URI 環境變數！");
} else {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ MongoDB Atlas 連線成功'))
        .catch(err => console.error('❌ MongoDB 連線失敗:', err));
}

// --- 2. 定義資料庫模型 (Schema) ---
const ShopSchema = new mongoose.Schema({
    shopId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: String,
    secretKey: String, 
    publicToken: String,
    verificationType: { type: String, default: 'token' }
});

const MessageSchema = new mongoose.Schema({
    shopId: String,
    userId: String,
    userName: String,
    text: String,
    sender: String, // 'user' or 'admin'
    timestamp: { type: Number, default: Date.now } // ★ 這裡已經有時間戳記了
});

const Shop = mongoose.model('Shop', ShopSchema);
const Message = mongoose.model('Message', MessageSchema);

// --- 3. 伺服器基礎設定 ---
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, credentials: true },
    transports: ['websocket', 'polling']
});

// --- 驗證邏輯 ---
function verifyIdentity(shopConfig, authData) {
    const { token, signature, userId, userName } = authData;
    if (shopConfig.verificationType === 'token') {
        return String(token).trim() === String(shopConfig.publicToken).trim();
    }
    if (shopConfig.verificationType === 'hmac') {
        if (!signature || !shopConfig.secretKey) return false;
        const payload = `${shopConfig.shopId}${userId}${userName}`;
        const expectedSig = crypto.createHmac('sha256', shopConfig.secretKey).update(payload).digest('hex');
        return expectedSig === signature;
    }
    return false;
}

// --- 初始化預設商店 ---
async function initDefaultShop() {
    // 1. 原本的 Cyberbiz 商店
    const defaultId = 'genius_0201';
    if (!(await Shop.findOne({ shopId: defaultId }))) {
        await new Shop({
            shopId: defaultId,
            password: '0201',
            name: '天才美術社 (Cyberbiz)',
            publicToken: 'genius_0201_token_888',
            verificationType: 'token'
        }).save();
        console.log(`[系統] 已建立預設商店: ${defaultId}`);
    }

    // 2. ★ 新增：第二個測試用商店 (shop_test)
    const testId = 'test';
    if (!(await Shop.findOne({ shopId: testId }))) {
        await new Shop({
            shopId: testId,
            password: '1234', // 測試用的簡單密碼
            name: '開發測試專用店',
            publicToken: '9999',
            verificationType: 'token'
        }).save();
        console.log(`[系統] 已建立測試商店: ${testId}`);
    }
}
mongoose.connection.once('open', initDefaultShop);


io.on('connection', async (socket) => {
    const auth = socket.handshake.auth || {};
    const { shopId, isAdmin } = auth;

    console.log(`[連線] ID: ${socket.id}, Shop: ${shopId}, Admin: ${isAdmin}`);

    if (!shopId) {
        socket.disconnect();
        return;
    }

    // ==========================================
    // A. 管理員邏輯
    // ==========================================
    if (isAdmin) {
        socket.on('adminLogin', async ({ password }) => {
            const shop = await Shop.findOne({ shopId });
            
            if (!shop) {
                socket.emit('loginError', `找不到商店 ID: ${shopId}`);
                return;
            }

            if (shop.password === password) {
                console.log(`[管理員登入] ${shop.name}`);
                socket.join(`admin_${shopId}`);
                socket.emit('loginSuccess', { shopName: shop.name });

                // 取得使用者列表
                const msgs = await Message.find({ shopId });
                const users = {};
                msgs.forEach(m => {
                    if (m.userId && m.sender !== 'admin') {
                        users[m.userId] = m.userName || m.userId;
                    }
                });
                socket.emit('initUserList', users);
            } else {
                socket.emit('loginError', '密碼錯誤');
            }
        });

        socket.on('adminJoinUser', async ({ userId }) => {
            const roomName = `${shopId}_${userId}`;
            socket.join(roomName);
            const history = await Message.find({ shopId, userId }).sort({ timestamp: 1 });
            socket.emit('history', history);
        });
        
        socket.on('adminSendMessage', async (data) => {
            const msgData = {
                shopId,
                userId: data.targetUserId,
                userName: 'Admin',
                text: data.text,
                sender: 'admin',
                timestamp: Date.now()
            };
            await new Message(msgData).save();
            
            io.to(`${shopId}_${data.targetUserId}`).emit('newMessage', msgData);
            socket.emit('newMessage', msgData); 
        });

        // ★★★ 新增：管理員打字狀態 ★★★
        socket.on('adminTyping', (data) => {
            // data needs { targetUserId, isTyping }
            const roomName = `${shopId}_${data.targetUserId}`;
            socket.to(roomName).emit('displayTyping', {
                userId: 'admin',
                isTyping: data.isTyping
            });
        });

        return; // 管理員邏輯結束
    }

    // ==========================================
    // B. 一般客戶連線邏輯
    // ==========================================
    const shopConfig = await Shop.findOne({ shopId });
    if (!shopConfig) {
        console.log(`[拒絕] 無效的 Shop ID`);
        socket.disconnect();
        return;
    }

    let { userId, userName } = auth;
    let isVerified = false;
    if (userId) {
        isVerified = verifyIdentity(shopConfig, auth);
    }

    if (!isVerified) {
        userId = 'guest_' + Math.random().toString(36).substr(2, 9);
        userName = '訪客';
        socket.emit('forceGuestMode', { userId, userName });
    }

    const roomName = `${shopId}_${userId}`;
    socket.join(roomName);

    // 傳送歷史訊息
    const history = await Message.find({ shopId, userId }).sort({ timestamp: 1 });
    socket.emit('history', history);

    // 接收訊息
    socket.on('sendMessage', async (data) => {
        const msgData = {
            shopId,
            userId,
            userName,
            text: data.text,
            sender: 'user',
            timestamp: Date.now()
        };
        await new Message(msgData).save();

        // 廣播給房間內 (自己 + 管理員)
        io.to(roomName).emit('newMessage', msgData);
        // 通知所有管理員更新列表
        io.to(`admin_${shopId}`).emit('updateUserList', msgData);
    });

    // ★★★ 新增：客戶打字狀態監聽 ★★★
    socket.on('typing', (data) => {
        // data = { isTyping: true/false }
        // 廣播給房間內的其他人 (主要是管理員)
        socket.to(roomName).emit('displayTyping', {
            userId: userId,
            isTyping: data.isTyping
        });
    });
});

const PORT = process.env.PORT || 8188;
server.listen(PORT, () => {
    console.log(`伺服器運行中 Port: ${PORT}`);
});