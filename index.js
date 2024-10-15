const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { Configuration, OpenAI } = require('openai');
const PocketBase = require('pocketbase/cjs');  // Import PocketBase
require('dotenv').config();  // For environment variables

const app = express();
app.use(bodyParser.json());

// Setup Telegram and OpenAI APIs
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// Initialize PocketBase
const pb = new PocketBase('https://unia-pb.nestgit.com'); // Change URL if necessary

// Function to add or update user in PocketBase
// Function to add or update user in PocketBase
// Function to add or update user in PocketBase
async function addOrUpdateUserInPocketBase(chatId, username, firstName, lastName, newMessage, threadId) {
    try {
        // Check if user exists based on chatId
        const existingRecords = await pb.collection('threads').getFullList({
            filter: `telegram_chat_id="${chatId}"`
        });

        const date = new Date().toLocaleString(); // Timestamp

        if (existingRecords.length > 0) {
            // If user exists, update the message count, chat history, and last message date
            const userRecord = existingRecords[0];
            const updatedCount = (userRecord.messages_counter || 0) + 1;

            // Append the new message to the existing chat history
            const updatedChatHistory = `${userRecord.chat_history}\n[${date}] ${newMessage}`;

            await pb.collection('threads').update(userRecord.id, {
                chat_history: updatedChatHistory,  // Append new message to chat history
                messages_counter: updatedCount,
                updated_at: date,
                thread_id: threadId || userRecord.thread_id,  // Ensure thread ID is stored/updated
            });
            console.log('User updated in PocketBase successfully.');
        } else {
            // If user doesn't exist, create a new record
            await pb.collection('threads').create({
                full_name: `${firstName} ${lastName}`,
                thread_id: threadId,  // Store the thread ID when creating the user record
                telegram_chat_id: chatId,
                chat_history: `[${date}] ${newMessage}`,  // Initialize chat history with the new message
                messages_counter: 1,
                created_at: date,
            });
            console.log('User added to PocketBase successfully.');
        }
    } catch (error) {
        console.error('Error adding/updating user in PocketBase:', error);
    }
}


// Telegram Bot Webhook Setup
// Telegram Bot Webhook Setup
// Telegram Bot Webhook Setup
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const username = msg.chat.username || '';
    const firstName = msg.chat.first_name || '';
    const lastName = msg.chat.last_name || '';

    // Check if the user already has a thread ID in PocketBase
    const existingRecords = await pb.collection('threads').getFullList({
        filter: `telegram_chat_id="${chatId}"`
    });

    let threadId;
    if (existingRecords.length > 0 && existingRecords[0].thread_id) {
        // If a thread ID exists for this user, use it
        threadId = existingRecords[0].thread_id;
        console.log('Continuing conversation with thread ID:', threadId);
    } else {
        // Otherwise, create a new thread and store the ID
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
        console.log('Starting new conversation with thread ID:', threadId);
    }

    // Add or update user details in PocketBase, passing the thread ID
    await addOrUpdateUserInPocketBase(chatId, username, firstName, lastName, text, threadId);

    // If user types /start, send a welcome message
    if (text === '/start') {
        bot.sendMessage(chatId, 'Welcome to the AI-powered chatbot! How can I assist you today?');
    } else {
        try {
            // Send the user's message to the OpenAI assistant
            const createMessage = await openai.beta.threads.messages.create(threadId, {
                role: 'user',
                content: text,
            });
            const run = await openai.beta.threads.runs.createAndPoll(threadId, {
                assistant_id: 'asst_5905oWhC2IYlpzp0dMDJicjX'
            });

            const OpnApiMessages = await openai.beta.threads.messages.list(run.thread_id);

            for (const message of OpnApiMessages.data) {
                if (message.content[0].type == 'text' && message.role == 'assistant') {
                    const aiMessage = message.content[0].text.value;
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
    res.send('Telegram Chatbot with OpenAI and PocketBase is running...');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
