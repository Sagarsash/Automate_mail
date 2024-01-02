const express = require('express');
const { google } = require('googleapis');
const credentials = require('./credentials.json');

const app = express();
const port = 3000;

// Set up OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  credentials.client_id,
  credentials.client_secret,
  credentials.redirect_uris,
);

// Generate the authentication URL
const scopes = ['https://www.googleapis.com/auth/gmail.modify'];
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
});

// Callback route for handling the authorization code
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    // Exchange the authorization code for access and refresh tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log('Successfully authenticated with Google.');

    // Start checking for new emails and sending replies
    setInterval(async () => {
      await checkAndReplyToEmails();
    }, getRandomInterval(45, 120) * 1000);

    res.send('Authentication successful. Email application is running.');
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).send('Authentication failed.');
  }
});

// Check for new emails and send replies
async function checkAndReplyToEmails() {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  try {
    // Get list of messages in the inbox
    const response = await gmail.users.messages.list({ userId: 'me', labelIds: ['INBOX'] });
    const messages = response.data.messages;

    // Process each message
    for (const message of messages) {
      // Check if the message has been replied to by you
      const threadId = message.threadId;
      const isReplied = await hasRepliedToThread(gmail, threadId);
      
      if (!isReplied) {
        // Send a reply
        await sendReply(gmail, threadId);
        
        // Add label to the email
        await addLabelToEmail(gmail, threadId, 'AutoReplied');
        
        console.log('Replied to email thread:', threadId);
      }
    }
  } catch (error) {
    console.error('Error checking for emails:', error);
  }
}

// Check if a thread has been replied to by you
async function hasRepliedToThread(gmail, threadId) {
  try {
    const response = await gmail.users.threads.get({ userId: 'me', id: threadId });
    const thread = response.data;
    
    // Check if any messages in the thread have been sent by you
    return thread.messages.some((message) => message.fromMe);
  } catch (error) {
    console.error('Error checking if replied:', error);
    return false;
  }
}

// Send a reply to a thread
async function sendReply(gmail, threadId) {
  const emailContent = 'Thank you for your email. This is an automated reply.';
  const rawEmail = createRawEmail('me', 'me', 'Auto Reply', emailContent);

  try {
    await gmail.users.messages.send({ userId: 'me', resource: { raw: rawEmail }, threadId });
  } catch (error) {
    console.error('Error sending reply:', error);
  }
}

// Add a label to an email
async function addLabelToEmail(gmail, threadId, labelName) {
  try {
    // Get list of labels
    const response = await gmail.users.labels.list({ userId: 'me' });
    const labels = response.data.labels;

    // Check if the label already exists
    let labelId = '';
    for (const label of labels) {
      if (label.name === labelName) {
        labelId = label.id;
        break;
      }
    }

    // If the label doesn't exist, create it
    if (!labelId) {
      const createLabelResponse = await gmail.users.labels.create({ userId: 'me', requestBody: { name: labelName } });
      labelId = createLabelResponse.data.id;
    }

    // Add the label to the thread
    await gmail.users.threads.modify({ userId: 'me', id: threadId, requestBody: { addLabelIds: [labelId] } });
  } catch (error) {
    console.error('Error adding label:', error);
  }
}

// Helper function to create a raw email message
function createRawEmail(sender, recipient, subject, body) {
  const email = [
    `From: ${sender}`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    '',
    body,
  ].join('\r\n');

  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Helper function to generate a random interval in seconds
function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Please visit the following URL to authenticate: ${authUrl}`);
});
