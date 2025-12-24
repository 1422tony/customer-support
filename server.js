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
    verificationType: { type: String, default: 'token' },
    isOnline: { type: Boolean, default: true } // ★ 狀態預設上線
});

const MessageSchema = new mongoose.Schema({
    shopId: String,
    userId: String,
    userName: String,
    text: String,
    msgType: { type: String, default: 'text' }, 
    sender: String,
    timestamp: { type: Number, default: Date.now },
    
    // ★★★ 新增：已讀狀態 (預設為 false，表示未讀) ★★★
    isRead: { type: Boolean, default: false } 
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
        folder: 'chat-app',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif'],
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

// --- 驗證邏輯 ---
function verifyIdentity(shopConfig, authData) {
    const { token, signature, userId } = authData;

    // 1. 如果資料庫還沒設定 secretKey，降級檢查 Token
    if (!shopConfig.secretKey) {
        return String(token).trim() === String(shopConfig.publicToken).trim();
    }

    // 2. 如果有傳簽章，進行 HMAC 驗證
    if (signature) {
        const payload = String(userId); 
        const expectedSig = crypto
            .createHmac('sha256', shopConfig.secretKey)
            .update(payload)
            .digest('hex');

        console.log(`[驗證] User: ${userId} | Client: ${signature} | Server: ${expectedSig}`);
        return expectedSig === signature;
    }
    
    return false;
}

// --- 初始化預設商店 ---
async function initDefaultShop() {
    // 1. 原本的 Cyberbiz 商店
    const defaultId = 'genius_0201';
    await Shop.updateOne(
        { shopId: defaultId },
        {
            $set: {
                password: '0201',
                name: '天才美術社 (Cyberbiz)',
                publicToken: 'genius_0201_token_888',
                verificationType: 'token',
                secretKey: "my_super_secret_key_2025" 
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
                
                socket.emit('loginSuccess', { 
                    shopName: shop.name,
                    isOnline: shop.isOnline,
                    shopPlan: shop.plan // 如果有做方案分級
                });

                // ★★★ 修改：計算每個使用者的未讀數量 ★★★
                const msgs = await Message.find({ shopId });
                const users = {};
                const unreadStats = {}; // { userId: 3, userId2: 5 ... }

                msgs.forEach(m => {
                    // 只記錄使用者列表
                    if (m.userId && m.sender !== 'admin') {
                        users[m.userId] = m.userName || m.userId;
                        
                        // ★ 統計未讀：如果是使用者傳的且未讀
                        if (m.sender === 'user' && m.isRead === false) {
                            unreadStats[m.userId] = (unreadStats[m.userId] || 0) + 1;
                        }
                    }
                });

                // 把使用者列表和未讀統計一起傳給前端
                socket.emit('initUserList', { users, unreadStats });
            } else {
                socket.emit('loginError', '密碼錯誤');
            }
        });

        // ★★★ 新增：管理員切換上下線狀態 ★★★
        socket.on('adminToggleStatus', async (data) => {
            // data = { isOnline: true/false }
            await Shop.updateOne({ shopId }, { isOnline: data.isOnline });
            
            // 廣播給所有連上這個 shop 的 socket (包含管理員自己和前台客戶)
            const sockets = await io.fetchSockets();
            for (const s of sockets) {
                if (s.handshake.auth.shopId === shopId) {
                    s.emit('shopStatusUpdate', { isOnline: data.isOnline });
                }
            }
        });

        socket.on('adminJoinUser', async ({ userId }) => {
            // ★★★ 當管理員點擊使用者，將該使用者的訊息標示為已讀 ★★★
            await Message.updateMany(
                { shopId, userId, sender: 'user', isRead: false },
                { $set: { isRead: true } }
            );
             // ★★★ 通知管理員前端，該使用者的未讀計數歸零 ★★★
            socket.emit('unreadCountReset', { userId });

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
        userId = 'guest_' + Math.random().toString(36).substr(2, 9);
        userName = '訪客';
        socket.emit('forceGuestMode', { userId, userName });
    } else if (!userId) {
        userId = 'guest_' + Math.random().toString(36).substr(2, 9);
        userName = '訪客';
        socket.emit('forceGuestMode', { userId, userName });
    }

    const roomName = `${shopId}_${userId}`;
    socket.join(roomName);

    // ★★★ 新增：連線時，告訴使用者目前客服狀態 ★★★
    socket.emit('shopStatusUpdate', { isOnline: shopConfig.isOnline });

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

    // 接收使用者的足跡
    socket.on('pageChange', (data) => {
        io.to(`admin_${shopId}`).emit('userPageUpdate', {
            userId: userId,
            ...data
        });
    });

    // ★★★ 新增：接收使用者的 CRM 資料 ★★★
    socket.on('updateUserProfile', (data) => {
        // data 包含 email, tags, totalSpent 等
        // 廣播給該商店的管理員
        io.to(`admin_${shopId}`).emit('userProfileUpdate', {
            userId: userId, // 確保有 userId 才能對應
            ...data,
            // The userId from the data object is overridden to ensure it's the authenticated one
            userId: userId
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