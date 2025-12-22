const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
// ★ 新增圖片上傳套件
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
    msgType: { type: String, default: 'text' }, // ★ 新增：分辨是 'text' 還是 'image'
    sender: String,
    timestamp: { type: Number, default: Date.now }
});

const Shop = mongoose.model('Shop', ShopSchema);
const Message = mongoose.model('Message', MessageSchema);

// --- ★★★ 3. 圖片上傳設定 (Cloudinary) ★★★ ---
// 請去 Cloudinary Dashboard 複製您的資料填入下方
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

// ★★★ 新增：圖片上傳 API ★★★
// 前端發送 POST /upload，這裡回傳圖片網址
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // 回傳 Cloudinary 的圖片網址
    res.json({ url: req.file.path });
});

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

    // 2. 第二個測試用商店 (shop_test)
    const testId = 'test';
    if (!(await Shop.findOne({ shopId: testId }))) {
        await new Shop({
            shopId: testId,
            password: '1234', 
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
                msgType: data.msgType || 'text', // ★ 記得要存訊息類型
                sender: 'admin',
                timestamp: Date.now()
            };
            await new Message(msgData).save();
            
            // 廣播給 User 和 Admin 自己 (不需額外 socket.emit)
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
            msgType: data.msgType || 'text', // ★ 記得要存訊息類型
            sender: 'user',
            timestamp: Date.now()
        };
        await new Message(msgData).save();

        // 廣播給房間內 (自己 + 管理員)
        io.to(roomName).emit('newMessage', msgData);
        // 通知所有管理員更新列表
        io.to(`admin_${shopId}`).emit('updateUserList', msgData);
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