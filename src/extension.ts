import * as vscode from 'vscode';
import OpenAI from 'openai';
import { CodebaseAnalyzer } from './analyzer';

let openai: OpenAI | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating extension...');

    // Check if OpenAI API key is set; if not, prompt the user to set it immediately
    const apiKey = context.globalState.get<string>('openaiApiKey');
    if (!apiKey) {
        vscode.commands.executeCommand('extension.setOpenAIKey');
    } else {
        initializeOpenAI(apiKey);
    }

    // Register the command to set OpenAI API key
    context.subscriptions.push(vscode.commands.registerCommand('extension.setOpenAIKey', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: "Enter your OpenAI API key",
            ignoreFocusOut: true,
            placeHolder: "sk-XXXXXXXXXXXXXXXXXXXXXXXXXX",
            password: true
        });

        if (apiKey) {
            await context.globalState.update('openaiApiKey', apiKey);
            initializeOpenAI(apiKey);
            vscode.window.showInformationMessage('OpenAI API key saved successfully.');
        } else {
            vscode.window.showErrorMessage('API key input was canceled or not provided.');
        }
    }));

    // Register the sidebar view provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'askCodebaseView',
            new AskCodebaseViewProvider(context)
        )
    );

    console.log('AskCodebaseViewProvider registered.');

    // Register the main command to trigger codebase analysis
    context.subscriptions.push(vscode.commands.registerCommand('extension.askCodebase', async () => {
        const apiKey = context.globalState.get<string>('openaiApiKey');

        if (!apiKey) {
            vscode.window.showErrorMessage('Please set your OpenAI API key first.');
            await vscode.commands.executeCommand('extension.setOpenAIKey');
            return;
        }

        initializeOpenAI(apiKey);

        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No project found.');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const panel = createWebviewPanel();

        // Show loading content
        panel.webview.html = getLoadingContent();

        try {
            // Analyze the project
            const analyzer = new CodebaseAnalyzer(rootPath);
            analyzer.collectFiles();
            const sourceFiles = analyzer.analyze();

            const undocumentedFunctions = analyzer.findUndocumentedFunctions(sourceFiles);

            // Update webview content with analysis result
            panel.webview.html = getWebviewContent(undocumentedFunctions);
        } catch (error) {
            console.error("An error occurred during the analysis:", error);
            vscode.window.showErrorMessage("An error occurred during the analysis. Please check the console for details.");
        }

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'askQuestion') {
                const answer = await askChatGPT(message.question);
                panel.webview.postMessage({ type: 'answer', answer });
            } else if (message.type === 'fixCode') {
                const suggestion = message.suggestion;
                await fixCodeBasedOnSuggestion(suggestion, vscode.window.activeTextEditor);
            }
        });
    }));

    console.log('extension.askCodebase command registered.');
}

function initializeOpenAI(apiKey: string) {
    console.log("Initializing OpenAI with provided API key...");

    // Ensure the API key is trimmed of any surrounding whitespace
    const trimmedApiKey = apiKey.trim();

    // Initialize the OpenAI client with the provided API key
    openai = new OpenAI({ apiKey: trimmedApiKey });

    console.log("OpenAI initialized.");
}

function createWebviewPanel(): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(
        'askCodebase',
        'Ask Codebase',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );
}

function getLoadingContent(): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                .loading-dots {
                    display: inline-block;
                    width: 80px;
                    height: 24px;
                    text-align: center;
                }
                .loading-dots span {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background-color: #3498db;
                    animation: loading 1.4s infinite both;
                    margin: 0 2px;
                }
                .loading-dots span:nth-child(1) {
                    animation-delay: -0.32s;
                }
                .loading-dots span:nth-child(2) {
                    animation-delay: -0.16s;
                }
                @keyframes loading {
                    0%, 80%, 100% {
                        transform: scale(0);
                    }
                    40% {
                        transform: scale(1);
                    }
                }
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    background-color: #f4f4f4;
                }
            </style>
        </head>
        <body>
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </body>
        </html>
    `;
}

function getWebviewContent(undocumentedFunctions: string[]): string {
    let content = '';
    if (undocumentedFunctions.length > 0) {
        content = undocumentedFunctions.map(func => `<div class="message">${func}</div>`).join('');
    } else {
        content = `<div class="message">All functions are documented.</div>`;
    }

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    background-color: #f4f4f4;
                }
                #content {
                    flex: 1;
                    overflow-y: auto;
                    padding-bottom: 10px;
                }
                .message {
                    padding: 8px 12px;
                    margin: 5px 0;
                    border-radius: 15px;
                    max-width: 70%;
                    word-wrap: break-word;
                }
                .message.bot {
                    background-color: #808080;
                    align-self: flex-start;
                }
                .message.user {
                    background-color: #3498db;
                    color: white;
                    align-self: flex-end;
                }
                .input-container {
                    display: flex;
                    padding: 10px 0;
                    background-color: #ffffff;
                }
                .input-container input {
                    flex: 1;
                    padding: 10px;
                    border-radius: 15px;
                    border: 1px solid #ccc;
                    margin-right: 10px;
                }
                .input-container button {
                    padding: 10px 20px;
                    background-color: #3498db;
                    color: #fff;
                    border: none;
                    border-radius: 15px;
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <div id="content"></div>
            <div class="input-container">
                <input type="text" id="userQuestion" placeholder="Ask a question..." />
                <button id="sendQuestion">Send</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                // Function to send question and display it in the chat
                function sendQuestion() {
                    const question = document.getElementById("userQuestion").value;
                    if (question) {
                        addMessage(question, 'user');
                        showLoadingIndicator();
                        vscode.postMessage({ type: "askQuestion", question: question });
                        document.getElementById("userQuestion").value = '';
                    }
                }

                // Add event listener for the Send button
                document.getElementById("sendQuestion").addEventListener("click", sendQuestion);

                // Add event listener for pressing "Enter" key in the input field
                document.getElementById("userQuestion").addEventListener("keypress", (event) => {
                    if (event.key === "Enter") {
                        sendQuestion();
                    }
                });

                // Function to add a message to the chat
                function addMessage(content, sender) {
                    const contentDiv = document.getElementById('content');
                    const newMessage = document.createElement('div');
                    newMessage.className = 'message ' + sender;
                    newMessage.textContent = content;
                    contentDiv.appendChild(newMessage);
                    contentDiv.scrollTop = contentDiv.scrollHeight; // Auto-scroll to the bottom
                }

                // Function to show a loading indicator
                function showLoadingIndicator() {
                    const contentDiv = document.getElementById('content');
                    const loadingIndicator = document.createElement('div');
                    loadingIndicator.className = 'message bot';
                    loadingIndicator.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
                    contentDiv.appendChild(loadingIndicator);
                    contentDiv.scrollTop = contentDiv.scrollHeight;
                }

                // Handle incoming messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data; 
                    if (message.type === 'answer') {
                        // Remove the loading indicator
                        const contentDiv = document.getElementById('content');
                        const loadingIndicator = contentDiv.querySelector('.loading-dots');
                        if (loadingIndicator) {
                            loadingIndicator.parentElement.remove();
                        }
                        addMessage(message.answer, 'bot');
                    }
                });
            </script>
        </body>
        </html>
    `;
}

class AskCodebaseViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
        webviewView.webview.options = { enableScripts: true };

        // Initially show loading content
        webviewView.webview.html = this.getLoadingContent();

        // Simulate some delay for loading and then update the content
        setTimeout(() => {
            // After the delay, update the webview with the actual content
            webviewView.webview.html = this.getWebviewContent();
        }, 2000); // Adjust the delay as needed

        // Handle incoming messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log("Received message from webview:", message);
            if (message.type === 'askQuestion') {
                console.log("Processing question:", message.question);
                const answer = await askChatGPT(message.question);
                webviewView.webview.postMessage({ type: 'answer', answer });
                console.log("Sent answer back to webview:", answer);
            }
        });
    }

    private getLoadingContent(): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    .spinner {
                        border: 16px solid #f3f3f3;
                        border-top: 16px solid #3498db;
                        border-radius: 50%;
                        width: 120px;
                        height: 120px;
                        animation: spin 2s linear infinite;
                        margin: auto;
                        display: block;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        background-color: #f4f4f4;
                    }
                </style>
            </head>
            <body>
                <div class="spinner"></div>
            </body>
            </html>
        `;
    }

    private getWebviewContent(): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        background-color: #f4f4f4;
                    }
                    #content {
                        flex: 1;
                        overflow-y: auto;
                        padding-bottom: 10px;
                        display: flex;
                        flex-direction: column;
                    }
                    .message {
                        padding: 8px 12px;
                        margin: 5px 0;
                        border-radius: 15px;
                        max-width: 70%;
                        word-wrap: break-word;
                    }
                    .message.bot {
                        background-color: #080808;
                        align-self: flex-start;
                        margin-right: auto;
                    }
                    .message.user {
                        background-color: #3498db;
                        color: white;
                        align-self: flex-end;
                        margin-left: auto;
                    }
                    .input-container {
                        display: flex;
                        padding: 10px 0;
                        background-color: #ffffff;
                    }
                    .input-container input {
                        flex: 1;
                        padding: 10px;
                        border-radius: 15px;
                        border: 1px solid #ccc;
                        margin-right: 10px;
                    }
                    .input-container button {
                        padding: 10px 20px;
                        background-color: #3498db;
                        color: #fff;
                        border: none;
                        border-radius: 15px;
                        cursor: pointer;
                    }
                    .loading-dots {
                        display: inline-block;
                        width: 80px;
                        height: 24px;
                        text-align: center;
                    }
                    .loading-dots span {
                        display: inline-block;
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        background-color: #3498db;
                        animation: loading 1.4s infinite both;
                        margin: 0 2px;
                    }
                    .loading-dots span:nth-child(1) {
                        animation-delay: -0.32s;
                    }
                    .loading-dots span:nth-child(2) {
                        animation-delay: -0.16s;
                    }
                    @keyframes loading {
                        0%, 80%, 100% {
                            transform: scale(0);
                        }
                        40% {
                            transform: scale(1);
                        }
                    }
                </style>
            </head>
            <body>
                <div id="content"></div>
                <div class="input-container">
                    <input type="text" id="userQuestion" placeholder="Ask a question..." />
                    <button id="sendQuestion">Send</button>
                </div>
    
                <script>
                    const vscode = acquireVsCodeApi();
    
                    // Function to send question and display it in the chat
                    function sendQuestion() {
                        const question = document.getElementById("userQuestion").value;
                        if (question) {
                            addMessage(question, 'user');
                            showLoadingIndicator();
                            vscode.postMessage({ type: "askQuestion", question: question });
                            document.getElementById("userQuestion").value = '';
                        }
                    }
    
                    // Add event listener for the Send button
                    document.getElementById("sendQuestion").addEventListener("click", sendQuestion);
    
                    // Add event listener for pressing "Enter" key in the input field
                    document.getElementById("userQuestion").addEventListener("keypress", (event) => {
                        if (event.key === "Enter") {
                            sendQuestion();
                        }
                    });
    
                    // Function to add a message to the chat
                    function addMessage(content, sender) {
                        const contentDiv = document.getElementById('content');
                        const newMessage = document.createElement('div');
                        newMessage.className = 'message ' + sender;
                        newMessage.textContent = content;
                        contentDiv.appendChild(newMessage);
                        contentDiv.scrollTop = contentDiv.scrollHeight; // Auto-scroll to the bottom
                    }
    
                    // Function to show a loading indicator
                    function showLoadingIndicator() {
                        const contentDiv = document.getElementById('content');
                        const loadingIndicator = document.createElement('div');
                        loadingIndicator.className = 'message bot';
                        loadingIndicator.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
                        contentDiv.appendChild(loadingIndicator);
                        contentDiv.scrollTop = contentDiv.scrollHeight;
                    }
    
                    // Handle incoming messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data; 
                        if (message.type === 'answer') {
                            // Remove the loading indicator
                            const contentDiv = document.getElementById('content');
                            const loadingIndicator = contentDiv.querySelector('.loading-dots');
                            if (loadingIndicator) {
                                loadingIndicator.parentElement.remove();
                            }
                            addMessage(message.answer, 'bot');
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
    
}

async function askChatGPT(question: string): Promise<string> {
    if (!openai) {
        throw new Error('OpenAI not initialized');
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: question }],
        });

        const suggestion = response.choices[0]?.message?.content?.trim() || "No response from AI.";
        return suggestion;
    } catch (error) {
        console.error("Error communicating with OpenAI:", error);

        // Use type assertion to ensure `error` is of the type `Error`
        if (error instanceof Error) {
            if (error.message.includes("429")) {
                return "You have exceeded your API quota. Please check your OpenAI account's billing and usage details.";
            } else {
                return `An error occurred while communicating with OpenAI: ${error.message}`;
            }
        } else {
            // If the error is not an instance of `Error`, return a generic message
            return "An unexpected error occurred.";
        }
    }
}

async function fixCodeBasedOnSuggestion(suggestion: string, editor: vscode.TextEditor | undefined) {
    if (!editor) return;

    const document = editor.document;
    const edit = new vscode.WorkspaceEdit();

    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );

    edit.replace(document.uri, fullRange, suggestion);
    await vscode.workspace.applyEdit(edit);
}

export function deactivate() {}
