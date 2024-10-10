const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { Configuration, OpenAI } = require('openai');
require('dotenv').config();  // For environment variables

const app = express();

// Parse incoming requests
app.use(bodyParser.json());

// Setup Telegram and OpenAI APIs
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});



// Telegram Bot Webhook Setup
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const thread = await openai.beta.threads.create();
    // If user types /start, send a welcome message
    if (text === '/start') {
        bot.sendMessage(chatId, 'Welcome to the AI-powered chatbot! How can I assist you today?');
    } else {
        try {
            console.log(thread)
            const createMessage = await openai.beta.threads.messages.create(thread.id,
                {
                    role: 'user',
                    content: text,
                },);
            // Send the user message to OpenAI API
            const run = await openai.beta.threads.runs.createAndPoll(thread, {
                assistant_id: 'asst_5905oWhC2IYlpzp0dMDJicjX'
            });
            const OpnApiMessages = await openai.beta.threads.messages.list(
                run.thread_id)
            for (const message of OpnApiMessages.data) {
                if (message.content[0].type == 'text') {
                    console.log(`message : ${message.role} > ${message.content[0].text.value}`);
                    console.log(text)
                    // Extract the response from OpenAI
                    const aiMessage = message.content[0].text.value;
                    console.log(aiMessage)
                    // Send the AI's response back to the user
                    bot.sendMessage(chatId, aiMessage);
                }

            }

        } catch (error) {
            console.error('Error with OpenAI API:', error);
            bot.sendMessage(chatId, 'Sorry, something went wrong while processing your request.');
        }
    }
});

// Express Server
app.get('/', (req, res) => {
    res.send('Telegram Chatbot with OpenAI is running...');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
