# POV Rewrite Extension for SillyTavern

Automatically convert character cards from second-person or third-person perspective to first-person perspective using AI.

## Features

- **One-Click Conversion**: Convert entire character cards to first-person perspective with a single button click
- **AI-Powered**: Uses your configured AI model to intelligently rewrite character descriptions, personalities, and dialogue
- **Structured Output**: Leverages JSON schema for reliable, structured character card output
- **Preview Before Apply**: Review changes before applying them to your character
- **Customizable Prompts**: Modify the conversion prompt to suit your needs
- **Preserves Metadata**: Keeps character name, tags, and extension data intact

## Installation

1. Place the `pov-rewrite` folder in `public/scripts/extensions/third-party/`
2. Reload SillyTavern
3. Enable the extension in the Extensions menu

## Usage

1. Open a character in edit mode
2. Click the "eye" icon button (👁️) next to the delete button
3. Wait for the AI to rewrite the character card
4. Review the preview (if enabled)
5. Confirm to apply changes

## Settings

### Show Rewrite Button in Character Edit
Toggle the visibility of the rewrite button in the character edit panel.

### Prompt Template
Customize the prompt sent to the AI for character conversion. Use `{{CHARACTER_JSON}}` as a placeholder for the character data.

### Max Response Tokens
Set the maximum number of tokens for the AI response. Increase this for longer character cards.

### Show Preview Before Applying
When enabled, shows a preview dialog with the rewritten character fields before applying changes.

## How It Works

The extension:
1. Extracts all text fields from the character card
2. Sends the character data to the AI with a structured prompt
3. Receives a rewritten character card in JSON format
4. Updates all character fields to first-person perspective
5. Preserves non-text metadata (name, tags, extensions)

## Pronouns Used

The AI is instructed to use these first-person pronouns:
- I, me, my, mine, myself (for the character)
- We, us, our, ours (if applicable)

## Fields Converted

- Description
- Personality
- Scenario
- First Message
- Example Messages
- Alternate Greetings
- Creator Notes
- Post-History Instructions
- System Prompt

## Fields Preserved

- Character Name
- Tags
- Extension Data
- Creator
- Version Number

## Requirements

- SillyTavern with AI backend configured
- AI model that supports structured JSON output (recommended: OpenAI, Claude, or similar)

## Troubleshooting

**Button not appearing**: Make sure "Show Rewrite Button in Character Edit" is enabled in settings.

**AI errors**: Ensure your AI backend is properly configured and supports JSON schema.

**Poor quality output**: Try adjusting the prompt template or increasing max tokens for longer cards.

## License

MIT License

## Author

spaceman2408

## Version

1.0.0