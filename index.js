require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const axios = require('axios');

console.log(process.env.OPENAI_API_KEY);

// MongoDB connection with try-catch
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Defining a model for storing conversations
const ConversationSchema = new mongoose.Schema({
  userId: String,
  query: String,
  response: String,
  context: String, // Added to keep track of the conversation stage
});
const Conversation = mongoose.model('Conversation', ConversationSchema);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

async function fetchChatGPTResponse(prompt) {
  try {
    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: prompt
      }],
      temperature: 0.7,
      max_tokens: 100,
    };

    const response = await axios.post('https://api.openai.com/v1/chat/completions', requestBody, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error fetching response from ChatGPT:', error);
    return 'I encountered an error trying to process your request. Please try again later.';
  }
}

bot.on('text', async (ctx) => {
  try {
    const userMessage = ctx.message.text;
    let responseMessage = '';

    const latestConversation = await Conversation.findOne({ userId: ctx.from.id }).sort({ _id: -1 });

    if (!latestConversation || latestConversation.context === 'finished' || userMessage.toLowerCase().includes('start over')) {
      responseMessage = 'What is your family size?';
      await new Conversation({
        userId: ctx.from.id,
        query: userMessage,
        response: responseMessage,
        context: 'ask_family_size'
      }).save();
    } else {
      switch (latestConversation.context) {
        case 'ask_family_size':
          responseMessage = 'What is your Household income?';
          await new Conversation({
            userId: ctx.from.id,
            query: userMessage,
            response: responseMessage,
            context: 'ask_household_income'
          }).save();
          break;
        case 'ask_household_income':
          responseMessage = 'What is your gender?';
          await new Conversation({
            userId: ctx.from.id,
            query: userMessage,
            response: responseMessage,
            context: 'ask_gender'
          }).save();
          break;
        case 'ask_gender':
          responseMessage = 'Thank you for providing your information. How can I assist you further?';
          await new Conversation({
            userId: ctx.from.id,
            query: userMessage,
            response: responseMessage,
            context: 'general_assistance'
          }).save();
          break;
        case 'general_assistance':
          responseMessage = await fetchChatGPTResponse(userMessage);
          await new Conversation({
            userId: ctx.from.id,
            query: userMessage,
            response: responseMessage,
            context: 'general_assistance' // Keep in general assistance mode
          }).save();
          break;
        default:
          responseMessage = 'How can I assist you further?';
          await new Conversation({
            userId: ctx.from.id,
            query: userMessage,
            response: responseMessage,
            context: 'finished'
          }).save();
          break;
      }
    }

    // Ensure responseMessage is never empty
    if (!responseMessage.trim()) {
      responseMessage = 'I encountered an error processing your request. Please try again.';
    }

    ctx.reply(responseMessage);
  } catch (error) {
    console.error('Error processing message:', error);
    ctx.reply('An error occurred while processing your message.');
  }
});

bot.launch().then(() => {
  console.log('Bot launched');
}).catch(err => {
  console.error('Error launching bot:', err);
});