const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Logging and monitoring system
const MAX_LOGS = 1000; // Limit log storage to prevent memory leaks
const serverLogs = [];
const requestStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    apiCalls: 0,
    startTime: new Date()
};

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('.'));

// Session configuration
app.use(session({
    secret: 'telegram-bot-admin-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Database setup
const db = new sqlite3.Database('./admin.db');

// Initialize database tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Bots table
    db.run(`CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT,
        tag TEXT,
        description TEXT,
        telegram_token TEXT NOT NULL,
        api_url TEXT,
        api_key TEXT,
        ai_model TEXT,
        database_id TEXT,
        system_prompt TEXT,
        is_active BOOLEAN DEFAULT 0,
        is_running BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Add ai_model column if it doesn't exist (for existing databases)
    db.run(`ALTER TABLE bots ADD COLUMN ai_model TEXT`, (err) => {
        // Ignore error if column already exists
    });

    // Add Telegram bot info columns if they don't exist
    db.run(`ALTER TABLE bots ADD COLUMN telegram_username TEXT`, (err) => {
        // Ignore error if column already exists
    });
    db.run(`ALTER TABLE bots ADD COLUMN telegram_first_name TEXT`, (err) => {
        // Ignore error if column already exists
    });
    db.run(`ALTER TABLE bots ADD COLUMN telegram_bot_id INTEGER`, (err) => {
        // Ignore error if column already exists
    });

    // Settings table for support AI configuration
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating settings table:', err);
        } else {
            // Insert default support AI settings
            const defaultSettings = [
                {
                    key: 'support_ai_api_url',
                    value: 'https://api.openai.com/v1',
                    description: 'API URL для AI поддержки'
                },
                {
                    key: 'support_ai_api_key',
                    value: '',
                    description: 'API ключ для AI поддержки'
                },
                {
                    key: 'support_ai_model',
                    value: 'gpt-4',
                    description: 'Модель AI для поддержки'
                },
                {
                    key: 'support_ai_enabled',
                    value: 'false',
                    description: 'Включена ли AI поддержка'
                }
            ];

            defaultSettings.forEach(setting => {
                db.run(`INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)`,
                    [setting.key, setting.value, setting.description]);
            });
        }
    });

    // Databases table
    db.run(`CREATE TABLE IF NOT EXISTS databases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        description TEXT,
        content TEXT,
        size_mb REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Add new columns if they don't exist (for existing databases)
    db.run(`ALTER TABLE databases ADD COLUMN description TEXT`, (err) => {
        // Ignore error if column already exists
    });
    db.run(`ALTER TABLE databases ADD COLUMN content TEXT`, (err) => {
        // Ignore error if column already exists
    });

    // Create default admin user (admin@admin.com / admin123)
    const defaultPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (email, password) VALUES (?, ?)`, 
        ['admin@admin.com', defaultPassword]);

    // Create default databases
    const defaultDatabases = [
        { 
            id: 'text-kb1', 
            name: 'Основная база знаний', 
            type: 'text', 
            description: 'Основная текстовая база знаний для ботов',
            content: 'Это основная база знаний. Здесь можно хранить любую текстовую информацию, которая будет передаваться AI модели как контекст.\n\nПример содержимого:\n- Часто задаваемые вопросы\n- Инструкции для пользователей\n- Правила и политики\n- Любая справочная информация',
            size: 0.5 
        },
        { 
            id: 'json-data1', 
            name: 'Аналитическая база', 
            type: 'json', 
            description: 'JSON база данных для структурированных данных',
            content: '{\n  "products": [\n    {\n      "id": 1,\n      "name": "Товар 1",\n      "price": 1000,\n      "category": "Электроника"\n    },\n    {\n      "id": 2,\n      "name": "Товар 2",\n      "price": 2000,\n      "category": "Одежда"\n    }\n  ],\n  "categories": ["Электроника", "Одежда", "Книги"],\n  "settings": {\n    "currency": "RUB",\n    "language": "ru"\n  }\n}',
            size: 0.2 
        }
    ];

    defaultDatabases.forEach(dbInfo => {
        db.run(`INSERT OR IGNORE INTO databases (id, name, type, description, content, size_mb) VALUES (?, ?, ?, ?, ?, ?)`,
            [dbInfo.id, dbInfo.name, dbInfo.type, dbInfo.description, dbInfo.content, dbInfo.size]);
    });

    // Create bot commands table
    db.run(`CREATE TABLE IF NOT EXISTS bot_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        json_code TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        is_multi_command BOOLEAN DEFAULT 0,
        allow_external_commands BOOLEAN DEFAULT 1,
        parent_multi_command_id INTEGER DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bot_id) REFERENCES bots (id) ON DELETE CASCADE,
        FOREIGN KEY (parent_multi_command_id) REFERENCES bot_commands (id) ON DELETE CASCADE,
        UNIQUE(bot_id, name)
    )`);

    // Create chat history table for bot memory
    db.run(`CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        user_message TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bot_id) REFERENCES bots (id) ON DELETE CASCADE
    )`);

    // Create optimized indexes for better query performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_chat_history_bot_chat ON chat_history (bot_id, chat_id, timestamp DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bots_status ON bots (is_active, is_running)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bot_commands_lookup ON bot_commands (bot_id, name, is_active)`);

    // Add memory settings columns to bots table if they don't exist
    db.run(`ALTER TABLE bots ADD COLUMN memory_enabled BOOLEAN DEFAULT 0`, (err) => {
        // Ignore error if column already exists
    });
    db.run(`ALTER TABLE bots ADD COLUMN memory_messages_count INTEGER DEFAULT 5`, (err) => {
        // Ignore error if column already exists
    });

    // Add multi-command columns to bot_commands table if they don't exist
    db.run(`ALTER TABLE bot_commands ADD COLUMN is_multi_command BOOLEAN DEFAULT 0`, (err) => {
        // Ignore error if column already exists
    });
    db.run(`ALTER TABLE bot_commands ADD COLUMN allow_external_commands BOOLEAN DEFAULT 1`, (err) => {
        // Ignore error if column already exists
    });
    db.run(`ALTER TABLE bot_commands ADD COLUMN parent_multi_command_id INTEGER DEFAULT NULL`, (err) => {
        // Ignore error if column already exists
    });

    addLog('SUCCESS', 'DATABASE', 'All tables initialized successfully');
});

// Store for active bot instances
const activeBots = new Map();

// Store for multi-command contexts: "botId:chatId" -> commandId
const multiCommandContexts = new Map();

// Add log entry
function addLog(level, category, message, details = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        category: category.toUpperCase(),
        message,
        details
    };
    
    // Add to logs array with memory optimization
    serverLogs.unshift(logEntry); // Add to beginning for chronological order
    
    // Maintain log size limit to prevent memory leaks
    if (serverLogs.length > MAX_LOGS) {
        serverLogs.length = MAX_LOGS; // Truncate array efficiently
    }
    
    // Console output with colors (only in development)
    if (process.env.NODE_ENV !== 'production') {
        const colors = {
            ERROR: '\x1b[31m',
            WARNING: '\x1b[33m', 
            SUCCESS: '\x1b[32m',
            INFO: '\x1b[36m',
            RESET: '\x1b[0m'
        };
        
        const color = colors[level.toUpperCase()] || colors.INFO;
        console.log(`${color}[${timestamp}] ${level} ${category}:${colors.RESET} ${message}`);
        
        if (details && typeof details === 'object') {
            console.log(`${color}Details:${colors.RESET}`, details);
        }
    }
}

// Request logging middleware (optimized)
function logRequest(req, res, next) {
    const startTime = Date.now();
    requestStats.totalRequests++;
    
         // Skip logging for static assets to reduce noise
     if (!req.url.startsWith('/api/') && !req.url.startsWith('/auth/')) {
         return next();
     }
     
     // Skip detailed logging for frequently cached endpoints
     const skipDetailedLog = req.url === '/api/auth/check' || req.url === '/api/databases';
    
         // Log only if not skipping detailed logs
     if (!skipDetailedLog) {
         addLog('INFO', 'SERVER', `${req.method} ${req.url}`, {
             userAgent: req.get('User-Agent'),
             ip: req.ip
         });
     }
    
         // Override res.end to capture response time
     const originalEnd = res.end;
     res.end = function(...args) {
         const duration = Date.now() - startTime;
         // 304 Not Modified is a success response (cached data)
         const level = res.statusCode >= 400 ? 'ERROR' : 
                      (res.statusCode >= 300 && res.statusCode !== 304) ? 'WARNING' : 'INFO';
        
        if (res.statusCode < 400) {
            requestStats.successfulRequests++;
        } else {
            requestStats.failedRequests++;
        }
        
                 // Log response only if error, or not frequently cached endpoint
         if (res.statusCode >= 400 || !skipDetailedLog) {
             addLog(level, 'SERVER', `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`, {
                 statusCode: res.statusCode,
                 duration,
                 contentLength: res.get('Content-Length')
             });
         }
        
        originalEnd.apply(this, args);
    };
    
    next();
}

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
    addLog('ERROR', 'SERVER', 'Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    addLog('ERROR', 'SERVER', 'Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack
    });
    console.error('Unhandled Promise Rejection:', reason);
});

// Use optimized request logging
app.use(logRequest);

// Create callback handler for inline button presses
function createCallbackHandler(initialBotData) {
    return async (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;

        // Get fresh bot data from database
        db.get('SELECT * FROM bots WHERE id = ?', [initialBotData.id], async (err, freshBotData) => {
            if (err || !freshBotData) {
                console.error('Error getting fresh bot data for callback:', err);
                return;
            }

            // Check if bot is still supposed to be running
            if (!freshBotData.is_running) {
                addLog('WARNING', 'BOT', `Bot ${freshBotData.name} received callback but is marked as stopped, ignoring`, {
                    botId: freshBotData.id,
                    botName: freshBotData.name,
                    callbackData: data
                });
                return;
            }

            // Check if bot is still in activeBots
            if (!activeBots.has(initialBotData.id)) {
                addLog('WARNING', 'BOT', `Bot ${freshBotData.name} received callback but is not in activeBots, ignoring`, {
                    botId: freshBotData.id,
                    botName: freshBotData.name,
                    callbackData: data
                });
                return;
            }

            addLog('INFO', 'BOT', `CALLBACK PRESSED: "${data}"`, {
                botId: freshBotData.id,
                botName: freshBotData.name,
                callbackData: data,
                chatId: chatId
            });

            try {
                const telegramBot = activeBots.get(initialBotData.id);
                if (!telegramBot) {
                    return;
                }

                // Answer callback query to remove loading state
                await telegramBot.answerCallbackQuery(callbackQuery.id);

                // Check if we're in a multi-command context
                const contextKey = `${freshBotData.id}:${chatId}`;
                const currentMultiCommandId = multiCommandContexts.get(contextKey);
                
                // Build query based on context
                let query, params;
                if (currentMultiCommandId) {
                    // Check for commands within the current multi-command context
                    db.get('SELECT allow_external_commands FROM bot_commands WHERE id = ? AND bot_id = ?', 
                        [currentMultiCommandId, freshBotData.id], 
                        (err, multiCommand) => {
                            if (err || !multiCommand) {
                                // Fallback to normal command check
                                checkCallbackCommand(freshBotData, data, chatId, messageId, telegramBot);
                                return;
                            }
                            
                            if (multiCommand.allow_external_commands) {
                                // Allow both internal and external commands
                                query = 'SELECT * FROM bot_commands WHERE bot_id = ? AND name = ? AND is_active = 1 AND (parent_multi_command_id = ? OR parent_multi_command_id IS NULL)';
                                params = [freshBotData.id, data, currentMultiCommandId];
                            } else {
                                // Only internal commands of this multi-command
                                query = 'SELECT * FROM bot_commands WHERE bot_id = ? AND name = ? AND is_active = 1 AND parent_multi_command_id = ?';
                                params = [freshBotData.id, data, currentMultiCommandId];
                            }
                            
                            executeCallbackCommand(query, params, freshBotData, data, chatId, messageId, telegramBot);
                        }
                    );
                } else {
                    // Normal mode - check all commands
                    checkCallbackCommand(freshBotData, data, chatId, messageId, telegramBot);
                }
            } catch (error) {
                addLog('ERROR', 'BOT', `Error processing callback: ${data}`, {
                    botId: freshBotData.id,
                    error: error.message,
                    callbackData: data
                });
            }
        });
    };
}

function checkCallbackCommand(freshBotData, data, chatId, messageId, telegramBot) {
    db.get('SELECT * FROM bot_commands WHERE bot_id = ? AND name = ? AND is_active = 1', 
        [freshBotData.id, data], async (err, command) => {
        await handleCallbackResult(err, command, freshBotData, data, chatId, messageId, telegramBot);
    });
}

function executeCallbackCommand(query, params, freshBotData, data, chatId, messageId, telegramBot) {
    db.get(query, params, async (err, command) => {
        await handleCallbackResult(err, command, freshBotData, data, chatId, messageId, telegramBot);
    });
}

async function handleCallbackResult(err, command, freshBotData, data, chatId, messageId, telegramBot) {
    if (err) {
        addLog('ERROR', 'BOT', `Error checking callback command: ${data}`, {
            botId: freshBotData.id,
            error: err.message
        });
        return;
    }

    if (command) {
        // Found matching command - execute it
        addLog('SUCCESS', 'BOT', `CALLBACK COMMAND FOUND: ${command.name}`, {
            botId: freshBotData.id,
            commandName: command.name,
            callbackData: data
        });

        // Execute the command with message replacement
        await executeCommand(freshBotData, command, chatId, messageId);
    } else {
        // No matching command found - send info message
        addLog('INFO', 'BOT', `NO CALLBACK COMMAND: "${data}"`, {
            botId: freshBotData.id,
            callbackData: data,
            reason: 'No matching command found'
        });

        await telegramBot.sendMessage(chatId, `Действие "${data}" пока не настроено.`);
    }
}

// Create message handler for bot that always uses fresh data from database
function createBotMessageHandler(initialBotData) {
    return async (msg) => {
        const chatId = msg.chat.id;
        const messageText = msg.text;

        // Get fresh bot data from database for each message
        db.get('SELECT * FROM bots WHERE id = ?', [initialBotData.id], async (err, freshBotData) => {
            if (err || !freshBotData) {
                console.error('Error getting fresh bot data:', err);
                return;
            }

            // Check if bot is still supposed to be running
            if (!freshBotData.is_running) {
                addLog('WARNING', 'BOT', `Bot ${freshBotData.name} received message but is marked as stopped, ignoring`, {
                    botId: freshBotData.id,
                    botName: freshBotData.name,
                    messageText: messageText
                });
                return;
            }

            // Check if bot is still in activeBots
            if (!activeBots.has(initialBotData.id)) {
                addLog('WARNING', 'BOT', `Bot ${freshBotData.name} received message but is not in activeBots, ignoring`, {
                    botId: freshBotData.id,
                    botName: freshBotData.name,
                    messageText: messageText
                });
                return;
            }

            addLog('INFO', 'BOT', `USER MESSAGE: "${messageText}"`, {
                botId: freshBotData.id,
                botName: freshBotData.name,
                messageLength: messageText.length,
                fullUserMessage: messageText
            });

            if (!messageText) {
                const telegramBot = activeBots.get(initialBotData.id);
                if (telegramBot) {
                    telegramBot.sendMessage(chatId, 'Извините, я работаю только с текстовыми сообщениями.');
                }
                return;
            }

            try {
                // Check if we're in a multi-command context
                const contextKey = `${freshBotData.id}:${chatId}`;
                const currentMultiCommandId = multiCommandContexts.get(contextKey);
                
                // Check if message contains a custom command (with context)
                const commandExecuted = await checkAndExecuteCommand(freshBotData, messageText, chatId, currentMultiCommandId);
                
                if (!commandExecuted) {
                    // Get AI response using fresh bot data and chat history
                    const aiResponse = await callAIWithMemory(freshBotData, messageText, chatId);
                    
                    addLog('SUCCESS', 'BOT', `AI RESPONSE: "${aiResponse}"`, {
                        botId: freshBotData.id,
                        fullUserMessage: messageText,
                        fullAiResponse: aiResponse,
                        responseLength: aiResponse.length
                    });
                    
                    const telegramBot = activeBots.get(initialBotData.id);
                    if (telegramBot) {
                        telegramBot.sendMessage(chatId, aiResponse);
                    }
                }
            } catch (error) {
                console.error(`Error processing message for bot ${freshBotData.name}:`, error);
                const telegramBot = activeBots.get(initialBotData.id);
                if (telegramBot) {
                    telegramBot.sendMessage(chatId, 'Извините, произошла ошибка при обработке вашего сообщения.');
                }
            }
        });
    };
}

// Check if message contains a command and execute it
async function checkAndExecuteCommand(botData, userMessage, chatId, currentMultiCommandId = null) {
    return new Promise((resolve) => {
        // Get commands based on context
        let query, params;
        
        if (currentMultiCommandId) {
            // If we're in a multi-command context, get commands from that multi-command
            db.get('SELECT allow_external_commands FROM bot_commands WHERE id = ? AND bot_id = ?', 
                [currentMultiCommandId, botData.id], 
                (err, multiCommand) => {
                    if (err || !multiCommand) {
                        return resolve(false);
                    }
                    
                    if (multiCommand.allow_external_commands) {
                        // Allow both internal and external commands
                        query = 'SELECT * FROM bot_commands WHERE bot_id = ? AND is_active = 1 AND (parent_multi_command_id = ? OR parent_multi_command_id IS NULL)';
                        params = [botData.id, currentMultiCommandId];
                    } else {
                        // Only internal commands of this multi-command
                        query = 'SELECT * FROM bot_commands WHERE bot_id = ? AND is_active = 1 AND parent_multi_command_id = ?';
                        params = [botData.id, currentMultiCommandId];
                    }
                    
                    executeCommandCheck(query, params, botData, userMessage, chatId, resolve, currentMultiCommandId);
                }
            );
        } else {
            // Normal mode - get all active commands (including multi-commands)
            query = 'SELECT * FROM bot_commands WHERE bot_id = ? AND is_active = 1';
            params = [botData.id];
            executeCommandCheck(query, params, botData, userMessage, chatId, resolve);
        }
    });
}

function executeCommandCheck(query, params, botData, userMessage, chatId, resolve, currentMultiCommandId = null) {
    db.all(query, params, async (err, commands) => {
        if (err || !commands || commands.length === 0) {
            return resolve(false);
        }

        try {
            // First, ask AI to check if the message requests a command
            const commandCheckPrompt = `Проанализируй сообщение пользователя и определи, просит ли он выполнить одну из доступных команд.

Доступные команды:
${commands.map(cmd => `- ${cmd.name}: ${cmd.description}`).join('\n')}

Сообщение пользователя: "${userMessage}"

Если пользователь просит выполнить команду, ответь ТОЛЬКО названием команды (например: "open_menu").
Если команда не запрашивается, ответь "НЕТ".

Ответ:`;

            const aiResponse = await callAI({
                ...botData,
                system_prompt: 'Ты помощник для определения команд. Отвечай кратко и точно.'
            }, commandCheckPrompt);

            // Log user message and AI response for debugging
            addLog('INFO', 'BOT', `COMMAND CHECK - User: "${userMessage}" | AI: "${aiResponse.trim()}"`, {
                botId: botData.id,
                fullUserMessage: userMessage,
                fullAiResponse: aiResponse.trim(),
                availableCommands: commands.map(cmd => cmd.name).join(', ')
            });

            // Check if AI identified a command
            const requestedCommand = commands.find(cmd => 
                aiResponse.toLowerCase().includes(cmd.name.toLowerCase()) &&
                !aiResponse.toLowerCase().includes('нет')
            );

            if (requestedCommand) {
                addLog('SUCCESS', 'BOT', `COMMAND EXECUTED: ${requestedCommand.name} - User: "${userMessage}" | AI: "${aiResponse.trim()}"`, {
                    botId: botData.id,
                    commandName: requestedCommand.name,
                    fullUserMessage: userMessage,
                    fullAiResponse: aiResponse.trim()
                });

                // Check if this is a multi-command
                if (requestedCommand.is_multi_command) {
                    // Execute multi-command welcome message
                    await executeCommand(botData, requestedCommand, chatId, null, requestedCommand.id);
                } else {
                    // First, let AI respond to the user naturally
                    const naturalResponse = await callAI({
                        ...botData,
                        system_prompt: `Ты дружелюбный помощник. Пользователь просит "${requestedCommand.description || requestedCommand.name}". 

ВАЖНО: Просто кратко подтверди что выполняешь просьбу (1-2 предложения). НЕ создавай никакого меню или списка - это будет показано автоматически после твоего ответа.

Отвечай на запросы о меню коротко и дружелюбно, но без строгого следования шаблону. Важно, чтобы суть была ясна, а тон оставался helpful и непринуждённым. Можешь использовать разные формулировки, легкий юмор или даже смайлы — главное, чтобы ответ был понятным и человечным."

Примеры ответов:
"Уже открываю! Вот менюшка 😊"
"Лови список разделов — выбирай, что нравится!"
"Сейчас будет... барабанная дробь... меню!"
"Один момент, подгружаю вариантики для вас."
"Готово! Что из этого вам подойдёт?"

НЕ пиши списки, пункты меню или кнопки - только подтверждение!`
                    }, userMessage);

                    addLog('SUCCESS', 'BOT', `NATURAL AI RESPONSE BEFORE COMMAND: "${naturalResponse}"`, {
                        botId: botData.id,
                        commandName: requestedCommand.name,
                        naturalResponse: naturalResponse
                    });

                    const telegramBot = activeBots.get(botData.id);
                    if (telegramBot) {
                        // Send natural response first
                        await telegramBot.sendMessage(chatId, naturalResponse);
                        
                        // Small delay before showing menu
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // Then execute the command
                        await executeCommand(botData, requestedCommand, chatId);
                    }
                }
                
                return resolve(true);
            } else {
                addLog('INFO', 'BOT', `NO COMMAND - User: "${userMessage}" | AI: "${aiResponse.trim()}"`, {
                    botId: botData.id,
                    fullUserMessage: userMessage,
                    fullAiResponse: aiResponse.trim(),
                    reason: 'AI did not identify any command'
                });
            }

            return resolve(false);
        } catch (error) {
            addLog('ERROR', 'BOT', `Error checking commands for bot ${botData.id}`, {
                error: error.message,
                botId: botData.id
            });
            return resolve(false);
        }
    });
}

// Execute a specific command
async function executeCommand(botData, command, chatId, messageId = null, setMultiCommandContext = null) {
    try {
        const commandData = JSON.parse(command.json_code);
        const telegramBot = activeBots.get(botData.id);
        
        if (!telegramBot) {
            throw new Error('Bot not active');
        }

        addLog('SUCCESS', 'BOT', `Command executed: ${command.name}`, {
            botId: botData.id,
            commandName: command.name,
            commandType: commandData.type || 'unknown',
            isMultiCommand: command.is_multi_command
        });

        // Set multi-command context if specified
        if (setMultiCommandContext) {
            const contextKey = `${botData.id}:${chatId}`;
            multiCommandContexts.set(contextKey, setMultiCommandContext);
            addLog('INFO', 'BOT', `Multi-command context set for chat ${chatId}`, {
                botId: botData.id,
                chatId: chatId,
                multiCommandId: setMultiCommandContext
            });
        }

        // Handle different command types
        if (commandData.type === 'multi_command') {
            // Send welcome message for multi-command
            const welcomeText = commandData.welcome_message || commandData.description || 'Добро пожаловать в мульти-команду!';
            
            if (messageId) {
                await telegramBot.editMessageText(welcomeText, {
                    chat_id: chatId,
                    message_id: messageId
                });
            } else {
                await telegramBot.sendMessage(chatId, welcomeText);
            }
            
            // Set context for future commands in this chat
            // This would typically be stored in a database or memory
            
        } else if (commandData.type === 'menu') {
            // Send menu with inline keyboard
            const options = {
                reply_markup: {
                    inline_keyboard: commandData.buttons || []
                }
            };
            
            if (messageId) {
                // Edit existing message (for callback queries)
                await telegramBot.editMessageText(commandData.text || 'Выберите действие:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: options.reply_markup
                });
            } else {
                // Send new message (for text commands)
                await telegramBot.sendMessage(chatId, commandData.text || 'Выберите действие:', options);
            }
        }
        else if (commandData.type === 'message') {
            if (messageId) {
                // Edit existing message
                await telegramBot.editMessageText(commandData.text || 'Команда выполнена', {
                    chat_id: chatId,
                    message_id: messageId
                });
            } else {
                // Send new message
                await telegramBot.sendMessage(chatId, commandData.text || 'Команда выполнена');
            }
        }
        else if (commandData.type === 'keyboard') {
            // Reply keyboards can't be edited, always send new message
            const options = {
                reply_markup: {
                    keyboard: commandData.buttons || [],
                    resize_keyboard: true,
                    one_time_keyboard: commandData.one_time || false
                }
            };
            
            await telegramBot.sendMessage(chatId, commandData.text || 'Выберите действие:', options);
        }
        else {
            // Generic command
            const text = commandData.text || JSON.stringify(commandData, null, 2);
            
            if (messageId) {
                // Edit existing message
                await telegramBot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId
                });
            } else {
                // Send new message
                await telegramBot.sendMessage(chatId, text);
            }
        }

    } catch (error) {
        addLog('ERROR', 'BOT', `Failed to execute command: ${command.name}`, {
            error: error.message,
            botId: botData.id,
            commandName: command.name
        });

        const telegramBot = activeBots.get(botData.id);
        if (telegramBot) {
            // If editing failed, try sending a new message
            if (error.message && error.message.includes('message is not modified')) {
                addLog('INFO', 'BOT', `Message already contains same content, skipping update`, {
                    botId: botData.id,
                    commandName: command.name
                });
            } else if (messageId && (error.message && (error.message.includes('message to edit not found') || error.message.includes('message can\'t be edited')))) {
                // If edit failed, send new message instead
                addLog('WARNING', 'BOT', `Edit failed, sending new message instead`, {
                    botId: botData.id,
                    commandName: command.name,
                    error: error.message
                });
                
                try {
                    const commandData = JSON.parse(command.json_code);
                    if (commandData.type === 'menu') {
                        const options = {
                            reply_markup: {
                                inline_keyboard: commandData.buttons || []
                            }
                        };
                        await telegramBot.sendMessage(chatId, commandData.text || 'Выберите действие:', options);
                    } else {
                        await telegramBot.sendMessage(chatId, commandData.text || 'Команда выполнена');
                    }
                } catch (fallbackError) {
                    telegramBot.sendMessage(chatId, 'Ошибка выполнения команды.');
                }
            } else {
                telegramBot.sendMessage(chatId, 'Ошибка выполнения команды.');
            }
        }
    }
}

// AI API integration function
async function callAI(botData, userMessage) {
    const { api_url, api_key, ai_model, system_prompt, database_id } = botData;
    
    addLog('INFO', 'API', `callAI called for bot ${botData.id}`, {
        botId: botData.id,
        hasApiUrl: !!api_url,
        hasApiKey: !!api_key,
        hasModel: !!ai_model,
        hasSystemPrompt: !!(system_prompt && system_prompt.trim()),
        databaseId: database_id || 'none'
    });
    
    if (!api_url || !api_key || !ai_model) {
        return 'Бот не настроен правильно. Обратитесь к администратору.';
    }

    try {
        // Get database content if database is connected
        let databaseContent = '';
        if (database_id) {
            const database = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM databases WHERE id = ?', [database_id], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            
            if (database && database.content) {
                if (database.type === 'text') {
                    databaseContent = `\n\nБаза знаний:\n${database.content}`;
                } else if (database.type === 'json') {
                    databaseContent = `\n\nДанные из базы (JSON):\n${database.content}`;
                }
            }
        }

        let requestBody, headers, endpoint;
        
        // Prepare messages array for chat-based APIs
        const messages = [];
        
        // Combine system prompt with database content
        let combinedSystemPrompt = '';
        if (system_prompt && system_prompt.trim()) {
            combinedSystemPrompt = system_prompt.trim();
        }
        if (databaseContent) {
            combinedSystemPrompt += databaseContent;
        }
        
        if (combinedSystemPrompt) {
            messages.push({
                role: 'system',
                content: combinedSystemPrompt
            });
        }
        
        messages.push({
            role: 'user',
            content: userMessage
        });

        // Standard headers for all APIs
        headers = {
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json'
        };

        // Determine API type and format request
        if (api_url.includes('langdock.com')) {
            // LangDock API (Anthropic format) - system prompt handled separately
            endpoint = api_url;
            requestBody = {
                model: ai_model,
                max_tokens: 1024,
                messages: messages.filter(msg => msg.role !== 'system') // Remove system messages
            };
            
            // Add combined system prompt (includes database content)
            if (combinedSystemPrompt) {
                requestBody.system = combinedSystemPrompt;
            }
        }
        else if (api_url.includes('openai.com') || api_url.includes('api.openai.com')) {
            // OpenAI API
            endpoint = api_url.endsWith('/chat/completions') ? api_url : `${api_url}/chat/completions`;
            requestBody = {
                model: ai_model,
                messages: messages,
                max_tokens: 1024,
                temperature: 0.7,
                stream: false
            };
        }
        else if (api_url.includes('deepseek.com')) {
            // DeepSeek API (OpenAI compatible)
            endpoint = api_url.endsWith('/chat/completions') ? api_url : `${api_url}/chat/completions`;
            requestBody = {
                model: ai_model,
                messages: messages,
                max_tokens: 1024,
                temperature: 0.7,
                stream: false
            };
        }
        else if (api_url.includes('anthropic.com')) {
            // Anthropic Claude API
            endpoint = api_url;
            headers['anthropic-version'] = '2023-06-01';
            requestBody = {
                model: ai_model,
                max_tokens: 1024,
                messages: messages.filter(msg => msg.role !== 'system') // System prompt handled separately
            };
            
            // Add combined system prompt (includes database content)
            if (combinedSystemPrompt) {
                requestBody.system = combinedSystemPrompt;
            }
        }
        else if (api_url.includes('googleapis.com') || api_url.includes('generativelanguage')) {
            // Google Gemini API
            endpoint = api_url;
            headers = {
                'Content-Type': 'application/json'
            };
            // Add API key to URL for Google
            endpoint += `?key=${api_key}`;
            requestBody = {
                contents: [{
                    parts: [{
                        text: combinedSystemPrompt ? `${combinedSystemPrompt}\n\n${userMessage}` : userMessage
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 1024,
                    temperature: 0.7
                }
            };
        }
        else {
            // Generic OpenAI-compatible API (fallback)
            endpoint = api_url.endsWith('/chat/completions') ? api_url : `${api_url}/chat/completions`;
            requestBody = {
                model: ai_model,
                messages: messages,
                max_tokens: 1024,
                temperature: 0.7,
                stream: false
            };
        }

        addLog('INFO', 'API', `AI Request: ${getAPIType(api_url)} ${ai_model}`, {
            endpoint: endpoint,
            model: ai_model,
            hasSystemPrompt: !!(system_prompt && system_prompt.trim()),
            hasDatabaseContent: !!databaseContent,
            combinedPromptLength: combinedSystemPrompt.length,
            userMessage: userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : ''),
            databaseId: database_id || 'none'
        });
        
        requestStats.apiCalls++;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            addLog('ERROR', 'API', `AI API Error: ${response.status} ${response.statusText}`, {
                endpoint: endpoint,
                model: ai_model,
                statusCode: response.status,
                error: errorText
            });
            return `Ошибка AI API (${response.status}): Проверьте настройки ключа и модели.`;
        }

        const data = await response.json();
        
        // Log raw response data for debugging
        addLog('INFO', 'API', `RAW AI RESPONSE DATA: ${JSON.stringify(data)}`, {
            endpoint: endpoint,
            model: ai_model,
            rawResponseData: data
        });
        
        addLog('SUCCESS', 'API', `AI Response: ${getAPIType(api_url)} ${ai_model}`, {
            endpoint: endpoint,
            model: ai_model,
            responseLength: JSON.stringify(data).length
        });
        
        // Parse response based on API type
        let responseText;
        
        if (api_url.includes('langdock.com')) {
            // LangDock response format
            responseText = data.content?.[0]?.text || data.message?.content;
        }
        else if (api_url.includes('openai.com') || api_url.includes('deepseek.com') || api_url.includes('chat/completions')) {
            // OpenAI/DeepSeek/OpenAI-compatible response format
            responseText = data.choices?.[0]?.message?.content;
        }
        else if (api_url.includes('anthropic.com')) {
            // Anthropic Claude response format
            responseText = data.content?.[0]?.text;
        }
        else if (api_url.includes('googleapis.com') || api_url.includes('generativelanguage')) {
            // Google Gemini response format
            responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        }
        else {
            // Generic response parsing
            responseText = data.choices?.[0]?.message?.content || 
                         data.content?.[0]?.text || 
                         data.response || 
                         data.text || 
                         data.content;
        }

        const finalResponse = responseText || 'Получен пустой ответ от AI сервиса.';
        
        // Log final parsed response for debugging
        addLog('INFO', 'API', `FINAL AI RESPONSE: "${finalResponse}"`, {
            endpoint: endpoint,
            model: ai_model,
            finalResponse: finalResponse,
            responseLength: finalResponse.length
        });
        
        return finalResponse;
        
    } catch (error) {
        addLog('ERROR', 'API', 'AI API Connection Error', {
            endpoint: endpoint || api_url,
            model: ai_model,
            error: error.message,
            stack: error.stack
        });
        return 'Извините, не удалось связаться с AI сервисом. Проверьте настройки API и подключение к интернету.';
    }
}

// AI API integration function with memory support
async function callAIWithMemory(botData, userMessage, chatId) {
    addLog('INFO', 'BOT', `Memory check for bot ${botData.id}`, {
        botId: botData.id,
        memoryEnabled: botData.memory_enabled,
        memoryCount: botData.memory_messages_count,
        chatId: chatId,
        userMessage: userMessage.substring(0, 50) + '...'
    });

    // If memory is disabled, use regular AI call
    if (!botData.memory_enabled) {
        addLog('INFO', 'BOT', `Memory disabled for bot ${botData.id}, using regular AI call`);
        return await callAI(botData, userMessage);
    }

    const { api_url, api_key, ai_model, system_prompt, database_id, memory_messages_count } = botData;
    
    if (!api_url || !api_key || !ai_model) {
        return 'Бот не настроен правильно. Обратитесь к администратору.';
    }

    try {
        // Get chat history
        const chatHistory = await new Promise((resolve, reject) => {
            const limit = Math.min(memory_messages_count || 5, 50); // Max 50 messages
            db.all(`SELECT user_message, ai_response FROM chat_history 
                    WHERE bot_id = ? AND chat_id = ? 
                    ORDER BY timestamp DESC 
                    LIMIT ?`, 
                [botData.id, chatId, limit], 
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.reverse()); // Reverse to get chronological order
                }
            );
        });

        // Get database content if database is connected
        let databaseContent = '';
        if (database_id) {
            const database = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM databases WHERE id = ?', [database_id], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            
            if (database && database.content) {
                if (database.type === 'text') {
                    databaseContent = `\n\nБаза знаний:\n${database.content}`;
                } else if (database.type === 'json') {
                    databaseContent = `\n\nДанные из базы (JSON):\n${database.content}`;
                }
            }
        }

        let requestBody, headers, endpoint;
        
        // Prepare messages array for chat-based APIs
        const messages = [];
        
        // Combine system prompt with database content
        let combinedSystemPrompt = '';
        if (system_prompt && system_prompt.trim()) {
            combinedSystemPrompt = system_prompt.trim();
        }
        if (databaseContent) {
            combinedSystemPrompt += databaseContent;
        }
        
        if (combinedSystemPrompt) {
            messages.push({
                role: 'system',
                content: combinedSystemPrompt
            });
        }

        // Add chat history to messages
        chatHistory.forEach(historyItem => {
            messages.push({
                role: 'user',
                content: historyItem.user_message
            });
            messages.push({
                role: 'assistant',
                content: historyItem.ai_response
            });
        });
        
        // Add current user message
        messages.push({
            role: 'user',
            content: userMessage
        });

        // Standard headers for all APIs
        headers = {
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json'
        };

        // Determine API type and format request
        if (api_url.includes('langdock.com')) {
            // LangDock API (Anthropic format) - system prompt handled separately
            endpoint = api_url;
            requestBody = {
                model: ai_model,
                max_tokens: 1024,
                messages: messages.filter(msg => msg.role !== 'system') // Remove system messages
            };
            
            // Only add system field if system_prompt exists and is not empty
            if (combinedSystemPrompt) {
                requestBody.system = combinedSystemPrompt;
            }
        }
        else if (api_url.includes('openai.com') || api_url.includes('api.openai.com')) {
            // OpenAI API
            endpoint = api_url.endsWith('/chat/completions') ? api_url : `${api_url}/chat/completions`;
            requestBody = {
                model: ai_model,
                messages: messages,
                max_tokens: 1024,
                temperature: 0.7,
                stream: false
            };
        }
        else if (api_url.includes('deepseek.com')) {
            // DeepSeek API (OpenAI compatible)
            endpoint = api_url.endsWith('/chat/completions') ? api_url : `${api_url}/chat/completions`;
            requestBody = {
                model: ai_model,
                messages: messages,
                max_tokens: 1024,
                temperature: 0.7,
                stream: false
            };
        }
        else if (api_url.includes('anthropic.com')) {
            // Anthropic Claude API
            endpoint = api_url;
            headers['anthropic-version'] = '2023-06-01';
            requestBody = {
                model: ai_model,
                max_tokens: 1024,
                messages: messages.filter(msg => msg.role !== 'system') // System prompt handled separately
            };
            
            // Only add system field if system_prompt exists and is not empty
            if (combinedSystemPrompt) {
                requestBody.system = combinedSystemPrompt;
            }
        }
        else if (api_url.includes('googleapis.com') || api_url.includes('generativelanguage')) {
            // Google Gemini API
            endpoint = api_url;
            headers = {
                'Content-Type': 'application/json'
            };
            // Add API key to URL for Google
            endpoint += `?key=${api_key}`;
            
            // Convert messages to Gemini format
            let conversationText = '';
            if (combinedSystemPrompt) {
                conversationText += combinedSystemPrompt + '\n\n';
            }
            
            messages.filter(msg => msg.role !== 'system').forEach(msg => {
                conversationText += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
            });
            
            requestBody = {
                contents: [{
                    parts: [{
                        text: conversationText
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 1024,
                    temperature: 0.7
                }
            };
        }
        else {
            // Generic OpenAI-compatible API (fallback)
            endpoint = api_url.endsWith('/chat/completions') ? api_url : `${api_url}/chat/completions`;
            requestBody = {
                model: ai_model,
                messages: messages,
                max_tokens: 1024,
                temperature: 0.7,
                stream: false
            };
        }

        addLog('INFO', 'API', `AI Request with memory: ${getAPIType(api_url)} ${ai_model}`, {
            endpoint: endpoint,
            model: ai_model,
            hasSystemPrompt: !!combinedSystemPrompt,
            historyCount: chatHistory.length,
            userMessage: userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '')
        });
        
        requestStats.apiCalls++;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            addLog('ERROR', 'API', `AI API Error: ${response.status} ${response.statusText}`, {
                endpoint: endpoint,
                model: ai_model,
                statusCode: response.status,
                error: errorText
            });
            return `Ошибка AI API (${response.status}): Проверьте настройки ключа и модели.`;
        }

        const data = await response.json();
        addLog('SUCCESS', 'API', `AI Response with memory: ${getAPIType(api_url)} ${ai_model}`, {
            endpoint: endpoint,
            model: ai_model,
            responseLength: JSON.stringify(data).length,
            historyCount: chatHistory.length
        });
        
        // Parse response based on API type
        let responseText;
        
        if (api_url.includes('langdock.com')) {
            // LangDock response format
            responseText = data.content?.[0]?.text || data.message?.content;
        }
        else if (api_url.includes('openai.com') || api_url.includes('deepseek.com') || api_url.includes('chat/completions')) {
            // OpenAI/DeepSeek/OpenAI-compatible response format
            responseText = data.choices?.[0]?.message?.content;
        }
        else if (api_url.includes('anthropic.com')) {
            // Anthropic Claude response format
            responseText = data.content?.[0]?.text;
        }
        else if (api_url.includes('googleapis.com') || api_url.includes('generativelanguage')) {
            // Google Gemini response format
            responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        }
        else {
            // Generic response parsing
            responseText = data.choices?.[0]?.message?.content || 
                         data.content?.[0]?.text || 
                         data.response || 
                         data.text || 
                         data.content;
        }

        const finalResponse = responseText || 'Получен пустой ответ от AI сервиса.';
        
        // Save conversation to chat history
        db.run(`INSERT INTO chat_history (bot_id, chat_id, user_message, ai_response) 
                VALUES (?, ?, ?, ?)`,
            [botData.id, chatId, userMessage, finalResponse],
            (err) => {
                if (err) {
                    addLog('ERROR', 'DATABASE', 'Failed to save chat history', {
                        botId: botData.id,
                        chatId: chatId,
                        error: err.message
                    });
                } else {
                    addLog('INFO', 'DATABASE', 'Chat history saved', {
                        botId: botData.id,
                        chatId: chatId,
                        messageLength: userMessage.length,
                        responseLength: finalResponse.length
                    });
                }
            }
        );

        // Clean up old chat history (keep only last 100 messages per chat)
        // Optimized cleanup with better performance
        db.run(`DELETE FROM chat_history 
                WHERE bot_id = ? AND chat_id = ? 
                AND id NOT IN (
                    SELECT id FROM chat_history 
                    WHERE bot_id = ? AND chat_id = ? 
                    ORDER BY timestamp DESC 
                    LIMIT 100
                )`,
            [botData.id, chatId, botData.id, chatId],
            (err) => {
                if (err) {
                    addLog('WARNING', 'DATABASE', 'Failed to clean up old chat history', {
                        botId: botData.id,
                        chatId: chatId,
                        error: err.message
                    });
                }
            }
        );

        return finalResponse;
        
    } catch (error) {
        addLog('ERROR', 'API', 'AI API Connection Error with memory', {
            endpoint: endpoint || api_url,
            model: ai_model,
            error: error.message,
            stack: error.stack
        });
        return 'Извините, не удалось связаться с AI сервисом. Проверьте настройки API и подключение к интернету.';
    }
}

// AI API streaming function
async function callAIStreaming(botData, userMessage, res) {
    const { api_url, api_key, ai_model, system_prompt, database_id } = botData;
    
    if (!api_url || !api_key || !ai_model) {
        res.write(`data: ${JSON.stringify({ error: 'Бот не настроен правильно' })}\n\n`);
        res.end();
        return;
    }

    try {
        // Get database content if database is connected
        let databaseContent = '';
        if (database_id) {
            const database = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM databases WHERE id = ?', [database_id], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            
            if (database && database.content) {
                if (database.type === 'text') {
                    databaseContent = `\n\nБаза знаний:\n${database.content}`;
                } else if (database.type === 'json') {
                    databaseContent = `\n\nДанные из базы (JSON):\n${database.content}`;
                }
            }
        }

        let requestBody, headers, endpoint;
        
        // Prepare messages array for chat-based APIs
        const messages = [];
        
        // Combine system prompt with database content
        let combinedSystemPrompt = '';
        if (system_prompt && system_prompt.trim()) {
            combinedSystemPrompt = system_prompt.trim();
        }
        if (databaseContent) {
            combinedSystemPrompt += databaseContent;
        }
        
        if (combinedSystemPrompt) {
            messages.push({
                role: 'system',
                content: combinedSystemPrompt
            });
        }
        
        messages.push({
            role: 'user',
            content: userMessage
        });

        // Standard headers for all APIs
        headers = {
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json'
        };

        // Determine API type and format request for streaming
        if (api_url.includes('openai.com') || api_url.includes('api.openai.com')) {
            // OpenAI API
            endpoint = api_url.endsWith('/chat/completions') ? api_url : `${api_url}/chat/completions`;
            requestBody = {
                model: ai_model,
                messages: messages,
                max_tokens: 1024,
                temperature: 0.7,
                stream: true
            };
        }
        else if (api_url.includes('deepseek.com')) {
            // DeepSeek API (OpenAI compatible)
            endpoint = api_url.endsWith('/chat/completions') ? api_url : `${api_url}/chat/completions`;
            requestBody = {
                model: ai_model,
                messages: messages,
                max_tokens: 1024,
                temperature: 0.7,
                stream: true
            };
        }
        else {
            // For APIs that don't support streaming, fall back to regular call
            const response = await callAI(botData, userMessage);
            res.write(`data: ${JSON.stringify({ content: response })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
        }

        addLog('INFO', 'API', `AI Streaming Request: ${getAPIType(api_url)} ${ai_model}`, {
            endpoint: endpoint,
            model: ai_model,
            hasSystemPrompt: !!(system_prompt && system_prompt.trim()),
            userMessage: userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '')
        });
        
        requestStats.apiCalls++;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            addLog('ERROR', 'API', `AI Streaming API Error: ${response.status} ${response.statusText}`, {
                endpoint: endpoint,
                model: ai_model,
                statusCode: response.status,
                error: errorText
            });
            res.write(`data: ${JSON.stringify({ error: `Ошибка AI API (${response.status})` })}\n\n`);
            res.end();
            return;
        }

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        res.write('data: [DONE]\n\n');
                        res.end();
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        let content = '';
                        
                        // Handle different API response formats
                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                            content = parsed.choices[0].delta.content;
                        }
                        
                        if (content) {
                            res.write(`data: ${JSON.stringify({ content })}\n\n`);
                        }
                    } catch (e) {
                        // Ignore parsing errors for partial data
                    }
                }
            }
        }
        
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        addLog('ERROR', 'API', 'AI Streaming API Connection Error', {
            endpoint: endpoint || api_url,
            model: ai_model,
            error: error.message
        });
        res.write(`data: ${JSON.stringify({ error: 'Ошибка соединения с AI сервисом' })}\n\n`);
        res.end();
    }
}

// Helper function to identify API type
function getAPIType(api_url) {
    if (api_url.includes('langdock.com')) return 'LangDock';
    if (api_url.includes('openai.com')) return 'OpenAI';
    if (api_url.includes('deepseek.com')) return 'DeepSeek';
    if (api_url.includes('anthropic.com')) return 'Anthropic';
    if (api_url.includes('googleapis.com') || api_url.includes('generativelanguage')) return 'Google Gemini';
    return 'Generic OpenAI-compatible';
}

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Routes

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Check authentication status
app.get('/api/auth/check', (req, res) => {
    res.json({ authenticated: !!req.session.userId });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    addLog('INFO', 'AUTH', `Login attempt: ${email}`, {
        email: email,
        ip: req.ip
    });

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) {
            addLog('ERROR', 'DATABASE', 'Database error during login', {
                error: err.message,
                email: email
            });
            return res.status(500).json({ error: 'Database error' });
        }

        if (!user || !bcrypt.compareSync(password, user.password)) {
            addLog('WARNING', 'AUTH', `Login failed: Invalid credentials - ${email}`, {
                email: email,
                ip: req.ip
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.userEmail = user.email;
        
        addLog('SUCCESS', 'AUTH', `Login successful: ${email}`, {
            email: email,
            userId: user.id,
            ip: req.ip
        });
        
        res.json({ success: true, message: 'Login successful' });
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Get all bots
app.get('/api/bots', requireAuth, (req, res) => {
    db.all('SELECT * FROM bots ORDER BY created_at DESC', (err, bots) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Check if bots are actually running and update status
        bots.forEach(bot => {
            const isActuallyRunning = activeBots.has(bot.id);
            if (bot.is_running && !isActuallyRunning) {
                // Bot marked as running in DB but not actually running
                addLog('WARNING', 'BOT', `Bot ${bot.name} marked as running but not active, updating status`, {
                    botId: bot.id,
                    botName: bot.name
                });
                
                // Update database
                db.run('UPDATE bots SET is_running = 0 WHERE id = ?', [bot.id], (err) => {
                    if (err) {
                        addLog('ERROR', 'DATABASE', 'Failed to update bot status', {
                            botId: bot.id,
                            error: err.message
                        });
                    }
                });
                
                // Update the bot object for this response
                bot.is_running = 0;
            }
        });
        
        res.json(bots);
    });
});

// Create new bot
app.post('/api/bots', requireAuth, (req, res) => {
    const {
        name,
        tag,
        description,
        telegram_token,
        api_url,
        api_key,
        ai_model,
        database_id,
        system_prompt,
        is_active
    } = req.body;

    const botId = uuidv4();
    const username = `@${name.toLowerCase().replace(/\s+/g, '_')}_bot`;

    addLog('INFO', 'BOT', `Creating new bot: ${name}`, {
        botId: botId,
        name: name,
        aiModel: ai_model,
        userId: req.session.userId
    });

    db.run(`INSERT INTO bots (
        id, name, username, tag, description, telegram_token, 
        api_url, api_key, ai_model, database_id, system_prompt, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [botId, name, username, tag, description, telegram_token, 
     api_url, api_key, ai_model, database_id, system_prompt, is_active ? 1 : 0],
    function(err) {
        if (err) {
            addLog('ERROR', 'DATABASE', `Failed to create bot: ${name}`, {
                botId: botId,
                error: err.message,
                userId: req.session.userId
            });
            return res.status(500).json({ error: 'Failed to create bot' });
        }
        
        addLog('SUCCESS', 'BOT', `Bot created successfully: ${name}`, {
            botId: botId,
            name: name,
            userId: req.session.userId
        });
        
        res.json({ success: true, botId, message: 'Bot created successfully' });
    });
});

// Update bot
app.put('/api/bots/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const {
        name,
        tag,
        description,
        telegram_token,
        api_url,
        api_key,
        ai_model,
        database_id,
        system_prompt,
        is_active,
        memory_enabled,
        memory_messages_count
    } = req.body;

    // Get current bot data to check if it's running
    db.get('SELECT * FROM bots WHERE id = ?', [id], (err, currentBot) => {
        if (err || !currentBot) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        // Update bot in database
        db.run(`UPDATE bots SET 
            name = ?, tag = ?, description = ?, telegram_token = ?,
            api_url = ?, api_key = ?, ai_model = ?, database_id = ?, system_prompt = ?,
            is_active = ?, memory_enabled = ?, memory_messages_count = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        [name, tag, description, telegram_token, api_url, api_key, ai_model,
         database_id, system_prompt, is_active ? 1 : 0, memory_enabled ? 1 : 0, memory_messages_count || 5, id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update bot' });
            }

            // If bot is currently running, update its configuration in memory
            if (currentBot.is_running && activeBots.has(id)) {
                const runningBot = activeBots.get(id);
                
                // Check if Telegram token changed - if yes, need to restart
                if (currentBot.telegram_token !== telegram_token) {
                    console.log(`Bot ${name}: Telegram token changed, restarting...`);
                    
                    // Stop current bot
                    runningBot.stopPolling();
                    activeBots.delete(id);
                    
                    // Start with new token
                    try {
                        const newTelegramBot = new TelegramBot(telegram_token, { polling: true });
                        
                        // Create updated bot data object
                        const updatedBotData = {
                            id, name, telegram_token, api_url, api_key, ai_model, system_prompt
                        };
                        
                        newTelegramBot.on('message', createBotMessageHandler(updatedBotData));
                        newTelegramBot.on('callback_query', createCallbackHandler(updatedBotData));
                        newTelegramBot.on('polling_error', (error) => {
                            console.error(`Polling error for bot ${name}:`, error);
                        });
                        
                        activeBots.set(id, newTelegramBot);
                        console.log(`Bot ${name} restarted with new token`);
                        
                    } catch (error) {
                        console.error(`Failed to restart bot ${name}:`, error);
                        // Update database to mark bot as not running
                        db.run('UPDATE bots SET is_running = 0 WHERE id = ?', [id]);
                    }
                } else {
                    // Just update the bot configuration in memory (hot reload)
                    console.log(`Bot ${name}: Configuration updated (hot reload)`);
                    
                    // Update bot data in the active bots store
                    // The message handler will use fresh data from database on next message
                }
            }

            res.json({ success: true, message: 'Bot updated successfully' });
        });
    });
});

// Get bot info from Telegram
app.post('/api/bots/:id/refresh-info', requireAuth, (req, res) => {
    const { id } = req.params;

    db.get('SELECT * FROM bots WHERE id = ?', [id], (err, bot) => {
        if (err || !bot) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        if (!bot.telegram_token) {
            return res.status(400).json({ error: 'Bot has no Telegram token' });
        }

        try {
            const telegramBot = new TelegramBot(bot.telegram_token);
            
            telegramBot.getMe().then((botInfo) => {
                addLog('INFO', 'BOT', `Bot info refreshed: @${botInfo.username}`, {
                    botId: id,
                    telegramUsername: botInfo.username,
                    telegramFirstName: botInfo.first_name
                });
                
                // Update bot info in database
                db.run(`UPDATE bots SET 
                    telegram_username = ?, 
                    telegram_first_name = ?, 
                    telegram_bot_id = ?,
                    updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?`,
                    [botInfo.username, botInfo.first_name, botInfo.id, id],
                    function(err) {
                        if (err) {
                            addLog('ERROR', 'DATABASE', 'Failed to update bot Telegram info', {
                                botId: id,
                                error: err.message
                            });
                            return res.status(500).json({ error: 'Failed to update bot info' });
                        }
                        
                        res.json({ 
                            success: true, 
                            botInfo: {
                                username: botInfo.username,
                                first_name: botInfo.first_name,
                                id: botInfo.id
                            }
                        });
                    }
                );
            }).catch((error) => {
                addLog('WARNING', 'BOT', `Failed to get bot info: ${bot.name}`, {
                    botId: id,
                    error: error.message
                });
                res.status(400).json({ error: 'Failed to get bot info: ' + error.message });
            });

        } catch (error) {
            addLog('ERROR', 'BOT', `Error creating Telegram bot instance: ${bot.name}`, {
                botId: id,
                error: error.message
            });
            res.status(500).json({ error: 'Invalid Telegram token' });
        }
    });
});

// Start/Stop bot
app.post('/api/bots/:id/toggle', requireAuth, (req, res) => {
    const { id } = req.params;

    db.get('SELECT * FROM bots WHERE id = ?', [id], async (err, bot) => {
        if (err || !bot) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        const isCurrentlyRunning = bot.is_running;
        const newRunningState = !isCurrentlyRunning;

        if (newRunningState) {
            // Start bot
            addLog('INFO', 'BOT', `Starting bot: ${bot.name}`, {
                botId: id,
                name: bot.name,
                userId: req.session.userId
            });
            
            try {
                // Небольшая задержка перед запуском для избежания конфликтов
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const telegramBot = new TelegramBot(bot.telegram_token, { polling: true });
                
                // Get bot info from Telegram
                telegramBot.getMe().then((botInfo) => {
                    addLog('INFO', 'BOT', `Bot info retrieved: @${botInfo.username}`, {
                        botId: id,
                        telegramUsername: botInfo.username,
                        telegramFirstName: botInfo.first_name
                    });
                    
                    // Update bot info in database
                    db.run(`UPDATE bots SET 
                        telegram_username = ?, 
                        telegram_first_name = ?, 
                        telegram_bot_id = ?,
                        updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?`,
                        [botInfo.username, botInfo.first_name, botInfo.id, id],
                        (err) => {
                            if (err) {
                                addLog('ERROR', 'DATABASE', 'Failed to update bot Telegram info', {
                                    botId: id,
                                    error: err.message
                                });
                            }
                        }
                    );
                }).catch((error) => {
                    addLog('WARNING', 'BOT', `Failed to get bot info: ${bot.name}`, {
                        botId: id,
                        error: error.message
                    });
                });
                
                // AI-powered message handler
                telegramBot.on('message', createBotMessageHandler({ id, ...bot }));
                
                // Callback query handler for inline buttons
                telegramBot.on('callback_query', createCallbackHandler({ id, ...bot }));

                telegramBot.on('polling_error', (error) => {
                    addLog('ERROR', 'BOT', `Polling error for bot ${bot.name}`, {
                        botId: id,
                        error: error.message,
                        code: error.code,
                        statusCode: error.response?.statusCode
                    });
                    
                    // Handle Telegram conflict (409) - another instance is running
                    if (error.code === 'ETELEGRAM' && error.response?.statusCode === 409) {
                        addLog('WARNING', 'BOT', `Bot ${bot.name} stopped due to conflict (another instance running)`, {
                            botId: id,
                            statusCode: error.response.statusCode,
                            botName: bot.name
                        });
                        
                        telegramBot.stopPolling();
                        activeBots.delete(id);
                        
                        // Update database to mark bot as not running
                        db.run('UPDATE bots SET is_running = 0 WHERE id = ?', [id], (err) => {
                            if (err) {
                                addLog('ERROR', 'DATABASE', 'Error updating bot status after conflict', {
                                    botId: id,
                                    error: err.message
                                });
                            } else {
                                addLog('INFO', 'DATABASE', `Bot ${bot.name} status updated to stopped after conflict`, {
                                    botId: id,
                                    botName: bot.name
                                });
                            }
                        });
                        
                        // Don't automatically restart - let user manually restart
                        addLog('INFO', 'BOT', `Bot ${bot.name} stopped due to conflict. Manual restart required.`, {
                            botId: id,
                            botName: bot.name,
                            reason: 'Telegram API conflict - another instance may be running'
                        });
                    }
                    // Handle other polling errors
                    else if (error.code === 'ETELEGRAM') {
                        addLog('ERROR', 'BOT', `Telegram API error for bot ${bot.name}`, {
                            botId: id,
                            error: error.message,
                            code: error.code,
                            statusCode: error.response?.statusCode,
                            botName: bot.name
                        });
                        
                        // For other Telegram errors, try to restart after a longer delay
                        if (error.response?.statusCode >= 500) {
                            addLog('INFO', 'BOT', `Server error detected, will retry bot ${bot.name} in 60 seconds`, {
                                botId: id,
                                statusCode: error.response.statusCode
                            });
                            
                            setTimeout(() => {
                                if (!activeBots.has(id)) { // Only restart if not already running
                                    addLog('INFO', 'BOT', `Retrying bot ${bot.name} after server error`, {
                                        botId: id
                                    });
                                    // Trigger restart logic here if needed
                                }
                            }, 60000);
                        }
                    }
                });

                activeBots.set(id, telegramBot);
                addLog('SUCCESS', 'BOT', `Bot started successfully: ${bot.name}`, {
                    botId: id,
                    name: bot.name,
                    userId: req.session.userId
                });

            } catch (error) {
                addLog('ERROR', 'BOT', `Failed to start bot: ${bot.name}`, {
                    botId: id,
                    error: error.message,
                    userId: req.session.userId
                });
                return res.status(500).json({ error: 'Failed to start bot: ' + error.message });
            }
        } else {
            // Stop bot
            addLog('INFO', 'BOT', `Stopping bot: ${bot.name}`, {
                botId: id,
                name: bot.name,
                userId: req.session.userId
            });
            
            const telegramBot = activeBots.get(id);
            if (telegramBot) {
                try {
                    addLog('INFO', 'BOT', `Attempting to stop bot ${bot.name}...`, {
                        botId: id,
                        name: bot.name,
                        userId: req.session.userId
                    });
                    
                    // Сначала удаляем из активных ботов чтобы предотвратить новые сообщения
                    activeBots.delete(id);
                    
                    // Удаляем все обработчики событий
                    telegramBot.removeAllListeners();
                    
                    // Очищаем webhook если он был установлен
                    try {
                        await telegramBot.deleteWebHook();
                        addLog('INFO', 'BOT', `Webhook cleared for bot ${bot.name}`, {
                            botId: id,
                            name: bot.name
                        });
                    } catch (webhookError) {
                        // Webhook может не быть установлен, это нормально
                        addLog('INFO', 'BOT', `Webhook cleanup attempt for bot ${bot.name}: ${webhookError.message}`, {
                            botId: id,
                            name: bot.name
                        });
                    }
                    
                    // Останавливаем polling с повторными попытками
                    let stopAttempts = 0;
                    const maxAttempts = 3;
                    
                    while (stopAttempts < maxAttempts) {
                        try {
                            await telegramBot.stopPolling();
                            addLog('SUCCESS', 'BOT', `Bot polling stopped successfully: ${bot.name} (attempt ${stopAttempts + 1})`, {
                                botId: id,
                                name: bot.name,
                                attempt: stopAttempts + 1
                            });
                            break;
                        } catch (pollingError) {
                            stopAttempts++;
                            addLog('WARNING', 'BOT', `Stop polling attempt ${stopAttempts} failed for bot ${bot.name}: ${pollingError.message}`, {
                                botId: id,
                                name: bot.name,
                                attempt: stopAttempts,
                                error: pollingError.message
                            });
                            
                            if (stopAttempts < maxAttempts) {
                                // Ждем перед следующей попыткой
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                        }
                    }
                    
                    // Очищаем контексты мульти-команд для этого бота
                    for (const [contextKey, contextValue] of multiCommandContexts.entries()) {
                        if (contextKey.startsWith(`${id}_`)) {
                            multiCommandContexts.delete(contextKey);
                        }
                    }
                    
                    // Дополнительная задержка для полной остановки
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    addLog('SUCCESS', 'BOT', `Bot stopped and cleaned up successfully: ${bot.name}`, {
                        botId: id,
                        name: bot.name,
                        userId: req.session.userId,
                        stopAttempts: stopAttempts
                    });
                } catch (stopError) {
                    addLog('ERROR', 'BOT', `Error stopping bot ${bot.name}: ${stopError.message}`, {
                        botId: id,
                        name: bot.name,
                        error: stopError.message,
                        userId: req.session.userId
                    });
                    
                    // Принудительно удаляем из активных ботов даже при ошибке
                    activeBots.delete(id);
                }
            } else {
                addLog('INFO', 'BOT', `Bot ${bot.name} was not running`, {
                    botId: id,
                    name: bot.name,
                    userId: req.session.userId
                });
            }
        }

        // Update database
        db.run('UPDATE bots SET is_running = ? WHERE id = ?', [newRunningState ? 1 : 0, id], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to update bot status' });
            }
            
            const action = newRunningState ? 'started' : 'stopped';
            res.json({ 
                success: true, 
                message: `Bot ${action} successfully`,
                isRunning: newRunningState 
            });
        });
    });
});

// Delete bot
app.delete('/api/bots/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    // Stop bot if running
    const telegramBot = activeBots.get(id);
    if (telegramBot) {
        try {
            await telegramBot.stopPolling();
            telegramBot.removeAllListeners();
            
            try {
                await telegramBot.deleteWebHook();
            } catch (webhookError) {
                // Webhook может не быть установлен, это нормально
                addLog('INFO', 'BOT', `Webhook cleanup during deletion: ${webhookError.message}`, {
                    botId: id
                });
            }
            
            activeBots.delete(id);
            
            // Очищаем контексты мульти-команд для этого бота
            for (const [contextKey, contextValue] of multiCommandContexts.entries()) {
                if (contextKey.startsWith(`${id}_`)) {
                    multiCommandContexts.delete(contextKey);
                }
            }
            
            addLog('INFO', 'BOT', `Bot stopped and cleaned up for deletion`, {
                botId: id,
                userId: req.session.userId
            });
        } catch (stopError) {
            addLog('ERROR', 'BOT', `Error stopping bot during deletion: ${stopError.message}`, {
                botId: id,
                error: stopError.message,
                userId: req.session.userId
            });
            
            // Принудительно удаляем из активных ботов даже при ошибке
            activeBots.delete(id);
        }
    }

    db.run('DELETE FROM bots WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to delete bot' });
        }
        res.json({ success: true, message: 'Bot deleted successfully' });
    });
});

// Get all databases
app.get('/api/databases', requireAuth, (req, res) => {
    db.all('SELECT * FROM databases ORDER BY created_at DESC', (err, databases) => {
        if (err) {
            addLog('ERROR', 'DATABASE', 'Failed to fetch databases', {
                error: err.message,
                userId: req.session.userId
            });
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(databases);
    });
});

// Get single database
app.get('/api/databases/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM databases WHERE id = ?', [id], (err, database) => {
        if (err) {
            addLog('ERROR', 'DATABASE', `Failed to fetch database ${id}`, {
                error: err.message,
                databaseId: id,
                userId: req.session.userId
            });
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!database) {
            return res.status(404).json({ error: 'Database not found' });
        }
        
        res.json(database);
    });
});

// Create new database
app.post('/api/databases', requireAuth, (req, res) => {
    const { name, type, description, content } = req.body;
    
    if (!name || !type) {
        return res.status(400).json({ error: 'Name and type are required' });
    }
    
    // Validate type
    const allowedTypes = ['text', 'json'];
    if (!allowedTypes.includes(type)) {
        return res.status(400).json({ error: 'Invalid database type. Allowed types: text, json' });
    }
    
    const databaseId = require('crypto').randomUUID();
    const contentSize = content ? (content.length / 1024 / 1024) : 0; // Size in MB
    
    addLog('INFO', 'DATABASE', `Creating new database: ${name}`, {
        databaseId: databaseId,
        type: type,
        userId: req.session.userId
    });
    
    db.run(`INSERT INTO databases (id, name, type, description, content, size_mb) VALUES (?, ?, ?, ?, ?, ?)`,
        [databaseId, name, type, description || '', content || '', contentSize],
        function(err) {
            if (err) {
                addLog('ERROR', 'DATABASE', `Failed to create database: ${name}`, {
                    error: err.message,
                    userId: req.session.userId
                });
                return res.status(500).json({ error: 'Failed to create database' });
            }
            
            addLog('SUCCESS', 'DATABASE', `Database created: ${name}`, {
                databaseId: databaseId,
                type: type,
                userId: req.session.userId
            });
            
            res.json({ success: true, databaseId, message: 'Database created successfully' });
        }
    );
});

// Update database
app.put('/api/databases/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { name, description, content } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    const contentSize = content ? (content.length / 1024 / 1024) : 0; // Size in MB
    
    addLog('INFO', 'DATABASE', `Updating database: ${id}`, {
        databaseId: id,
        userId: req.session.userId
    });
    
    db.run(`UPDATE databases SET name = ?, description = ?, content = ?, size_mb = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [name, description || '', content || '', contentSize, id],
        function(err) {
            if (err) {
                addLog('ERROR', 'DATABASE', `Failed to update database: ${id}`, {
                    error: err.message,
                    databaseId: id,
                    userId: req.session.userId
                });
                return res.status(500).json({ error: 'Failed to update database' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Database not found' });
            }
            
            addLog('SUCCESS', 'DATABASE', `Database updated: ${id}`, {
                databaseId: id,
                userId: req.session.userId
            });
            
            res.json({ success: true, message: 'Database updated successfully' });
        }
    );
});

// Delete database
app.delete('/api/databases/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    
    // Check if database is used by any bots
    db.get('SELECT COUNT(*) as count FROM bots WHERE database_id = ?', [id], (err, result) => {
        if (err) {
            addLog('ERROR', 'DATABASE', `Error checking database usage: ${id}`, {
                error: err.message,
                databaseId: id,
                userId: req.session.userId
            });
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (result.count > 0) {
            return res.status(400).json({ error: 'Невозможно удалить базу данных, которая используется ботами' });
        }
        
        addLog('INFO', 'DATABASE', `Deleting database: ${id}`, {
            databaseId: id,
            userId: req.session.userId
        });
        
        db.run('DELETE FROM databases WHERE id = ?', [id], function(err) {
            if (err) {
                addLog('ERROR', 'DATABASE', `Failed to delete database: ${id}`, {
                    error: err.message,
                    databaseId: id,
                    userId: req.session.userId
                });
                return res.status(500).json({ error: 'Failed to delete database' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Database not found' });
            }
            
            addLog('SUCCESS', 'DATABASE', `Database deleted: ${id}`, {
                databaseId: id,
                userId: req.session.userId
            });
            
            res.json({ success: true, message: 'Database deleted successfully' });
        });
    });
});

// Dashboard stats
app.get('/api/dashboard/stats', requireAuth, (req, res) => {
    // Optimized: Single query with subqueries instead of multiple callbacks
    const statsQuery = `
        SELECT 
            (SELECT COUNT(*) FROM bots) as totalBots,
            (SELECT COUNT(*) FROM bots WHERE is_active = 1) as activeBots,
            (SELECT COUNT(*) FROM bots WHERE is_running = 1) as runningBots,
            (SELECT COUNT(*) FROM databases) as totalDatabases
    `;
    
    db.get(statsQuery, (err, stats) => {
        if (err) {
            addLog('ERROR', 'DATABASE', 'Failed to fetch dashboard stats', {
                error: err.message,
                userId: req.session.userId
            });
            return res.status(500).json({ error: 'Database error' });
        }
        
        res.json({
            totalBots: stats.totalBots || 0,
            activeBots: stats.activeBots || 0,
            runningBots: stats.runningBots || 0,
            totalDatabases: stats.totalDatabases || 0,
            ...requestStats,
            uptime: Date.now() - requestStats.startTime.getTime(),
            memoryUsage: process.memoryUsage()
        });
    });
});

// Dashboard chart data - messages over time
app.get('/api/dashboard/charts/messages', requireAuth, (req, res) => {
    const { period = '24h' } = req.query;
    
    let dateFilter;
    let groupBy;
    
    switch (period) {
        case '1h':
            dateFilter = "datetime(timestamp) >= datetime('now', '-1 hour')";
            groupBy = "strftime('%H:%M', timestamp)";
            break;
        case '24h':
            dateFilter = "datetime(timestamp) >= datetime('now', '-1 day')";
            groupBy = "strftime('%H:00', timestamp)";
            break;
        case '7d':
            dateFilter = "datetime(timestamp) >= datetime('now', '-7 days')";
            groupBy = "strftime('%m-%d', timestamp)";
            break;
        case '30d':
            dateFilter = "datetime(timestamp) >= datetime('now', '-30 days')";
            groupBy = "strftime('%m-%d', timestamp)";
            break;
        default:
            dateFilter = "datetime(timestamp) >= datetime('now', '-1 day')";
            groupBy = "strftime('%H:00', timestamp)";
    }
    
    const query = `
        SELECT 
            ${groupBy} as timeLabel,
            COUNT(*) as messageCount,
            COUNT(DISTINCT chat_id) as uniqueChats
        FROM chat_history 
        WHERE ${dateFilter}
        GROUP BY ${groupBy}
        ORDER BY timestamp ASC
    `;
    
    db.all(query, (err, results) => {
        if (err) {
            addLog('ERROR', 'DATABASE', 'Failed to fetch message chart data', {
                error: err.message,
                period: period
            });
            return res.status(500).json({ error: 'Database error' });
        }
        
        res.json({
            labels: results.map(r => r.timeLabel),
            datasets: [
                {
                    label: 'Сообщения',
                    data: results.map(r => r.messageCount),
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Уникальные чаты',
                    data: results.map(r => r.uniqueChats),
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderColor: 'rgb(16, 185, 129)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }
            ]
        });
    });
});

// Dashboard chart data - AI requests
app.get('/api/dashboard/charts/ai-requests', requireAuth, (req, res) => {
    const { period = '24h' } = req.query;
    
    // Since we don't have AI request history in DB, use request stats and generate mock data
    const now = Date.now();
    const labels = [];
    const data = [];
    
    let points, interval, format;
    
    switch (period) {
        case '1h':
            points = 12; // 5-minute intervals
            interval = 5 * 60 * 1000;
            format = 'HH:mm';
            break;
        case '24h':
            points = 24; // hourly
            interval = 60 * 60 * 1000;
            format = 'HH:00';
            break;
        case '7d':
            points = 7; // daily
            interval = 24 * 60 * 60 * 1000;
            format = 'MM-dd';
            break;
        case '30d':
            points = 30; // daily
            interval = 24 * 60 * 60 * 1000;
            format = 'MM-dd';
            break;
        default:
            points = 24;
            interval = 60 * 60 * 1000;
            format = 'HH:00';
    }
    
    const baseApiCalls = requestStats.apiCalls || 0;
    
    for (let i = points - 1; i >= 0; i--) {
        const time = new Date(now - (i * interval));
        labels.push(time.getHours().toString().padStart(2, '0') + ':00');
        
        // Generate realistic data based on current API calls
        const variation = Math.random() * 0.5 + 0.75; // 75-125% variation
        const pointValue = Math.floor((baseApiCalls / points) * variation);
        data.push(Math.max(0, pointValue));
    }
    
    res.json({
        labels,
        datasets: [
            {
                label: 'AI Запросы',
                data,
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                borderColor: 'rgb(168, 85, 247)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }
        ]
    });
});

// Dashboard chart data - system metrics
app.get('/api/dashboard/charts/system', requireAuth, (req, res) => {
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - requestStats.startTime.getTime();
    
    res.json({
        memory: {
            used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        },
        requests: {
            total: requestStats.totalRequests || 0,
            successful: requestStats.successfulRequests || 0,
            failed: requestStats.failedRequests || 0,
            successRate: requestStats.totalRequests ? 
                Math.round((requestStats.successfulRequests / requestStats.totalRequests) * 100) : 100
        },
        uptime: {
            ms: uptime,
            hours: Math.floor(uptime / (1000 * 60 * 60)),
            minutes: Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60))
        },
        activeBots: activeBots.size
    });
});

// Debug/Logs API
app.get('/api/debug/logs', requireAuth, (req, res) => {
    const { limit = 100, level, category } = req.query;
    
    let filteredLogs = serverLogs;
    
    if (level) {
        filteredLogs = filteredLogs.filter(log => log.level === level.toUpperCase());
    }
    
    if (category) {
        filteredLogs = filteredLogs.filter(log => log.category === category.toUpperCase());
    }
    
    res.json({
        logs: filteredLogs.slice(0, parseInt(limit)),
        total: filteredLogs.length
    });
});

// Debug/Stats API
app.get('/api/debug/stats', requireAuth, (req, res) => {
    const uptime = Date.now() - requestStats.startTime.getTime();
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    res.json({
        ...requestStats,
        uptime: {
            ms: uptime,
            formatted: `${uptimeHours}h ${uptimeMinutes}m`
        },
        activeBots: activeBots.size,
        memoryUsage: process.memoryUsage(),
        serverTime: new Date().toISOString()
    });
});

// Settings API
app.get('/api/settings', requireAuth, (req, res) => {
    db.all('SELECT * FROM settings ORDER BY key', (err, settings) => {
        if (err) {
            addLog('ERROR', 'DATABASE', 'Failed to fetch settings', {
                error: err.message,
                userId: req.session.userId
            });
            return res.status(500).json({ error: 'Failed to fetch settings' });
        }
        
        res.json(settings);
    });
});

app.put('/api/settings', requireAuth, (req, res) => {
    const { settings } = req.body;
    
    if (!settings || !Array.isArray(settings)) {
        return res.status(400).json({ error: 'Invalid settings data' });
    }

    const updatePromises = settings.map(setting => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`,
                [setting.value, setting.key],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    });

    Promise.all(updatePromises)
        .then(() => {
            addLog('SUCCESS', 'SETTINGS', 'Settings updated successfully', {
                settingsCount: settings.length,
                userId: req.session.userId
            });
            res.json({ success: true, message: 'Settings updated successfully' });
        })
        .catch(err => {
            addLog('ERROR', 'DATABASE', 'Failed to update settings', {
                error: err.message,
                userId: req.session.userId
            });
            res.status(500).json({ error: 'Failed to update settings' });
        });
});

// Support AI Chat API
// Bot Commands API

// Get all commands for a bot
app.get('/api/bots/:botId/commands', requireAuth, (req, res) => {
    const { botId } = req.params;
    
    db.all(`SELECT bc.*, parent.name as parent_name 
            FROM bot_commands bc 
            LEFT JOIN bot_commands parent ON bc.parent_multi_command_id = parent.id 
            WHERE bc.bot_id = ? 
            ORDER BY bc.parent_multi_command_id ASC, bc.created_at DESC`, 
        [botId], 
        (err, commands) => {
            if (err) {
                addLog('ERROR', 'API', `Failed to fetch commands for bot ${botId}`, {
                    error: err.message,
                    botId: botId,
                    userId: req.session.userId
                });
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, commands });
        }
    );
});

// Create new command for bot
app.post('/api/bots/:botId/commands', requireAuth, (req, res) => {
    const { botId } = req.params;
    const { name, description, json_code, is_active, is_multi_command, parent_multi_command_id, allow_external_commands } = req.body;
    
    if (!name || !json_code) {
        return res.status(400).json({ error: 'Name and JSON code are required' });
    }
    
    // Validate JSON
    try {
        JSON.parse(json_code);
    } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON format' });
    }
    
    addLog('INFO', 'BOT', `Creating command ${name} for bot ${botId}`, {
        botId: botId,
        commandName: name,
        userId: req.session.userId
    });
    
    db.run(`INSERT INTO bot_commands (bot_id, name, description, json_code, is_active, is_multi_command, parent_multi_command_id, allow_external_commands) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [botId, name, description || '', json_code, is_active ? 1 : 0, is_multi_command ? 1 : 0, parent_multi_command_id || null, allow_external_commands !== false ? 1 : 0],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Команда с таким именем уже существует для этого бота' });
                }
                
                addLog('ERROR', 'BOT', `Failed to create command ${name} for bot ${botId}`, {
                    error: err.message,
                    botId: botId,
                    commandName: name,
                    userId: req.session.userId
                });
                return res.status(500).json({ error: 'Failed to create command' });
            }
            
            addLog('SUCCESS', 'BOT', `Command ${name} created for bot ${botId}`, {
                botId: botId,
                commandName: name,
                commandId: this.lastID,
                userId: req.session.userId
            });
            
            res.json({ success: true, commandId: this.lastID, message: 'Command created successfully' });
        }
    );
});

// Update command
app.put('/api/bots/:botId/commands/:commandId', requireAuth, (req, res) => {
    const { botId, commandId } = req.params;
    const { name, description, json_code, is_active, is_multi_command, parent_multi_command_id, allow_external_commands } = req.body;
    
    if (!name || !json_code) {
        return res.status(400).json({ error: 'Name and JSON code are required' });
    }
    
    // Validate JSON
    try {
        JSON.parse(json_code);
    } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON format' });
    }
    
    addLog('INFO', 'BOT', `Updating command ${commandId} for bot ${botId}`, {
        botId: botId,
        commandId: commandId,
        commandName: name,
        userId: req.session.userId
    });
    
    db.run(`UPDATE bot_commands SET name = ?, description = ?, json_code = ?, is_active = ?, is_multi_command = ?, parent_multi_command_id = ?, allow_external_commands = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND bot_id = ?`,
        [name, description || '', json_code, is_active ? 1 : 0, is_multi_command ? 1 : 0, parent_multi_command_id || null, allow_external_commands !== false ? 1 : 0, commandId, botId],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Команда с таким именем уже существует для этого бота' });
                }
                
                addLog('ERROR', 'BOT', `Failed to update command ${commandId} for bot ${botId}`, {
                    error: err.message,
                    botId: botId,
                    commandId: commandId,
                    userId: req.session.userId
                });
                return res.status(500).json({ error: 'Failed to update command' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Command not found' });
            }
            
            addLog('SUCCESS', 'BOT', `Command ${commandId} updated for bot ${botId}`, {
                botId: botId,
                commandId: commandId,
                commandName: name,
                userId: req.session.userId
            });
            
            res.json({ success: true, message: 'Command updated successfully' });
        }
    );
});

// Delete command
app.delete('/api/bots/:botId/commands/:commandId', requireAuth, (req, res) => {
    const { botId, commandId } = req.params;
    
    addLog('INFO', 'BOT', `Deleting command ${commandId} for bot ${botId}`, {
        botId: botId,
        commandId: commandId,
        userId: req.session.userId
    });
    
    db.run('DELETE FROM bot_commands WHERE id = ? AND bot_id = ?', [commandId, botId], function(err) {
        if (err) {
            addLog('ERROR', 'BOT', `Failed to delete command ${commandId} for bot ${botId}`, {
                error: err.message,
                botId: botId,
                commandId: commandId,
                userId: req.session.userId
            });
            return res.status(500).json({ error: 'Failed to delete command' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Command not found' });
        }
        
        addLog('SUCCESS', 'BOT', `Command ${commandId} deleted for bot ${botId}`, {
            botId: botId,
            commandId: commandId,
            userId: req.session.userId
        });
        
        res.json({ success: true, message: 'Command deleted successfully' });
    });
});

// Clear multi-command context
app.delete('/api/bots/:botId/multi-command-context/:commandId', requireAuth, (req, res) => {
    const { botId, commandId } = req.params;
    
    addLog('INFO', 'BOT', `Clearing multi-command context for command ${commandId}`, {
        botId: botId,
        commandId: commandId,
        userId: req.session.userId
    });
    
    // Clear all contexts for this multi-command
    let clearedCount = 0;
    for (const [key, value] of multiCommandContexts.entries()) {
        if (value == commandId && key.startsWith(`${botId}:`)) {
            multiCommandContexts.delete(key);
            clearedCount++;
        }
    }
    
    addLog('SUCCESS', 'BOT', `Cleared ${clearedCount} multi-command contexts for command ${commandId}`, {
        botId: botId,
        commandId: commandId,
        clearedCount: clearedCount,
        userId: req.session.userId
    });
    
    res.json({ 
        success: true, 
        message: `Очищено ${clearedCount} контекстов мульти-команды`,
        clearedCount: clearedCount 
    });
});

// Chat history API endpoints
app.get('/api/bots/:botId/chat-history', requireAuth, (req, res) => {
    const { botId } = req.params;
    
    db.all(`SELECT * FROM chat_history 
            WHERE bot_id = ? 
            ORDER BY timestamp DESC 
            LIMIT 1000`, 
        [botId], 
        (err, rows) => {
            if (err) {
                addLog('ERROR', 'DATABASE', 'Failed to fetch chat history', {
                    botId: botId,
                    error: err.message
                });
                return res.status(500).json({ error: 'Failed to fetch chat history' });
            }
            
            addLog('INFO', 'API', `Chat history fetched for bot ${botId}`, {
                botId: botId,
                recordCount: rows.length
            });
            
            res.json({ 
                success: true, 
                history: rows 
            });
        }
    );
});

// Delete specific chat message
app.delete('/api/bots/:botId/chat-history/:messageId', requireAuth, (req, res) => {
    const { botId, messageId } = req.params;
    
    db.run('DELETE FROM chat_history WHERE id = ? AND bot_id = ?', 
        [messageId, botId], 
        function(err) {
            if (err) {
                addLog('ERROR', 'DATABASE', 'Failed to delete chat message', {
                    botId: botId,
                    messageId: messageId,
                    error: err.message
                });
                return res.status(500).json({ error: 'Failed to delete chat message' });
            }
            
            addLog('INFO', 'API', `Chat message deleted`, {
                botId: botId,
                messageId: messageId,
                deletedRows: this.changes
            });
            
            res.json({ 
                success: true, 
                message: 'Chat message deleted successfully' 
            });
        }
    );
});

// Clear all chat history for a bot
app.delete('/api/bots/:botId/chat-history', requireAuth, (req, res) => {
    const { botId } = req.params;
    
    db.run('DELETE FROM chat_history WHERE bot_id = ?', 
        [botId], 
        function(err) {
            if (err) {
                addLog('ERROR', 'DATABASE', 'Failed to clear chat history', {
                    botId: botId,
                    error: err.message
                });
                return res.status(500).json({ error: 'Failed to clear chat history' });
            }
            
            addLog('INFO', 'API', `Chat history cleared for bot ${botId}`, {
                botId: botId,
                deletedRows: this.changes
            });
            
            res.json({ 
                success: true, 
                message: 'Chat history cleared successfully' 
            });
        }
    );
});

app.post('/api/support/chat', requireAuth, async (req, res) => {
    const { message, stream = false } = req.body;
    
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        // Get support AI settings
        const settings = await new Promise((resolve, reject) => {
            db.all('SELECT key, value FROM settings WHERE key LIKE "support_ai_%"', (err, rows) => {
                if (err) reject(err);
                else {
                    const settingsObj = {};
                    rows.forEach(row => {
                        settingsObj[row.key] = row.value;
                    });
                    resolve(settingsObj);
                }
            });
        });

        if (!settings.support_ai_enabled || settings.support_ai_enabled !== 'true') {
            return res.status(400).json({ error: 'AI поддержка отключена' });
        }

        if (!settings.support_ai_api_key) {
            return res.status(400).json({ error: 'API ключ для поддержки не настроен' });
        }

        // Simplified system prompt
        const systemPrompt = `Вы - AI ассистент службы поддержки для админ панели управления Telegram ботами. Вы находитесь в разделе "ПОМОЩЬ" и помогаете пользователям разобраться с системой.
ВАЖНАЯ ИНФОРМАЦИЯ О ПЛАТФОРМЕ:
- Это система управления множественными Telegram ботами с AI интеграцией
- Поддерживает универсальные AI API: OpenAI (gpt-4, gpt-3.5-turbo), DeepSeek (deepseek-chat, deepseek-reasoner), LangDock (claude-3-7-sonnet), Anthropic (claude-3-sonnet), Google (gemini-pro)
- Имеет систему баз данных для знаний ботов
- Включает полный мониторинг, логирование и отладку в реальном времени
- Поддерживает получение реальных имен ботов из Telegram API
ТОЧНАЯ СТРУКТУРА НАВИГАЦИИ (боковое меню):
1. 📊 ПАНЕЛЬ - главная страница со статистикой активных ботов, общими данными
2. 🤖 БОТЫ - управление ботами с двумя вкладками:
   • "Все боты" - таблица всех ботов с кнопками "Запустить/Остановить", "Настроить", "Обновить" (получить реальное имя), "Перейти" (в Telegram)
   • "Создать бота" - форма создания нового бота
3. 🔧 ДЕБАГ - мониторинг системы в реальном времени:
   • Логи сервера с фильтрацией по уровням и категориям
   • Статистика системы (uptime, запросы, активные боты)
   • Автообновление каждые 5 секунд
4. ⚙️ НАСТРОЙКИ - конфигурация AI поддержки:
   • Включение/отключение AI поддержки (с индикатором статуса справа)
   • API URL, API ключ, модель AI
   • БЕЗ чата - только настройки!
5. 👥 АДМИНИСТРИРОВАНИЕ - управление пользователями (в разработке)
6. ❓ ПОМОЩЬ - ГДЕ ВЫ СЕЙЧАС НАХОДИТЕСЬ:
   • AI чат поддержки (этот разговор)
   • Здесь пользователи получают помощь по работе с системой
7. 🗄️ БАЗЫ ДАННЫХ - управление знаниями для ботов:
   • Текстовые базы - для передачи знаний в промпты AI
   • JSON базы - структурированные данные
ДЕТАЛЬНЫЕ ИНСТРУКЦИИ ПО РАЗДЕЛАМ:
🤖 СОЗДАНИЕ БОТА (раздел "Боты" → вкладка "Создать бота"):
1. Заполните "Имя бота" и "Описание"
2. Вставьте "Telegram токен" (получить у @BotFather в Telegram)
3. Настройте API: URL (например, https://api.openai.com/v1), ключ, модель
4. Выберите базу данных из списка (опционально)
5. Напишите системный промпт для бота
6. Нажмите "Создать бота"
7. Система автоматически получит реальное имя бота из Telegram

🔧 УПРАВЛЕНИЕ БОТАМИ (раздел "Боты" → вкладка "Все боты"):
• "Запустить/Остановить" - управление состоянием бота
• "Настроить" - редактирование всех параметров бота
• "Обновить" - получить реальное @username и имя из Telegram API
• "Перейти" - прямая ссылка на бота в Telegram (t.me/username)

⚙️ НАСТРОЙКИ AI ПОДДЕРЖКИ (раздел "Настройки"):
1. Включите "AI поддержка" (справа появится "AI поддержка активна")
2. Укажите API URL вашего AI провайдера
3. Вставьте API ключ
4. Выберите модель (gpt-4, claude-3-sonnet и др.)
5. Нажмите "Сохранить настройки"

🗄️ БАЗЫ ДАННЫХ (раздел "Базы данных"):
• Создавайте текстовые базы для знаний ботов
• JSON базы для структурированных данных
• Контент автоматически передается в промпты AI при общении

🔧 ОТЛАДКА (раздел "Дебаг"):
• Просматривайте логи в реальном времени
• Фильтруйте по уровням: INFO, SUCCESS, WARNING, ERROR
• Мониторьте статистику системы

ВАЖНЫЕ ОСОБЕННОСТИ:
- Боты получают реальные @username и имена из Telegram автоматически
- Поддержка hot reload - изменения применяются без перезапуска
- Универсальная поддержка всех популярных AI API
- Полное логирование всех операций
- Чат поддержки находится ТОЛЬКО в разделе "Помощь"

ОТВЕЧАЙТЕ:
- Указывайте точные пути: "Перейдите в раздел 'Боты' → вкладка 'Создать бота'"
- Называйте точные названия кнопок: "Нажмите 'Настроить'", "Кликните 'Обновить'"
- Объясняйте пошагово с номерами
- Если спрашивают про настройки поддержки - направляйте в раздел "Настройки"
- Если нужна помощь - говорите, что они уже в правильном месте (раздел "Помощь")
Будьте конкретным, дружелюбным и всегда указывайте точные пути навигации!

Так же вот зарнее загтолвенны данны для моделей если пользователь вдргу забыл или хочет создать предосоавть ему их что бы он выбраал и создал бота
Telegram Token
7597490946:AAEXtzMWPZ5lomjH077I7TuxSuk8HBl6glA
API URL
https://api.deepseek.com/chat/completions
API ключ
sk-99686799469b4e3b88b9c46cf193fa49
Модель AI
deepseek-chat

и вот

Telegram Token
8080616909:AAEyXBGdqTNiNJ26di2vTGStUzxoOfTlM94
API URL
https://api.langdock.com/anthropic/eu/v1/messages
API ключ
sk-rDI79uCHo_QYKbwLM6mTPMFmzHOZOXfEA_KR1oB1JKROobCVNE4JPcASHYYzDRMet1Z7LEWMiHdcLg5ZFbz5Gw
Модель AI
claude-3-7-sonnet-20250219

Отвечай кратко и по делу. Если пользователь поздоровался, просто поприветствуй и спроси чем можешь помочь. Не выдавай сразу длинные списки возможностей.`;

        if (stream) {
            // Set headers for SSE
            res.writeHead(200, {
                'Content-Type': 'text/plain',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });

            try {
                // Make streaming API call
                const supportBotData = {
                    api_url: settings.support_ai_api_url,
                    api_key: settings.support_ai_api_key,
                    ai_model: settings.support_ai_model,
                    system_prompt: systemPrompt,
                    database_id: null
                };
                
                const response = await callAIStreaming(supportBotData, message, res);

                addLog('INFO', 'SUPPORT', 'Support AI streaming request processed', {
                    userId: req.session.userId,
                    messageLength: message.length,
                    model: settings.support_ai_model
                });

            } catch (error) {
                addLog('ERROR', 'SUPPORT', 'Support AI streaming request failed', {
                    error: error.message,
                    userId: req.session.userId
                });
                res.write(`data: ${JSON.stringify({ error: 'Ошибка AI поддержки: ' + error.message })}\n\n`);
                res.end();
            }
        } else {
            // Make API call to support AI
            const supportBotData = {
                api_url: settings.support_ai_api_url,
                api_key: settings.support_ai_api_key,
                ai_model: settings.support_ai_model,
                system_prompt: systemPrompt,
                database_id: null
            };
            
            const response = await callAI(supportBotData, message);

            addLog('INFO', 'SUPPORT', 'Support AI request processed', {
                userId: req.session.userId,
                messageLength: message.length,
                model: settings.support_ai_model
            });

            res.json({ 
                success: true, 
                response: response 
            });
        }

    } catch (error) {
        addLog('ERROR', 'SUPPORT', 'Support AI request failed', {
            error: error.message,
            userId: req.session.userId
        });
        
        if (stream) {
            res.write(`data: ${JSON.stringify({ error: 'Ошибка AI поддержки: ' + error.message })}\n\n`);
            res.end();
        } else {
            res.status(500).json({ error: 'Ошибка AI поддержки: ' + error.message });
        }
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Periodic bot status check
setInterval(() => {
    db.all('SELECT id, name, is_running FROM bots WHERE is_running = 1', (err, runningBots) => {
        if (err) return;
        
        runningBots.forEach(bot => {
            const isActuallyRunning = activeBots.has(bot.id);
            if (!isActuallyRunning) {
                addLog('WARNING', 'BOT', `Bot ${bot.name} marked as running but not active, fixing status`, {
                    botId: bot.id,
                    botName: bot.name
                });
                
                db.run('UPDATE bots SET is_running = 0 WHERE id = ?', [bot.id], (err) => {
                    if (err) {
                        addLog('ERROR', 'DATABASE', 'Failed to fix bot status', {
                            botId: bot.id,
                            error: err.message
                        });
                    } else {
                        addLog('INFO', 'DATABASE', `Fixed bot ${bot.name} status to stopped`, {
                            botId: bot.id,
                            botName: bot.name
                        });
                    }
                });
            }
        });
    });
}, 60000); // Check every minute

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('📧 Default login: admin@admin.com');
    console.log('🔑 Default password: admin123');
    
    addLog('SUCCESS', 'SERVER', `Server started on port ${PORT}`, {
        port: PORT,
        nodeVersion: process.version,
        platform: process.platform
    });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    
    try {
        // Stop all running bots
        const stopPromises = [];
        activeBots.forEach((bot, id) => {
            stopPromises.push(
                Promise.resolve().then(async () => {
                    try {
                        await bot.stopPolling();
                        bot.removeAllListeners();
                        
                        try {
                            await bot.deleteWebHook();
                        } catch (webhookError) {
                            // Webhook может не быть установлен
                        }
                        
                        console.log(`✓ Stopped bot ${id}`);
                    } catch (error) {
                        console.log(`✗ Error stopping bot ${id}: ${error.message}`);
                    }
                })
            );
        });
        
        // Ждем остановки всех ботов
        await Promise.allSettled(stopPromises);
        console.log('All bots stopped');
        
        // Очищаем контексты мульти-команд
        multiCommandContexts.clear();
        console.log('Multi-command contexts cleared');
        
        // Close database
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed');
            }
            process.exit(0);
        });
        
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
}); 
