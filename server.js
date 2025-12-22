const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose'); // 改用 Mongoose

const app = express();

// --- 1. 資料庫連線設定 (MongoDB) ---
// Render 會透過環境變數注入 MONGO_URI
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ 嚴重錯誤：未設定 MONGO_URI 環境變數！");
    // 本地開發時，如果沒有設定環境變數，程式會報錯提醒
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
    secretKey: String, // 用於 HMAC 驗證
    publicToken: String,
    verificationType: { type: String, default: 'token' } // 'token' or 'hmac'
});

const MessageSchema = new mongoose.Schema({
    shopId: String,
    userId: String,
    userName: String,
    text: String,
    sender: String, // 'user' or 'admin'
    timestamp: { type: Number, default: Date.now }
});

// 建立 Model
const Shop = mongoose.model('Shop', ShopSchema);
const Message = mongoose.model('Message', MessageSchema);

// --- 3. 伺服器基礎設定 ---
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true'); // 保留給開發用
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

// --- 初始化預設商店 (防止資料庫空的無法登入) ---
async function initDefaultShop() {
    // 這裡可以寫死一個預設商店，方便您測試
    const defaultId = 'shop_cyberbiz';
    const exists = await Shop.findOne({ shopId: defaultId });
    if (!exists) {
        await new Shop({
            shopId: defaultId,
            password: 'admin', // ★ 預設密碼
            name: '我的測試商店',
            publicToken: 'cb_public_token_888',
            verificationType: 'token'
        }).save();
        console.log(`[系統] 已建立預設商店: ${defaultId} / 密碼: admin`);
    }
}
// 連線成功後嘗試初始化
mongoose.connection.once('open', initDefaultShop);


io.on('connection', async (socket) => {
    const auth = socket.handshake.auth || {};
    const { shopId, isAdmin } = auth;

    console.log(`[連線] ID: ${socket.id}, Shop: ${shopId}, Admin: ${isAdmin}`);

    if (!shopId) {
        socket.disconnect();
        return;
    }

    // --- 管理員邏輯 ---
    if (isAdmin) {
        socket.on('adminLogin', async ({ password }) => {
            // ★ 改用 Mongoose 查詢
            const shop = await Shop.findOne({ shopId });
            
            if (!shop) {
                socket.emit('loginError', `找不到商店 ID: ${shopId}`);
                return;
            }

            if (shop.password === password) {
                console.log(`[管理員登入] ${shop.name}`);
                socket.join(`admin_${shopId}`);
                socket.emit('loginSuccess', { shopName: shop.name });

                // ★ 改用 Mongoose 聚合查詢使用者列表 (去除重複)
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
            // ★ 改用 Mongoose 查詢歷史訊息
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
            // ★ 改用 Mongoose 存檔
            await new Message(msgData).save();
            
            io.to(`${shopId}_${data.targetUserId}`).emit('newMessage', msgData);
            socket.emit('newMessage', msgData); 
        });
        return;
    }

    // --- 客戶連線邏輯 ---
    // ★ 改用 Mongoose 查詢商店設定
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

    // ★ 改用 Mongoose 查詢歷史
    const history = await Message.find({ shopId, userId }).sort({ timestamp: 1 });
    socket.emit('history', history);

    socket.on('sendMessage', async (data) => {
        const msgData = {
            shopId,
            userId,
            userName,
            text: data.text,
            sender: 'user',
            timestamp: Date.now()
        };
        // ★ 改用 Mongoose 存檔
        await new Message(msgData).save();

        io.to(roomName).emit('newMessage', msgData);
        io.to(`admin_${shopId}`).emit('updateUserList', msgData);
    });
});

// ★ Render 會自動分配 PORT，若沒有則用 8188
const PORT = process.env.PORT || 8188;
server.listen(PORT, () => {
    console.log(`伺服器運行中 Port: ${PORT}`);
});