const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json({ limit: '10mb' })); // Increase limit to handle larger HTML content
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Verify OpenAI Configuration
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is missing in environment variables');
  process.exit(1);
}

if (!process.env.OPENAI_ASSISTANT_ID) {
  console.error('OPENAI_ASSISTANT_ID is missing in environment variables');
  process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// API route to generate email HTML using OpenAI Threads API
app.post('/api/generate', async (req, res) => {
  console.log('Generate API called');
  try {
    const { prompt, existingContent, threadId } = req.body;
    console.log(`Received: prompt (${prompt.length} chars), existingContent (${existingContent ? existingContent.length : 0} chars), threadId: ${threadId || 'none'}`);
    
    let thread;
    
    // Use existing thread or create a new one
    if (threadId) {
      console.log(`Using existing thread: ${threadId}`);
      // Verify the thread exists before using it
      try {
        await openai.beta.threads.retrieve(threadId);
        thread = { id: threadId };
      } catch (error) {
        console.log(`Thread ${threadId} not found or error retrieving it, creating new thread`, error);
        thread = await openai.beta.threads.create();
      }
    } else {
      console.log('Creating new thread');
      thread = await openai.beta.threads.create();
    }
    
    console.log(`Thread ID: ${thread.id}`);
    
    // Create the user message content
    let userMessage;
    if (existingContent && existingContent.trim()) {
      userMessage = `Please update the following HTML based on this instruction: ${prompt}\n\nExisting HTML:\n${existingContent}`;
    } else {
      userMessage = prompt;
    }
    
    // Create a new message in the thread
    console.log('Creating message in thread');
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage
    });
    
    // Run the assistant on the thread
    console.log(`Running assistant ${process.env.OPENAI_ASSISTANT_ID} on thread`);
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID,
    });
    
    // Poll for the completion
    console.log('Polling for run completion');
    let runStatus;
    let attempts = 0;
    const maxAttempts = 60; // Stop polling after 60 attempts (about 60 seconds)
    
    do {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between polls
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      attempts++;
      console.log(`Run status: ${runStatus.status}, attempt ${attempts}`);
      
      if (attempts >= maxAttempts && runStatus.status !== 'completed') {
        throw new Error('Run timed out after 60 seconds');
      }
    } while (
      ['queued', 'in_progress', 'cancelling', 'requires_action'].includes(runStatus.status) && 
      attempts < maxAttempts
    );
    
    if (runStatus.status === 'failed') {
      console.error('Run failed:', runStatus.last_error);
      throw new Error('Assistant run failed: ' + (runStatus.last_error?.message || 'Unknown error'));
    }
    
    if (runStatus.status !== 'completed') {
      console.error('Run did not complete successfully:', runStatus.status);
      throw new Error(`Run ended with status ${runStatus.status}`);
    }
    
    // Get the latest message from the assistant
    console.log('Getting messages from thread');
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
    
    if (assistantMessages.length === 0) {
      console.error('No assistant messages found');
      throw new Error('No response from assistant');
    }
    
    // Get the content from the latest assistant message
    const latestMessage = assistantMessages[0];
    console.log(`Got latest message: ${latestMessage.id}`);
    
    let generatedHtml = '';
    
    for (const content of latestMessage.content) {
      if (content.type === 'text') {
        generatedHtml += content.text.value;
      }
    }
    
    if (!generatedHtml.trim()) {
      console.error('Generated HTML is empty');
      throw new Error('Assistant returned empty content');
    }
    
    console.log(`Generated HTML length: ${generatedHtml.length}`);
    
    // Return the generated HTML and thread ID to the client
    res.json({ 
      generatedHtml, 
      threadId: thread.id
    });
    console.log('Response sent to client');
  } catch (error) {
    console.error('Error generating email HTML:', error);
    res.status(500).json({ error: 'Failed to generate email HTML: ' + error.message });
  }
});

// Serve the main application page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using OpenAI Assistant ID: ${process.env.OPENAI_ASSISTANT_ID}`);
});