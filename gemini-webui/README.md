# Gemini WebUI

An enhanced, dependency-free Web UI specifically designed for Google's Gemini CLI. Features a powerful command palette, model switching, parameter controls, and quick action buttons to help you utilize Gemini's full potential without memorizing commands.

> **Enhanced Features**: Unlike the generic AI WebUI, this version includes Gemini-specific optimizations, an intelligent command palette, real-time parameter adjustment, and pre-configured prompts for common tasks.

## Features

### 🎯 **Gemini-Optimized**
- 🤖 **Model Selection**: Switch between Gemini Pro, Pro Vision, 1.5 Pro, and 1.5 Flash
- ⚙️ **Real-time Parameters**: Adjust temperature, max tokens, and top-p on the fly
- 🎨 **Smart Prompts**: Pre-configured prompts for common tasks (explain, summarize, code, etc.)
- ⌘ **Command Palette**: Quick access to all features with Ctrl+K

### 🚀 **Powerful UI**
- 📡 **SSE Streaming**: Real-time response streaming
- 🎨 **Dark/Light Themes**: Beautiful theme switching
- 📱 **Responsive Design**: Works perfectly on mobile and desktop
- 🔧 **Sidebar Controls**: Easy access to all settings and quick actions
- 💾 **Export Chat**: Save conversations to text files

### 🔒 **Local & Secure**
- 🔌 **100% Local**: All processing happens on your machine
- 🛡️ **Optional Authentication**: Bearer token security for remote access
- 🔄 **Process Management**: Smart AI restart and monitoring
- 📊 **Real-time Status**: Live connection and model status

## Quick Start

### 🚀 **Easy Setup**

1. **Install Gemini CLI** (if not already installed)
   ```bash
   # Follow Google's official Gemini CLI installation guide
   # Make sure 'gemini' or 'gemini-cli' is in your PATH
   ```

2. **Start the WebUI**
   ```bash
   cd gemini-webui
   node server.js
   # Open http://127.0.0.1:5056
   ```

3. **Start chatting!** 🎉
   - Use the sidebar to adjust model and parameters
   - Try **Ctrl+K** to open the command palette
   - Click the quick action buttons for common tasks

### ⚙️ **Custom Configuration**

```bash
# With custom model and parameters
GEMINI_MODEL=gemini-1.5-pro GEMINI_TEMPERATURE=0.3 node server.js

# With environment file
cp .env.example .env
# Edit .env with your preferences
npm start

# For development with auto-reload
npm run dev
```

## 📚 **Complete UI Guide**

### ⌘ **Command Palette** (Ctrl+K)
The command palette is your power tool for quick access to all features:

- **💡 Explain**: Ask Gemini to explain concepts, code, or text
- **📄 Summarize**: Get concise summaries of long content
- **🌐 Translate**: Translate text to different languages
- **🔍 Code Review**: Get detailed code analysis and feedback
- **🐛 Debug Code**: Help troubleshoot programming issues
- **⚡ Optimize**: Suggest performance improvements
- **📚 Documentation**: Generate docs for your code
- **✍️ Creative Writing**: Assistance with creative tasks
- **🧠 Brainstorm**: Generate innovative ideas
- **📊 Data Analysis**: Help interpret and analyze data
- **🔬 Research**: Deep research on any topic
- **🔄 Model Switch**: Quick model changes
- **🗑️ Clear Chat**: Reset conversation
- **💾 Export**: Save chat to file

### 🎯 **Quick Actions Sidebar**
Click the emoji buttons in the sidebar for instant prompts:

| Button | Action | What it does |
|--------|--------|--------------|
| 💡 | Explain | Adds "Please explain:" to your input |
| 📄 | Summarize | Adds "Please summarize:" to your input |
| 🌐 | Translate | Adds "Please translate:" to your input |
| 💻 | Code Help | Adds "Help me with this code:" to your input |
| ✨ | Creative | Adds "Help me with creative writing:" to your input |
| 🔍 | Analyze | Adds "Please analyze:" to your input |

### ⚙️ **Model & Parameters**

**Available Models:**
- **Gemini Pro**: General-purpose, balanced performance
- **Gemini Pro Vision**: Includes image understanding
- **Gemini 1.5 Pro**: Enhanced capabilities, larger context
- **Gemini 1.5 Flash**: Faster responses, good for quick tasks

**Adjustable Parameters:**
- **Temperature** (0.0-2.0): Controls creativity vs consistency
  - Low (0.0-0.3): Focused, deterministic responses
  - Medium (0.4-0.7): Balanced creativity
  - High (0.8-2.0): More creative and varied responses
- **Max Tokens** (1-8192): Maximum response length
- **Top P** (0.0-1.0): Controls response diversity

### ⌨️ **Keyboard Shortcuts**
- **Ctrl+K** (or Cmd+K): Open command palette
- **Enter**: Send message
- **Shift+Enter**: New line in message
- **Escape**: Close command palette or modals

## 🔧 **Configuration**

### Environment Variables

```bash
# Network Settings
PORT=5056                    # Server port
HOST=127.0.0.1              # Bind address  
WEBUI_TOKEN=your-token       # Optional security token

# Gemini CLI Settings
AI_CMD=gemini-cli            # Gemini CLI command
AI_ARGS="--api-key=xxx"      # Additional CLI arguments

# Default Model Settings
GEMINI_MODEL=gemini-pro      # Default model
GEMINI_TEMPERATURE=0.7       # Default temperature
GEMINI_MAX_TOKENS=1024       # Default max tokens
GEMINI_TOP_P=0.9             # Default top-p
```

## Supported AI CLIs

This should work with any CLI tool that:
- Accepts input via `stdin`
- Outputs responses to `stdout` 
- Runs interactively (doesn't exit after single response)

### Tested Examples

**Gemini CLI:**
```bash
AI_CMD=gemini AI_ARGS="--model=gemini-pro"
```

**Qwen CLI:**
```bash
AI_CMD=qwen-cli AI_ARGS="--model=qwen-turbo"
```

**Custom wrapper script:**
```bash
AI_CMD=./my-ai-wrapper.sh AI_ARGS=""
```

## How It Works

1. **Server** spawns the AI CLI as a child process
2. **User input** from web UI → sent to CLI via `stdin`
3. **CLI output** from `stdout` → streamed to web UI via SSE
4. **Error output** from `stderr` → shown as error messages
5. **Process management** allows restarting the AI if it crashes

## Development

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Test (basic server functionality)
npm test
```

## 🔌 **API Endpoints**

| Method | Endpoint | Description | Payload |
|--------|----------|-------------|----------|
| `GET` | `/` | Web UI interface | - |
| `GET` | `/events` | SSE stream for real-time updates | - |
| `GET` | `/health` | Health check with config info | - |
| `POST` | `/message` | Send message to AI | `{"text": "your message"}` |
| `PUT` | `/config` | Update model parameters | `{"model": "gemini-pro", "temperature": 0.7}` |
| `POST` | `/restart` | Restart AI process | - |

### 🔄 **Config API Example**

```bash
# Update temperature and model
curl -X PUT http://localhost:5056/config \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-1.5-pro", "temperature": 0.3}'

# Get current health and config
curl http://localhost:5056/health
```

## Architecture

- **Single-file server** (`server.js`) - ~200 lines, zero dependencies
- **Single-file client** (`public/index.html`) - vanilla HTML/CSS/JS
- **Process spawning** with `child_process.spawn()`
- **Server-Sent Events** for real-time streaming
- **Simple protocol**: stdin → AI → stdout → SSE

## Security

- Binds to `127.0.0.1` by default (localhost only)
- Optional `WEBUI_TOKEN` for API authentication
- No external dependencies or complex attack surface
- Process isolation between web server and AI CLI

## Differences from Codex WebUI

**Removed features:**
- Session management and `.jsonl` file handling
- Memory persistence and `.codex/memory.md` 
- Project/workdir management
- Session resume functionality
- Complex event parsing for Codex-specific JSON
- TOML configuration system
- Sidebar with sessions/projects/memory

**Simplified features:**
- Generic stdout → SSE message streaming
- Basic process start/restart
- Minimal toolbar with just restart button
- Direct stdin/stdout communication

## 💡 **Pro Tips**

### 🎯 **Getting the Best Results**

1. **Use specific prompts**: Instead of "help me code", try "review this Python function for performance issues"
2. **Adjust temperature**: 
   - Use 0.1-0.3 for factual, consistent responses
   - Use 0.7-1.0 for creative writing and brainstorming
3. **Try different models**:
   - Gemini 1.5 Flash for quick questions
   - Gemini 1.5 Pro for complex analysis
   - Pro Vision for image-related tasks

### ⌨️ **Workflow Tips**

- **Command Palette Power**: Press Ctrl+K and type to quickly find any command
- **Quick Actions**: Use sidebar buttons to jumpstart common tasks
- **Parameter Tweaking**: Adjust temperature in real-time to fine-tune responses
- **Export Important Chats**: Save valuable conversations for future reference

### 🔧 **Troubleshooting**

**Connection Issues:**
- Check if Gemini CLI is installed and in PATH
- Verify your API key is configured correctly
- Look at browser console for error messages

**Slow Responses:**
- Try Gemini 1.5 Flash for faster responses
- Reduce max tokens if you don't need long responses
- Check your internet connection

**UI Not Loading:**
- Make sure you're accessing http://127.0.0.1:5056
- Try a different browser or incognito mode
- Check if port 5056 is available

### 🔄 **Comparison with Generic WebUI**

**Enhanced Features Added:**
- ✨ Smart command palette with 14+ pre-configured commands
- 🎯 Quick action buttons for common tasks
- ⚙️ Real-time parameter adjustment (temperature, tokens, top-p)
- 🔄 Dynamic model switching without restart
- 💾 Chat export functionality
- 📊 Enhanced status and configuration display
- ⌨️ Keyboard shortcuts for power users
- 📱 Better mobile responsive design

**Removed Generic Features:**
- Generic CLI support (focused on Gemini)
- Basic parameter passing (replaced with UI controls)
- Simple toolbar (replaced with feature-rich sidebar)

## 🚀 **What's Next?**

This enhanced Gemini WebUI gives you professional-grade access to Google's Gemini models with a beautiful, intuitive interface. Whether you're:

- 💻 **Coding**: Get code reviews, debugging help, and optimization tips
- ✍️ **Writing**: Enhance your creative writing and content creation
- 📈 **Analyzing**: Process data and research complex topics
- 🎨 **Creating**: Brainstorm ideas and solve problems creatively

The command palette and quick actions ensure you'll never have to memorize Gemini commands again!

---

## License

MIT
