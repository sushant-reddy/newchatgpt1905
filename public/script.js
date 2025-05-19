// Initialize the Block SDK
let sdk;
let codeEditor;
let currentEmailContent = '';
let lastPrompt = '';
let threadId = '';

document.addEventListener('DOMContentLoaded', function() {
  // Initialize the Block SDK
  if (window.sfdc && window.sfdc.BlockSDK) {
    sdk = new window.sfdc.BlockSDK();
    console.log('BlockSDK instance created:', sdk);
    initializeBlockSDK();
  } else {
    console.log('BlockSDK not available, running in development mode');
  }

  // Initialize UI elements
  initializeUIElements();

  const codeModal = document.getElementById('code-modal');
  const closeModalBtn = document.querySelector('.close-modal');
  const cancelBtn = document.getElementById('cancel-changes-btn');

  function closeModal() {
    codeModal.style.display = 'none';
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }
});

function initializeBlockSDK() {
  // Get content that was previously saved
  sdk.getContent(content => {
    if (content && content.trim() !== '') {
      currentEmailContent = content;
      document.getElementById('email-preview').innerHTML = content;
      console.log('Retrieved content from BlockSDK');
    }
  });

  // Get the saved data (prompt and threadId)
  sdk.getData(data => {
    console.log('Retrieved data from BlockSDK:', data);
    
    if (data.lastPrompt) {
      lastPrompt = data.lastPrompt;
      document.getElementById('prompt-input').value = lastPrompt;
    }
    
    if (data.threadId) {
      threadId = data.threadId;
      console.log('Retrieved threadId:', threadId);
    }

    // If we have HTML content from data, use it (this is a backup in case getContent doesn't work)
    if (data.htmlContent && (!currentEmailContent || currentEmailContent.trim() === '')) {
      currentEmailContent = data.htmlContent;
      document.getElementById('email-preview').innerHTML = currentEmailContent;
    }
  });

  // Set the block height appropriately
  sdk.setHeight(800);
}

function initializeUIElements() {
  // Initialize CodeMirror editor
  const codeEditorElement = document.getElementById('code-editor');
  codeEditor = CodeMirror.fromTextArea(codeEditorElement, {
    mode: 'htmlmixed',
    theme: 'monokai',
    lineNumbers: true,
    autoCloseTags: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: true
  });

  // Event listeners for UI elements
  document.getElementById('generate-btn').addEventListener('click', generateEmailHTML);
  document.getElementById('edit-code-btn').addEventListener('click', openCodeEditor);
  document.getElementById('apply-changes-btn').addEventListener('click', applyCodeChanges);
  document.querySelector('.close-modal').addEventListener('click', closeCodeEditor);
  document.getElementById('cancel-changes-btn').addEventListener('click', closeCodeEditor);
}

async function generateEmailHTML() {
  const promptInput = document.getElementById('prompt-input');
  const prompt = promptInput.value.trim();
  
  if (!prompt) {
    showError('Please enter a prompt to generate the email HTML.');
    return;
  }

  // Show loading indicator
  showLoading(true);
  hideError();

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        prompt, 
        existingContent: currentEmailContent,
        threadId: threadId // Include threadId if available
      })
    });

    if (!response.ok) {
      throw new Error('Failed to generate email HTML');
    }

    const data = await response.json();
    
    // Update the email preview with generated HTML
    currentEmailContent = data.generatedHtml;
    document.getElementById('email-preview').innerHTML = currentEmailContent;
    
    // Update threadId
    if (data.threadId) {
      threadId = data.threadId;
    }

    // Save the generated content, prompt, and threadId
    if (sdk) {
      sdk.setContent(currentEmailContent);
      sdk.setData({ 
        lastPrompt: prompt,
        threadId: threadId,
        htmlContent: currentEmailContent // Also save the HTML content as a backup
      });
      lastPrompt = prompt;
      console.log('Saved to BlockSDK - ThreadID:', threadId);
    }

  } catch (error) {
    showError(error.message || 'An error occurred while generating the email HTML.');
    console.error('Error:', error);
  } finally {
    showLoading(false);
  }
}

function openCodeEditor() {
  codeEditor.setValue(currentEmailContent);
  document.getElementById('code-modal').style.display = 'block';
}

function closeCodeEditor() {
  document.getElementById('code-modal').style.display = 'none';
}

function applyCodeChanges() {
  // Get the updated code from the editor
  const updatedCode = codeEditor.getValue();
  
  // Update the preview and save the changes
  document.getElementById('email-preview').innerHTML = updatedCode;
  currentEmailContent = updatedCode;
  
  // Save changes to BlockSDK
  if (sdk) {
    sdk.setContent(updatedCode);
    sdk.setData({ 
      lastPrompt: lastPrompt,
      threadId: threadId,
      htmlContent: updatedCode // Also save the HTML content as a backup
    });
    console.log('Updated code saved to BlockSDK');
  }
  
  // Close the modal
  closeCodeEditor();
}

function showLoading(isLoading) {
  const loadingIndicator = document.getElementById('loading-indicator');
  if (isLoading) {
    loadingIndicator.classList.remove('hidden');
    document.getElementById('generate-btn').disabled = true;
  } else {
    loadingIndicator.classList.add('hidden');
    document.getElementById('generate-btn').disabled = false;
  }
}

function showError(message) {
  const errorElement = document.getElementById('error-message');
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error-message').classList.add('hidden');
}