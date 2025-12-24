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
    isOnline: { type: Boolean, default: true }
});

const MessageSchema = new mongoose.Schema({
    shopId: String,
    userId: String,
    userName: String,
    text: String,
    msgType: { type: String, default: 'text' }, 
    sender: String,
    timestamp: { type: Number, default: Date.now },
    isRead: { type: Boolean, default: false } 
});

// ★★★ 新增：顧客詳細資料模型 (UserProfile) ★★★
const UserProfileSchema = new mongoose.Schema({
    shopId: { type: String, required: true },
    userId: { type: String, required: true }, // 複合索引鍵
    userName: String,
    email: String,
    mobile: String,
    tags: String,
    totalSpent: String,
    ordersCount: String,
    riskScore: { type: Number, default: 0 },
    acceptsMarketing: String,
    accountStatus: String,
    loginType: String,
    lastUpdated: { type: Date, default: Date.now }
});
// 建立複合索引，確保同一商店同一用戶只有一筆資料
UserProfileSchema.index({ shopId: 1, userId: 1 }, { unique: true });

const Shop = mongoose.model('Shop', ShopSchema);
const Message = mongoose.model('Message', MessageSchema);
// ★ 註冊 UserProfile 模型
const UserProfile = mongoose.model('UserProfile', UserProfileSchema);

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
    if (!shopConfig.secretKey) {
        return String(token).trim() === String(shopConfig.publicToken).trim();
    }
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
                    shopPlan: shop.plan
                });

                // 1. 取得訊息與未讀統計
                const msgs = await Message.find({ shopId });
                const users = {};
                const unreadStats = {}; 

                msgs.forEach(m => {
                    if (m.userId && m.sender !== 'admin') {
                        users[m.userId] = m.userName || m.userId;
                        if (m.sender === 'user' && m.isRead === false) {
                            unreadStats[m.userId] = (unreadStats[m.userId] || 0) + 1;
                        }
                    }
                });

                // 2. ★★★ 取得所有已儲存的顧客資料 (UserProfile) ★★★
                const profiles = await UserProfile.find({ shopId });
                // 轉成 Map 格式方便前端使用: { userId: profileObj, ... }
                const profileMap = {};
                profiles.forEach(p => {
                    profileMap[p.userId] = p;
                });

                // 3. 一併傳給前端 (users, unreadStats, userProfiles)
                socket.emit('initUserList', { users, unreadStats, userProfiles: profileMap });

            } else {
                socket.emit('loginError', '密碼錯誤');
            }
        });

        socket.on('adminToggleStatus', async (data) => {
            await Shop.updateOne({ shopId }, { isOnline: data.isOnline });
            const sockets = await io.fetchSockets();
            for (const s of sockets) {
                if (s.handshake.auth.shopId === shopId) {
                    s.emit('shopStatusUpdate', { isOnline: data.isOnline });
                }
            }
        });

        socket.on('adminJoinUser', async ({ userId }) => {
            // 更新未讀狀態
            const result = await Message.updateMany(
                { shopId, userId, sender: 'user', isRead: { $ne: true } }, 
                { $set: { isRead: true } }
            );
            console.log(`[系統] 用戶 ${userId} 已讀更新筆數: ${result.modifiedCount}`); 

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

        return; 
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
    
    if (userId && !userId.startsWith('guest_')) {
        isVerified = verifyIdentity(shopConfig, auth);
    } else if (userId && userId.startsWith('guest_')) {
        isVerified = true; 
    }

    if (!isVerified || !userId) {
        userId = 'guest_' + Math.random().toString(36).substr(2, 9);
        userName = '訪客';
        socket.emit('forceGuestMode', { userId, userName });
    }

    const roomName = `${shopId}_${userId}`;
    socket.join(roomName);

    socket.emit('shopStatusUpdate', { isOnline: shopConfig.isOnline });

    const history = await Message.find({ shopId, userId }).sort({ timestamp: 1 });
    socket.emit('history', history);

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

    socket.on('pageChange', (data) => {
        io.to(`admin_${shopId}`).emit('userPageUpdate', {
            userId: userId,
            ...data
        });
    });

    // ★★★ 新增：接收並「儲存」使用者的 CRM 資料 ★★★
    socket.on('updateUserProfile', async (data) => {
        // 1. 廣播給該商店的管理員 (即時顯示用)
        io.to(`admin_${shopId}`).emit('userProfileUpdate', {
            userId: userId, 
            ...data,
            userId: userId
        });

        // 2. ★ 存入 MongoDB (UPSERT: 有則更新，無則新增)
        try {
            await UserProfile.findOneAndUpdate(
                { shopId: shopId, userId: userId }, // 搜尋條件
                { 
                    $set: {
                        userName: data.userName, // 確保名字也存進去
                        email: data.email,
                        mobile: data.mobile,
                        tags: data.tags,
                        totalSpent: data.totalSpent,
                        ordersCount: data.ordersCount,
                        riskScore: data.riskScore,
                        acceptsMarketing: data.acceptsMarketing,
                        accountStatus: data.accountStatus,
                        loginType: data.loginType,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true, new: true } // 如果沒有就新增
            );
            // console.log(`[CRM] 已儲存用戶資料: ${userId}`);
        } catch (err) {
            console.error(`[CRM] 儲存失敗: ${err.message}`);
        }
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