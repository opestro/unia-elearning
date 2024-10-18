const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { Configuration, OpenAI } = require('openai');
const { MongoClient } = require('mongodb');
require('dotenv').config();  // Load environment variables

const app = express();
app.use(bodyParser.json());

// Setup Telegram and OpenAI APIs
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;  // MongoDB URI from your .env file

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

let db;

// Function to connect to MongoDB
async function connectToMongoDB() {
    try {
        const client = new MongoClient(MONGO_URI);  // Removed deprecated options
        await client.connect();
        db = client.db('UNIA');  // Replace with your MongoDB database name
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);  // Exit if connection fails
    }
}

// Ensure MongoDB connection is established before handling bot messages
(async () => {
    await connectToMongoDB();  // Wait for the database to connect

    // Function to add or update user in MongoDB
    async function addOrUpdateUserInMongoDB(chatId, username, firstName, lastName, newMessage, threadId) {
        try {
            const usersCollection = db.collection('users');  // 'users' collection in MongoDB

            // Check if user exists by chatId
            const existingUser = await usersCollection.findOne({ telegram_chat_id: chatId });

            const date = new Date().toLocaleString(); // Timestamp

            if (existingUser) {
                // If user exists, update the message count, chat history, and last message date
                const updatedCount = (existingUser.messages_counter || 0) + 1;

                // Append the new message to the existing chat history
                const updatedChatHistory = `${existingUser.chat_history}\n[${date}] ${newMessage}`;

                await usersCollection.updateOne(
                    { telegram_chat_id: chatId },
                    {
                        $set: {
                            chat_history: updatedChatHistory,  // Append new message to chat history
                            messages_counter: updatedCount,
                            updated_at: date,
                            thread_id: threadId || existingUser.thread_id,  // Ensure thread ID is stored/updated
                        }
                    }
                );
                console.log('User updated in MongoDB successfully.');
            } else {
                // If user doesn't exist, create a new record
                await usersCollection.insertOne({
                    full_name: `${firstName} ${lastName}`,
                    thread_id: threadId,  // Store the thread ID when creating the user record
                    telegram_chat_id: chatId,
                    chat_history: `[${date}] ${newMessage}`,  // Initialize chat history with the new message
                    messages_counter: 1,
                    created_at: date,
                });
                console.log('User added to MongoDB successfully.');
            }
        } catch (error) {
            console.error('Error adding/updating user in MongoDB:', error);
        }
    }

    // Telegram Bot Webhook Setup
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        const username = msg.chat.username || '';
        const firstName = msg.chat.first_name || '';
        const lastName = msg.chat.last_name || '';

        // Check if the user already has a thread ID stored in MongoDB
        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ telegram_chat_id: chatId });

        let threadId;
        if (existingUser && existingUser.thread_id) {
            // If a thread ID exists for this user, use it
            threadId = existingUser.thread_id;
            console.log('Continuing conversation with thread ID:', threadId);
        } else {
            // Otherwise, create a new thread and store the ID
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
            console.log('Starting new conversation with thread ID:', threadId);
        }

        // Add or update user details in MongoDB, passing the thread ID
        await addOrUpdateUserInMongoDB(chatId, username, firstName, lastName, text, threadId);

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
                console.log(OpnApiMessages.data)
             //   for (const message of OpnApiMessages.data[0]) {
             //       if (message.content[0].type === 'text' && message.role === 'assistant') {
                        const aiMessage = OpnApiMessages.data[0].content[0].text.value;
                        console.log(aiMessage)
                        bot.sendMessage(chatId, aiMessage);
               //     }
              //  }

            } catch (error) {
                console.error('Error with OpenAI API:', error);
                bot.sendMessage(chatId, 'Sorry, something went wrong while processing your request.');
            }
        }
    });

    // Express Server
    app.get('/', (req, res) => {
        res.send('Telegram Chatbot with MongoDB and OpenAI is running...');
    });

    // Start the server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
})();
