const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
// ★ 圖片上傳套件
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

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
    text: String,     // 如果是圖片，這裡會存 "https://res.cloudinary.....jpg"
    msgType: { type: String, default: 'text' }, // 分辨是 'text' 還是 'image'
    sender: String,
    timestamp: { type: Number, default: Date.now }
});

const Shop = mongoose.model('Shop', ShopSchema);
const Message = mongoose.model('Message', MessageSchema);

// --- 3. 圖片上傳設定 (Cloudinary) ---
cloudinary.config({
    cloud_name: 'djvv2fltj', 
    api_key: '551167384221725', 
    api_secret: 'Z6VHR446XPDOkxF-Y_5KwvZnMEI'
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'chat-app', // 圖片會存在這個資料夾
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif'],
        // 自動壓縮與縮圖設定
        transformation: [
            { width: 1000, crop: "limit" }, 
            { quality: "auto" },            
            { fetch_format: "auto" }        
        ]
    },
});
const upload = multer({ storage: storage });


// --- 4. 伺服器基礎設定 ---
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// 圖片上傳 API
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ url: req.file.path });
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, credentials: true },
    transports: ['websocket', 'polling']
});

// --- 驗證邏輯 (已修正) ---
function verifyIdentity(shopConfig, authData) {
    const { token, signature, userId, userName } = authData;

    // 1. 如果資料庫還沒設定 secretKey，降級檢查 Token
    if (!shopConfig.secretKey) {
        return String(token).trim() === String(shopConfig.publicToken).trim();
    }

    // 2. 如果有傳簽章，進行 HMAC 驗證
    if (signature) {
        // ★★★ 關鍵修正：Payload 必須跟 Liquid 端完全一致 (只包含 userId) ★★★
        const payload = String(userId); 

        const expectedSig = crypto
            .createHmac('sha256', shopConfig.secretKey)
            .update(payload)
            .digest('hex');

        console.log(`[驗證] User: ${userId}`);
        console.log(`       Client Sig: ${signature}`);
        console.log(`       Server Sig: ${expectedSig}`);

        return expectedSig === signature;
    }
    
    // 3. 如果沒簽章但有 Key，視為驗證失敗 (或者您可以選擇降級)
    return false;
}

// --- 初始化預設商店 ---
async function initDefaultShop() {
    // 1. 原本的 Cyberbiz 商店
    const defaultId = 'genius_0201';
    // 這裡使用 updateOne 加上 upsert: true，確保如果商店存在會更新 secretKey
    await Shop.updateOne(
        { shopId: defaultId },
        {
            $set: {
                password: '0201',
                name: '天才美術社 (Cyberbiz)',
                publicToken: 'genius_0201_token_888',
                verificationType: 'token',
                secretKey: "my_super_secret_key_2025" // 確保 Key 被寫入
            }
        },
        { upsert: true }
    );
    console.log(`[系統] 商店檢查/更新完成: ${defaultId}`);

    // 2. 測試用商店
    const testId = 'test';
    await Shop.updateOne(
        { shopId: testId },
        {
            $set: {
                password: '1234', 
                name: '開發測試專用店',
                publicToken: '9999',
                verificationType: 'token',
                secretKey: "my_super_secret_key_2025"
            }
        },
        { upsert: true }
    );
    console.log(`[系統] 商店檢查/更新完成: ${testId}`);
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
                msgType: data.msgType || 'text',
                sender: 'admin',
                timestamp: Date.now()
            };
            await new Message(msgData).save();
            
            io.to(`${shopId}_${data.targetUserId}`).emit('newMessage', msgData);
        });

        socket.on('adminTyping', (data) => {
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
    
    // 如果是訪客(guest_開頭)，跳過 HMAC 驗證
    if (userId && !userId.startsWith('guest_')) {
        isVerified = verifyIdentity(shopConfig, auth);
    } else if (userId && userId.startsWith('guest_')) {
        isVerified = true; // 訪客模式直接通過
    }

    // 驗證失敗處理
    if (!isVerified) {
        console.log(`[驗證失敗] User: ${userId}`);
        // 強制轉為訪客
        userId = 'guest_' + Math.random().toString(36).substr(2, 9);
        userName = '訪客';
        socket.emit('forceGuestMode', { userId, userName });
    } else if (!userId) {
        // 沒有 userId 的情況 (第一次來)
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
            msgType: data.msgType || 'text', 
            sender: 'user',
            timestamp: Date.now()
        };
        await new Message(msgData).save();

        io.to(roomName).emit('newMessage', msgData);
        io.to(`admin_${shopId}`).emit('updateUserList', msgData);
    });
    // ★★★ 新增：接收使用者的足跡，並轉發給管理員 ★★★
    socket.on('pageChange', (data) => {
        // data = { url, title, image }
        // 廣播給該商店的管理員
        io.to(`admin_${shopId}`).emit('userPageUpdate', {
            userId: userId,
            ...data
        });
    });

    socket.on('typing', (data) => {
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