# Token Management Configuration

## Environment Variables for Token Control

Add these to your `.env.local` file to control token usage:

```bash
# Maximum number of previous messages to include in context
# Lower values = fewer tokens, but less context
MAX_CHAT_MESSAGES=1

# Maximum tokens for AI requests (safety limit)
# Set to 200000 for Claude 3.5 Haiku, higher for other models
MAX_AI_TOKENS=180000

# Use minimal system prompt (just "Assistant.") to save tokens
# Set to 'true' for maximum token reduction
USE_MINIMAL_PROMPT=false

# Show detailed tool status in prompts
# Set to 'false' for more concise prompts
SHOW_DETAILED_TOOL_STATUS=false

# Include tool descriptions in prompts
# Set to 'false' to save tokens
INCLUDE_TOOL_DESCRIPTIONS=false
```

## Token Reduction Strategies Implemented

### 1. Message History Limiting

- **Default**: 1 previous message
- **Configurable**: Via `MAX_CHAT_MESSAGES`
- **Safety**: Additional fallback to 1 message

### 2. Message Content Truncation

- **Previous messages**: Truncated to 500 characters
- **Current message**: Truncated to 1000 characters
- **Indicator**: `... [truncated]` added to show truncation

### 3. System Prompt Optimization

- **Minimal prompt**: Just "Assistant." when `USE_MINIMAL_PROMPT=true`
- **Tool info**: Only connected tools, no descriptions
- **Location info**: Removed to save tokens

### 4. Tool Information Reduction

- **Only connected tools**: Disconnected tools not included in system prompt
- **No descriptions**: Tool descriptions removed
- **Minimal format**: Just tool slugs

## Expected Token Usage

With all optimizations enabled:

- **System prompt**: ~10-50 tokens
- **Message history**: ~500-1000 tokens per message
- **Total estimated**: 50,000-100,000 tokens (vs 225,000+ before)

## Troubleshooting

If you still hit token limits:

1. **Enable minimal prompt**: Set `USE_MINIMAL_PROMPT=true`
2. **Reduce message history**: Set `MAX_CHAT_MESSAGES=0`
3. **Increase token limit**: Set `MAX_AI_TOKENS=200000`
4. **Upgrade API plan**: For higher token limits
