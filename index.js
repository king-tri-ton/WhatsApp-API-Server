const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config'); // Импортируем конфиг

const mediaPath = path.join(__dirname, 'media');
if (!fs.existsSync(mediaPath)) fs.mkdirSync(mediaPath, { recursive: true });

const app = express();
app.use(express.json());
app.use('/media', express.static(mediaPath));

const client = new Client({ authStrategy: new LocalAuth() });

// Главная страница (например, информация о сервере)
app.get('/', (req, res) => {
    res.send('<h1>Сервер компании Веб-Тритон для собственный API WhatsApp</h1>');
});

// API документация
app.get('/api/v1/docs', (req, res) => {
    const documentation = {
        description: 'Документация API для работы с WhatsApp через сервер Веб-Тритон.',
        routes: [
            {
                method: 'GET',
                route: '/',
                description: 'Главная страница сервера.',
                response: 'HTML с текстом "Сервер компании Веб-Тритон для собственный API WhatsApp"'
            },
            {
                method: 'POST',
                route: '/api/v1/send-message',
                description: 'Отправить сообщение на указанный номер.',
                parameters: {
                    phone: 'Номер телефона получателя в формате E.164 (например, 79161234567)',
                    message: 'Текст сообщения'
                },
                headers: {
                    Authorization: 'Bearer <your_token_here>' // Указываем, что нужно передать токен в заголовке
                },
                response: {
                    success: 'true/false',
                    message: 'Сообщение успешно отправлено или ошибка'
                }
            },
            {
                method: 'POST',
                route: '/api/v1/send-code',
                description: 'Отправить код на указанный номер.',
                parameters: {
                    phone: 'Номер телефона получателя',
                    message: 'Текст сообщения',
                    code: 'Код, который будет отправлен'
                },
                headers: {
                    Authorization: 'Bearer <your_token_here>' // Указываем, что нужно передать токен в заголовке
                },
                response: {
                    success: 'true/false',
                    message: 'Сообщение с кодом отправлено или ошибка'
                }
            },
            {
                method: 'POST',
                route: '/api/v1/receive-message',
                description: 'Получить сообщение, переданное через WhatsApp.',
                parameters: {
                    phone: 'Номер телефона отправителя',
                    message: 'Текст сообщения',
                    media: 'URL медиафайла, если он был прикреплен'
                },
                headers: {
                    Authorization: 'Bearer <your_token_here>' // Указываем, что нужно передать токен в заголовке
                },
                response: {
                    success: 'true/false',
                    message: 'Сообщение успешно передано в CRM или ошибка'
                }
            }
        ],
        authentication: {
            description: 'Для работы с защищёнными маршрутами необходимо передавать токен авторизации в заголовке запроса.',
            example: 'Authorization: Bearer <your_token_here>',
            note: 'Токен можно получить, обратившись к администратору или через соответствующий механизм вашего API.'
        }
    };

    // Отправляем JSON с документацией
    res.json(documentation);
});

// Middleware для проверки токена
function verifyToken(req, res, next) {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token || token !== config.AUTH_TOKEN) {
        return res.status(403).json({ success: false, error: 'Неверный или отсутствующий токен' });
    }
    next(); // Токен валидный, продолжаем выполнение
}

// Защищенные маршруты, которые используют токен
app.post('/api/v1/send-message', verifyToken, async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ success: false, error: 'Номер и сообщение обязательны' });

    try {
        await client.sendMessage(`${phone.replace(/[^0-9]/g, '')}@c.us`, message);
        res.json({ success: true, message: 'Сообщение успешно отправлено' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/v1/send-code', verifyToken, async (req, res) => {
    const { phone, message, code } = req.body;
    if (!phone || !message || !code) return res.status(400).json({ success: false, error: 'Все параметры обязательны' });
    try {
        await client.sendMessage(`${phone}@c.us`, `${message} ${code}`);
        res.json({ success: true, message: 'Код успешно отправлен' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

client.on('qr', qr => qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => console.log(url)));
client.on('ready', () => {
    console.log('WhatsApp Web готов');
});

client.on('message', async msg => {
    let messageContent = msg.body || '';
    let mediaUrl = null;

    if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        let ext = media.mimetype.split('/')[1].split(';')[0];
        const filename = `${Date.now()}.${ext}`;
        const filePath = path.join(mediaPath, filename);
        fs.writeFileSync(filePath, media.data, 'base64');
        mediaUrl = `${msg.id.remote}/media/${filename}`;

        messageContent = messageContent ? `${messageContent}\nМедиафайл: ${mediaUrl}` : `Медиафайл: ${mediaUrl}`;
    }

    try {
        const response = await axios.post(config.CRM_URL, {
            phone: msg.from.replace('@c.us', ''),
            message: messageContent,
            media: mediaUrl
        });
        console.log('Сообщение передано в CRM:', response.data);
    } catch (error) {
        console.error('Ошибка при передаче сообщения в CRM:', error.message);
    }
});

client.initialize();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API запущен на http://localhost:${PORT}`));
