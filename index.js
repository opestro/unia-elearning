const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { Configuration, OpenAI } = require('openai');
const { google } = require('googleapis'); // Google Sheets API
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

// Google Sheets Setup
const credentials = require('./artyumm-649c9b83c537.json');  // Load your Google API credentials
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: SCOPES,
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = '1Arcrrz40ery7ck_7vXfStczZtrihOyVnmOGSBbI1H88';
const SHEET_NAME = 'Data';  // Your Google Sheet tab name

// Function to get all rows from Google Sheets
async function getUsersFromGoogleSheet() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:F`,  // Check all columns (chatId, username, firstName, lastName, lastMessageDate, messageCount)
        });

        return response.data.values || [];
    } catch (error) {
        console.error('Error fetching users from Google Sheets:', error);
        return [];
    }
}

// Function to add or update user in Google Sheets
async function addOrUpdateUserInGoogleSheet(chatId, username, firstName, lastName) {
    try {
        // Get all users
        const rows = await getUsersFromGoogleSheet();

        // Look for the user by chatId
        let userRow = null;
        let userIndex = -1;
        rows.forEach((row, index) => {
            if (row[0] == chatId) {
                userRow = row;
                userIndex = index + 1;  // Sheet rows are 1-indexed
            }
        });

        const date = new Date().toLocaleString(); // Timestamp
        if (userRow) {
            // If user exists, update the message count and last message date
            const currentCount = parseInt(userRow[5]) || 0;  // Message count is in column F (index 5)
            const updatedCount = currentCount + 1;

            const resource = {
                values: [[date, updatedCount]],  // Update last message date and message count
            };

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!E${userIndex}:F${userIndex}`,  // Update the row with lastMessageDate (E) and messageCount (F)
                valueInputOption: 'USER_ENTERED',
                resource,
            });
            console.log('User updated in Google Sheets successfully.');
        } else {
            // If user doesn't exist, add a new row
            const values = [[chatId, username, firstName, lastName, date, 1]];  // Start message count at 1

            const resource = {
                values,
            };

            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A:F`,
                valueInputOption: 'USER_ENTERED',
                resource,
            });
            console.log('User added to Google Sheets successfully.');
        }
    } catch (error) {
        console.error('Error adding/updating user in Google Sheets:', error);
    }
}

// Telegram Bot Webhook Setup
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const username = msg.chat.username || '';
    const firstName = msg.chat.first_name || '';
    const lastName = msg.chat.last_name || '';

    // Add or update user details in Google Sheets
    await addOrUpdateUserInGoogleSheet(chatId, username, firstName, lastName);

    const thread = await openai.beta.threads.create();
    
    // If user types /start, send a welcome message
    if (text === '/start') {
        bot.sendMessage(chatId, 'Welcome to the AI-powered chatbot! How can I assist you today?');
    } else {
        try {
            const createMessage = await openai.beta.threads.messages.create(thread.id, {
                role: 'user',
                content: text,
            });
            const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
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
    res.send('Telegram Chatbot with OpenAI is running...');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
