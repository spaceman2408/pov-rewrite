import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, generateRaw } from "../../../../script.js";
import { Popup, POPUP_TYPE, POPUP_RESULT } from "../../../popup.js";

// Global abort controller for stopping generation
let abortController = null;

// Global function to reset UI state
window.povRewriteResetUI = function() {
    const startBtn = document.getElementById('pov-rewrite-start-btn');
    const abortBtn = document.getElementById('pov-rewrite-abort-btn');
    const statusEl = document.getElementById('pov-rewrite-status');
    const loadingEl = document.getElementById('pov-rewrite-loading');
    const payloadContainer = document.getElementById('pov-payload-container');
    
    if (startBtn) startBtn.disabled = false;
    if (abortBtn) abortBtn.disabled = true;
    if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = '<i class="fa-solid fa-info-circle"></i><span>Ready to start rewrite</span>';
    }
    if (loadingEl) loadingEl.classList.add('hidden');
    if (payloadContainer) payloadContainer.classList.remove('disabled');
    
    console.log(`[${extensionName}] UI state reset`);
};

// Global click handlers for popup buttons
window.povRewriteStartClick = async function(event) {
    event.preventDefault();
    console.log(`[${extensionName}] Start button clicked via inline handler`);
    
    const startBtn = document.getElementById('pov-rewrite-start-btn');
    const abortBtn = document.getElementById('pov-rewrite-abort-btn');
    const statusEl = document.getElementById('pov-rewrite-status');
    const loadingEl = document.getElementById('pov-rewrite-loading');
    const payloadContainer = document.getElementById('pov-payload-container');
    
    try {
        // Update UI to show loading state
        if (startBtn) startBtn.disabled = true;
        if (abortBtn) abortBtn.disabled = false;
        if (statusEl) statusEl.classList.add('hidden');
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (payloadContainer) payloadContainer.classList.add('disabled');
        
        console.log(`[${extensionName}] Starting rewrite process...`);
        
        // Create new abort controller
        abortController = new AbortController();
        
        // Get character data again in case it changed
        const context = getContext();
        if (!context.characterId) {
            throw new Error("No character selected");
        }
        const character = context.characters[context.characterId];
        const characterData = getCharacterData(character);
        const prompt = buildRewritePrompt(characterData);
        
        // Call AI
        const response = await generateRaw({
            prompt: prompt,
            responseLength: extension_settings[extensionName].maxTokens,
        });
        
        console.log(`[${extensionName}] AI response received`);
        
        // Check if was aborted
        if (abortController === null) {
            throw new Error('Operation aborted');
        }
        
        // Handle response
        await handleAIResponse(response, character);
        
        // Close popup on success
        $('.dialogue_popup_close_button').trigger('click');
        
    } catch (error) {
        console.error(`[${extensionName}] Error rewriting character:`, error);
        
        // Check if aborted
        if (abortController === null || error.message === 'Operation aborted') {
            toastr.info("Rewrite aborted by user");
            if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-times-circle"></i><span>Rewrite aborted</span>';
        } else {
            toastr.error("Error: " + error.message);
            if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-exclamation-circle"></i><span>Error: ' + escapeHtml(error.message) + '</span>';
        }
        
        // Reset UI on error
        if (startBtn) startBtn.disabled = false;
        if (abortBtn) abortBtn.disabled = true;
        if (loadingEl) loadingEl.classList.add('hidden');
        if (statusEl) statusEl.classList.remove('hidden');
        if (payloadContainer) payloadContainer.classList.remove('disabled');
    }
};

window.povRewriteAbortClick = function(event) {
    event.preventDefault();
    console.log(`[${extensionName}] Abort button clicked via inline handler`);
    
    if (abortController) {
        abortController = null; // Signal that we want to abort
        toastr.info("Abort signal sent");
        
        const statusEl = document.getElementById('pov-rewrite-status');
        if (statusEl) {
            statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Attempting to abort...</span>';
        }
    }
};

const extensionName = "pov-rewrite";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Default settings
const defaultSettings = {
    enabled: true,
    promptTemplate: `You are an expert at converting character cards between narrative perspectives.

Task: Rewrite the provided character card from its current perspective (second-person or third-person) to first-person perspective.

Pronouns to use:
- I, me, my, mine, myself (for the character)
- We, us, our, ours (if applicable)

Rules:
PRIMARY OBJECTIVE: Focus ONLY on the PERSPECTIVE! Only change TENSE where necessary to reflect first-person POV.
1. Convert all references to the character from "he/she/they/you" to "I/my/me"
2. Convert all references to the user from "I/my/me" to "you"
3. Keep the character name unchanged
4. Preserve all metadata and formatting

Fields to Rewrite: {{FIELDS_LIST}}

IMPORTANT: Only rewrite the fields listed above. Return ONLY those fields in your JSON response.

Character Card JSON:
{{CHARACTER_JSON}}

Return ONLY a valid JSON object with the rewritten fields. Do not include any explanations or additional text.`,
    maxTokens: 4000,
    showPreview: true,
    fields: {
        description: true,
        personality: true,
        first_mes: true,
        mes_example: true,
        alternate_greetings: true
    }
};

// Initialize settings
extension_settings[extensionName] = extension_settings[extensionName] || {};
for (const [key, value] of Object.entries(defaultSettings)) {
    if (!extension_settings[extensionName].hasOwnProperty(key)) {
        extension_settings[extensionName][key] = value;
        saveSettingsDebounced();
    }
}

/**
 * Initialize the extension
 */
async function initExtension() {
    console.log(`[${extensionName}] Initializing extension...`);
    
    try {
        await addSettingsUI();
        addRewriteButton();
        console.log(`[${extensionName}] Extension initialized successfully.`);
    } catch (error) {
        console.error(`[${extensionName}] Error initializing extension:`, error);
    }
}

/**
 * Add settings UI to the extensions panel
 */
async function addSettingsUI() {
    try {
        const response = await fetch(
            `/scripts/extensions/third-party/${extensionName}/index.html`
        );
        if (!response.ok) {
            console.error(
                `[${extensionName}] Error loading settings HTML:`,
                response.statusText
            );
            return;
        }

        const html = await response.text();
        $("#extensions_settings").append(html);

        // Load settings into UI
        loadSettings();

        // Add event listeners
        $("#pov-rewrite-enabled").on("change", function () {
            extension_settings[extensionName].enabled = !!$(this).prop("checked");
            saveSettingsDebounced();
            addRewriteButton();
        });

        $("#pov-rewrite-prompt").on("change", function () {
            extension_settings[extensionName].promptTemplate = $(this).val();
            saveSettingsDebounced();
        });

        $("#pov-rewrite-tokens").on("change", function () {
            const value = $(this).val();
            extension_settings[extensionName].maxTokens = parseInt(String(value), 10);
            saveSettingsDebounced();
        });

        $("#pov-rewrite-preview").on("change", function () {
            extension_settings[extensionName].showPreview = !!$(this).prop("checked");
            saveSettingsDebounced();
        });

        // Field checkbox event listeners
        $("#pov-rewrite-field-description").on("change", function () {
            extension_settings[extensionName].fields.description = !!$(this).prop("checked");
            saveSettingsDebounced();
        });

        $("#pov-rewrite-field-personality").on("change", function () {
            extension_settings[extensionName].fields.personality = !!$(this).prop("checked");
            saveSettingsDebounced();
        });

        $("#pov-rewrite-field-first_mes").on("change", function () {
            extension_settings[extensionName].fields.first_mes = !!$(this).prop("checked");
            saveSettingsDebounced();
        });

        $("#pov-rewrite-field-mes_example").on("change", function () {
            extension_settings[extensionName].fields.mes_example = !!$(this).prop("checked");
            saveSettingsDebounced();
        });

        $("#pov-rewrite-field-alternate_greetings").on("change", function () {
            extension_settings[extensionName].fields.alternate_greetings = !!$(this).prop("checked");
            saveSettingsDebounced();
        });

        // Select All button
        $("#pov-rewrite-select-all").on("click", function () {
            extension_settings[extensionName].fields = {
                description: true,
                personality: true,
                first_mes: true,
                mes_example: true,
                alternate_greetings: true
            };
            $("#pov-rewrite-field-description").prop("checked", true);
            $("#pov-rewrite-field-personality").prop("checked", true);
            $("#pov-rewrite-field-first_mes").prop("checked", true);
            $("#pov-rewrite-field-mes_example").prop("checked", true);
            $("#pov-rewrite-field-alternate_greetings").prop("checked", true);
            saveSettingsDebounced();
        });

        // Deselect All button
        $("#pov-rewrite-deselect-all").on("click", function () {
            extension_settings[extensionName].fields = {
                description: false,
                personality: false,
                first_mes: false,
                mes_example: false,
                alternate_greetings: false
            };
            $("#pov-rewrite-field-description").prop("checked", false);
            $("#pov-rewrite-field-personality").prop("checked", false);
            $("#pov-rewrite-field-first_mes").prop("checked", false);
            $("#pov-rewrite-field-mes_example").prop("checked", false);
            $("#pov-rewrite-field-alternate_greetings").prop("checked", false);
            saveSettingsDebounced();
        });

    } catch (error) {
        console.error(`[${extensionName}] Error adding settings:`, error);
    }
}

/**
 * Load settings into the UI
 */
function loadSettings() {
    $("#pov-rewrite-enabled").prop(
        "checked",
        extension_settings[extensionName].enabled
    );
    $("#pov-rewrite-prompt").val(
        extension_settings[extensionName].promptTemplate
    );
    $("#pov-rewrite-tokens").val(
        extension_settings[extensionName].maxTokens
    );
    $("#pov-rewrite-preview").prop(
        "checked",
        extension_settings[extensionName].showPreview
    );
    
    // Load field toggle settings with backward compatibility
    const fields = extension_settings[extensionName].fields || defaultSettings.fields;
    $("#pov-rewrite-field-description").prop("checked", fields.description);
    $("#pov-rewrite-field-personality").prop("checked", fields.personality);
    $("#pov-rewrite-field-first_mes").prop("checked", fields.first_mes);
    $("#pov-rewrite-field-mes_example").prop("checked", fields.mes_example);
    $("#pov-rewrite-field-alternate_greetings").prop("checked", fields.alternate_greetings);
}

/**
 * Add or remove the rewrite button based on settings
 */
function addRewriteButton() {
    $(".pov-rewrite-button").remove();

    if (!extension_settings[extensionName].enabled) {
        return;
    }

    const buttonsBlock = $('.form_create_bottom_buttons_block');

    if (buttonsBlock.length) {
        const button = $("<div>", {
            id: "pov-rewrite-button",
            class: "menu_button fa-solid fa-comments pov-rewrite-button",
            title: "Rewrite character card to first-person perspective",
            click: rewriteCharacterCard,
        });

        const deleteButton = buttonsBlock.find('#favorite_button');
        if (deleteButton.length) {
            deleteButton.before(button);
        } else {
            buttonsBlock.append(button);
        }
        console.log(`[${extensionName}] Button added.`);
    } else {
        console.log(`[${extensionName}] Could not find buttons block.`);
    }
}

/**
 * Open the rewrite popup with payload display and controls
 */
async function rewriteCharacterCard() {
    console.log(`[${extensionName}] rewriteCharacterCard called`);
    try {
        const context = getContext();
        if (!context.characterId) {
            return toastr.info("No character selected");
        }

        const character = context.characters[context.characterId];
        if (!character) {
            return toastr.error("Character data not found");
        }

        // Get character data
        const characterData = getCharacterData(character);
        
        // Build prompt
        const prompt = buildRewritePrompt(characterData);

        // Calculate token count estimate
        const tokenCount = Math.ceil(prompt.length / 4);
        const fields = extension_settings[extensionName].fields || defaultSettings.fields;
        const enabledFields = Object.keys(fields).filter(key => fields[key]);

        // Create popup content with inline event handlers
        const popupHtml = `
            <div class="pov-rewrite-popup">
                <div class="pov-rewrite-header">
                    <h3>Perspective Rewrite</h3>
                    <p class="pov-rewrite-subtitle">Review the prompt before starting the rewrite process</p>
                </div>
                
                <div class="pov-rewrite-info">
                    <div class="pov-rewrite-info-item">
                        <strong>Character:</strong> ${character.name || 'Unknown'}
                    </div>
                    <div class="pov-rewrite-info-item">
                        <strong>Fields to rewrite:</strong> ${enabledFields.join(', ')}
                    </div>
                    <div class="pov-rewrite-info-item">
                        <strong>Estimated tokens:</strong> ~${tokenCount.toLocaleString()}
                    </div>
                    <div class="pov-rewrite-info-item">
                        <strong>Max response tokens:</strong> ${extension_settings[extensionName].maxTokens.toLocaleString()}
                    </div>
                </div>
                
                <div class="pov-rewrite-payload-section">
                    <h4>Prompt Preview</h4>
                    <div id="pov-payload-container" class="pov-rewrite-payload-container">
                        <pre class="pov-rewrite-payload">${escapeHtml(prompt)}</pre>
                    </div>
                </div>
                
                <div class="pov-rewrite-controls">
                    <div id="pov-rewrite-status" class="pov-rewrite-status">
                        <i class="fa-solid fa-info-circle"></i>
                        <span>Ready to start rewrite</span>
                    </div>
                    
                    <div class="pov-rewrite-buttons">
                        <button id="pov-rewrite-start-btn" class="menu_button primary-button" onclick="window.povRewriteStartClick(event)">
                            <i class="fa-solid fa-play"></i>
                            <span>Start Rewrite</span>
                        </button>
                        <button id="pov-rewrite-abort-btn" class="menu_button" disabled onclick="window.povRewriteAbortClick(event)">
                            <i class="fa-solid fa-stop"></i>
                            <span>Abort</span>
                        </button>
                    </div>
                    
                    <div id="pov-rewrite-loading" class="pov-rewrite-loading hidden">
                        <div class="spinner-container">
                            <i class="fa-solid fa-spinner fa-spin"></i>
                        </div>
                        <span>Rewriting character card...</span>
                    </div>
                </div>
            </div>
        `;

        // Create and show popup
        const rewritePopup = new Popup(popupHtml, POPUP_TYPE.TEXT, '', {
            wide: true,
            large: true,
            allowVerticalScrolling: true,
            okButton: 'Close',
            cancelButton: null
        });

        const popupResult = await rewritePopup.show();
        console.log(`[${extensionName}] Popup shown with inline event handlers, result:`, popupResult);
        
        // If user clicked Close (cancel), reset UI state
        if (popupResult === POPUP_RESULT.NEGATIVE) {
            console.log(`[${extensionName}] User clicked Close button, resetting state`);
            // Reset abort controller if it was set
            abortController = null;
        }
    
    } catch (error) {
        console.error(`[${extensionName}] Error opening rewrite popup:`, error);
        toastr.error("Error: " + error.message);
    }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Extract character data for rewriting
 */
function getCharacterData(character) {
    const data = character.data || {};
    
    return {
        name: data.name || character.name || "",
        description: data.description || "",
        personality: data.personality || "",
        scenario: data.scenario || "",
        first_mes: data.first_mes || character.first_mes || "",
        mes_example: data.mes_example || character.mes_example || "",
        alternate_greetings: data.alternate_greetings || [],
        creator_notes: data.creator_notes || "",
        post_history_instructions: data.post_history_instructions || "",
        system_prompt: data.system_prompt || "",
        tags: data.tags || []
    };
}

/**
 * Restore placeholders in AI response
 * Replaces actual character/user names with {{char}} and {{user}} placeholders
 */
function restorePlaceholdersInResponse(rewrittenData, character) {
    const context = getContext();
    const characterName = character.name || "";
    const userName = context.name1 || context.name2 || context.name || "";
    
    const restoreString = (str) => {
        if (!str || typeof str !== 'string') return str;
        
        let restored = str;
        
        // Replace actual character name with {{char}} placeholder
        if (characterName) {
            const charRegex = new RegExp(`\\b${escapeRegExp(characterName)}\\b`, 'g');
            restored = restored.replace(charRegex, '{{char}}');
        }
        
        // Replace actual user name with {{user}} placeholder
        if (userName) {
            const userRegex = new RegExp(`\\b${escapeRegExp(userName)}\\b`, 'g');
            restored = restored.replace(userRegex, '{{user}}');
        }
        
        return restored;
    };
    
    const restoreArray = (arr) => {
        if (!Array.isArray(arr)) return arr;
        return arr.map(item => restoreString(item));
    };
    
    // Restore placeholders in all fields
    if (rewrittenData.description !== undefined) {
        rewrittenData.description = restoreString(rewrittenData.description);
    }
    if (rewrittenData.personality !== undefined) {
        rewrittenData.personality = restoreString(rewrittenData.personality);
    }
    if (rewrittenData.first_mes !== undefined) {
        rewrittenData.first_mes = restoreString(rewrittenData.first_mes);
    }
    if (rewrittenData.mes_example !== undefined) {
        rewrittenData.mes_example = restoreString(rewrittenData.mes_example);
    }
    if (rewrittenData.alternate_greetings !== undefined) {
        rewrittenData.alternate_greetings = restoreArray(rewrittenData.alternate_greetings);
    }
    
    return rewrittenData;
}

/**
 * Escape special characters for regex
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filter character data to only include enabled fields
 * This minimizes token usage by sending only the fields that need to be rewritten
 */
function filterCharacterDataByEnabledFields(characterData) {
    const fields = extension_settings[extensionName].fields || defaultSettings.fields;
    const filteredData = {
        name: characterData.name // Always include name for context
    };
    
    // Only include enabled fields
    if (fields.description) {
        filteredData.description = characterData.description;
    }
    if (fields.personality) {
        filteredData.personality = characterData.personality;
    }
    if (fields.first_mes) {
        filteredData.first_mes = characterData.first_mes;
    }
    if (fields.mes_example) {
        filteredData.mes_example = characterData.mes_example;
    }
    if (fields.alternate_greetings) {
        filteredData.alternate_greetings = characterData.alternate_greetings;
    }
    
    return filteredData;
}

/**
 * Build the rewrite prompt with character data
 */
function buildRewritePrompt(characterData) {
    let prompt = extension_settings[extensionName].promptTemplate;
    
    // Get list of enabled fields
    const fields = extension_settings[extensionName].fields || defaultSettings.fields;
    const enabledFields = Object.keys(fields).filter(key => fields[key]);
    
    // Replace fields list placeholder
    const fieldsList = enabledFields.join(", ");
    prompt = prompt.replace("{{FIELDS_LIST}}", fieldsList);
    
    // Replace placeholder with character JSON (filtered to only include enabled fields)
    const filteredData = filterCharacterDataByEnabledFields(characterData);
    const characterJson = JSON.stringify(filteredData, null, 2);
    prompt = prompt.replace("{{CHARACTER_JSON}}", characterJson);
    
    return prompt;
}

/**
 * Handle AI response and update character
 */
async function handleAIResponse(response, currentCharacter) {
    try {
        console.log(`[${extensionName}] ========================================`);
        console.log(`[${extensionName}] Processing AI response...`);
        console.log(`[${extensionName}] Response type:`, typeof response);
        console.log(`[${extensionName}] Response:`, response);
        console.log(`[${extensionName}] Response stringified:`, JSON.stringify(response, null, 2));
        console.log(`[${extensionName}] ========================================`);
        
        // Parse JSON response
        let rewrittenData;
        
        // Handle different response formats
        if (typeof response === 'string') {
            console.log(`[${extensionName}] Response is string, length:`, response.length);
            console.log(`[${extensionName}] Response preview:`, response.substring(0, 300));
            
            // Try to parse as JSON first
            try {
                const parsed = JSON.parse(response);
                console.log(`[${extensionName}] Parsed string as JSON, keys:`, Object.keys(parsed));
                
                // Check if it's a chat completion response
                if (parsed.choices && Array.isArray(parsed.choices) && parsed.choices.length > 0) {
                    console.log(`[${extensionName}] Detected chat completion structure in parsed JSON`);
                    const message = parsed.choices[0].message;
                    let content = message.content || message.reasoning || '';
                    console.log(`[${extensionName}] Content length:`, content.length);
                    console.log(`[${extensionName}] Content preview:`, content.substring(0, 200));
                    
                    // Remove markdown code blocks if present
                    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    console.log(`[${extensionName}] Content after markdown removal, length:`, content.length);
                    
                    // Parse the content as JSON
                    try {
                        rewrittenData = JSON.parse(content);
                        console.log(`[${extensionName}] Successfully parsed content as JSON`);
                    } catch (e) {
                        console.warn(`[${extensionName}] Content is not valid JSON:`, e);
                        // Try to extract JSON from content
                        const jsonMatch = content.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            try {
                                rewrittenData = JSON.parse(jsonMatch[0]);
                                console.log(`[${extensionName}] Extracted JSON from content using regex`);
                            } catch (e2) {
                                console.error(`[${extensionName}] Failed to parse extracted JSON:`, e2);
                                throw new Error("Could not parse JSON from AI response");
                            }
                        } else {
                            throw new Error("No valid JSON found in AI response");
                        }
                    }
                } else {
                    // Direct JSON response
                    rewrittenData = parsed;
                    console.log(`[${extensionName}] Using parsed JSON directly`);
                }
            } catch (e) {
                console.warn(`[${extensionName}] Response is string but not valid JSON:`, e);
                // Try to extract JSON from the string directly
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        rewrittenData = JSON.parse(jsonMatch[0]);
                        console.log(`[${extensionName}] Extracted JSON from string using regex`);
                    } catch (e2) {
                        console.error(`[${extensionName}] Failed to parse extracted JSON:`, e2);
                        throw new Error("Could not parse JSON from AI response");
                    }
                } else {
                    throw new Error("No valid JSON found in AI response");
                }
            }
        } else if (typeof response === 'object' && response !== null) {
            console.log(`[${extensionName}] Response is object, keys:`, Object.keys(response));
            console.log(`[${extensionName}] Full response object:`, JSON.stringify(response, null, 2));
            
            // Check if it's a chat completion response
            if (response.choices && Array.isArray(response.choices) && response.choices.length > 0) {
                console.log(`[${extensionName}] Detected chat completion response structure`);
                console.log(`[${extensionName}] Number of choices:`, response.choices.length);
                const message = response.choices[0].message;
                console.log(`[${extensionName}] Message structure:`, message ? Object.keys(message) : 'null');
                console.log(`[${extensionName}] Full message:`, JSON.stringify(message, null, 2));
                
                // Extract content from message
                let content = message.content || message.reasoning || '';
                console.log(`[${extensionName}] Content length:`, content.length);
                console.log(`[${extensionName}] Content preview:`, content.substring(0, 200));
                console.log(`[${extensionName}] Full content:`, content);
                
                // Remove markdown code blocks if present
                console.log(`[${extensionName}] Removing markdown code blocks...`);
                content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                console.log(`[${extensionName}] Content after markdown removal, length:`, content.length);
                console.log(`[${extensionName}] Content after markdown removal preview:`, content.substring(0, 300));
                
                // Parse the content as JSON
                console.log(`[${extensionName}] Attempting to parse content as JSON...`);
                try {
                    rewrittenData = JSON.parse(content);
                    console.log(`[${extensionName}] ✓ Successfully parsed content as JSON`);
                    console.log(`[${extensionName}] Parsed data keys:`, Object.keys(rewrittenData));
                    console.log(`[${extensionName}] Parsed data sample:`, JSON.stringify(rewrittenData, null, 2).substring(0, 500));
                } catch (e) {
                    console.error(`[${extensionName}] ✗ Content is not valid JSON:`, e);
                    console.error(`[${extensionName}] Parse error details:`, e.message);
                    // Try to extract JSON from content
                    console.log(`[${extensionName}] Attempting to extract JSON using regex...`);
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        console.log(`[${extensionName}] Found JSON match, length:`, jsonMatch[0].length);
                        console.log(`[${extensionName}] JSON match preview:`, jsonMatch[0].substring(0, 300));
                        try {
                            rewrittenData = JSON.parse(jsonMatch[0]);
                            console.log(`[${extensionName}] ✓ Successfully extracted and parsed JSON from content`);
                        } catch (e2) {
                            console.error(`[${extensionName}] ✗ Failed to parse extracted JSON:`, e2);
                            throw new Error("Could not parse JSON from AI response");
                        }
                    } else {
                        console.error(`[${extensionName}] ✗ No JSON found in content`);
                        throw new Error("No valid JSON found in AI response");
                    }
                }
            } else if (response.description) {
                // Direct object response with character fields
                rewrittenData = {
                    name: currentCharacter.name || "",
                    description: response.description || "",
                    personality: response.personality || "",
                    scenario: response.scenario || "",
                    first_mes: response.first_mes || "",
                    mes_example: response.mes_example || "",
                    alternate_greetings: response.alternate_greetings || [],
                    creator_notes: response.creator_notes || "",
                    post_history_instructions: response.post_history_instructions || "",
                    system_prompt: response.system_prompt || "",
                    tags: response.tags || []
                };
                console.log(`[${extensionName}] Extracted fields from structured object response`);
            } else {
                // Response object without expected structure
                console.warn(`[${extensionName}] Response is object but missing expected fields:`, response);
                throw new Error("AI response does not contain expected character fields");
            }
        } else {
            console.warn(`[${extensionName}] Unexpected response format:`, typeof response);
            throw new Error("Invalid response format from AI");
        }

        // Validate response
        if (!rewrittenData || typeof rewrittenData !== 'object') {
            console.error(`[${extensionName}] Invalid rewritten data:`, rewrittenData);
            throw new Error("Invalid response format");
        }

        console.log(`[${extensionName}] Rewritten data keys:`, Object.keys(rewrittenData));
        console.log(`[${extensionName}] Has description:`, !!rewrittenData.description);
        console.log(`[${extensionName}] Has personality:`, !!rewrittenData.personality);

        // Restore placeholders in AI response
        rewrittenData = restorePlaceholdersInResponse(rewrittenData, currentCharacter);

        // Show preview if enabled
        if (extension_settings[extensionName].showPreview) {
            const confirmed = await showPreviewDialog(rewrittenData, currentCharacter);
            if (!confirmed) {
                console.log(`[${extensionName}] User cancelled rewrite`);
                // Reset UI state
                window.povRewriteResetUI();
                return;
            }
            // If confirmed, showPreviewDialog handles everything (closing popup, updating, saving)
            return;
        }

        console.log(`[${extensionName}] Updating character with rewritten data...`);
        
        // Update character
        updateCharacterFromAIResponse(rewrittenData, currentCharacter);

        console.log(`[${extensionName}] Triggering save...`);

        // Save character
        $("#create_button").trigger("click");
        
        toastr.success("Character card rewritten to first-person perspective!");
        console.log(`[${extensionName}] Rewrite completed successfully`);

    } catch (error) {
        console.error(`[${extensionName}] Error handling AI response:`, error);
        toastr.error("Error: " + error.message);
    }
}

/**
 * Show preview dialog with rewritten data
 */
async function showPreviewDialog(rewrittenData, character) {
    console.log(`[${extensionName}] Showing preview dialog with ${Object.keys(rewrittenData).length} fields`);
    
    const fields = extension_settings[extensionName].fields || defaultSettings.fields;
    const enabledFields = Object.keys(fields).filter(key => fields[key]);
    
    // Build preview sections for enabled fields only
    let previewSections = '';
    
    if (fields.description && rewrittenData.description !== undefined) {
        previewSections += `
            <div class="pov-rewrite-preview-section">
                <h4>Description</h4>
                <p>${rewrittenData.description || '(empty)'}</p>
            </div>
        `;
    }
    
    if (fields.personality && rewrittenData.personality !== undefined) {
        previewSections += `
            <div class="pov-rewrite-preview-section">
                <h4>Personality</h4>
                <p>${rewrittenData.personality || '(empty)'}</p>
            </div>
        `;
    }
    
    if (fields.first_mes && rewrittenData.first_mes !== undefined) {
        previewSections += `
            <div class="pov-rewrite-preview-section">
                <h4>First Message</h4>
                <p>${rewrittenData.first_mes || '(empty)'}</p>
            </div>
        `;
    }
    
    if (fields.mes_example && rewrittenData.mes_example !== undefined) {
        previewSections += `
            <div class="pov-rewrite-preview-section">
                <h4>Example Messages</h4>
                <p>${rewrittenData.mes_example || '(empty)'}</p>
            </div>
        `;
    }
    
    if (fields.alternate_greetings && rewrittenData.alternate_greetings !== undefined && rewrittenData.alternate_greetings.length > 0) {
        previewSections += `
            <div class="pov-rewrite-preview-section">
                <h4>Alternate Greetings (${rewrittenData.alternate_greetings.length})</h4>
                ${rewrittenData.alternate_greetings.map((greeting, index) => `
                    <div class="info-block" style="margin-bottom: 10px; padding: 10px;">
                        <strong>Greeting ${index + 1}:</strong>
                        <p>${greeting}</p>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    const previewHtml = `
        <div class="pov-rewrite-preview">
            <h3>Preview Changes</h3>
            <p>Review the rewritten character card before applying changes. The following fields will be updated: <strong>${enabledFields.join(', ')}</strong></p>
            
            ${previewSections}
            
            <div class="info-block info" style="margin-top: 20px;">
                <strong>Apply these changes?</strong><br>
                <small>Only the ${enabledFields.length} selected field(s) will be updated with the first-person perspective version above.</small>
            </div>
        </div>
    `;

    const popup = new Popup(previewHtml, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Apply Changes',
        cancelButton: 'Cancel',
        wide: true,
        large: true,
        allowVerticalScrolling: true
    });

    const result = await popup.show();
    console.log(`[${extensionName}] Preview dialog result:`, result);
    
    // If confirmed, update character and close ALL popups immediately
    if (result === POPUP_RESULT.AFFIRMATIVE) {
        console.log(`[${extensionName}] User confirmed preview, updating character...`);
        
        // Update character first
        updateCharacterFromAIResponse(rewrittenData, character);
        
        console.log(`[${extensionName}] Triggering save...`);
        
        // Save character
        $("#create_button").trigger("click");
        
        // Show success message
        toastr.success("Character card rewritten to first-person perspective!");
        console.log(`[${extensionName}] Rewrite completed successfully`);
        
        // Close ALL popups immediately
        console.log(`[${extensionName}] Force closing all popups immediately...`);
        
        // Find and click all close buttons
        $('.dialogue_popup_close_button').each(function() {
            $(this).trigger('click');
            $(this).click();
        });
        
        // Force remove the main rewrite popup immediately
        $('.pov-rewrite-popup').closest('.dialogue_popup_holder').remove();
        
        // Force remove any remaining popup elements
        $('.dialogue_popup_holder').remove();
        $('.dialogue_popup').remove();
        $('[class*="popup"]').filter(function() {
            return $(this).is(':visible') && $(this).css('position') === 'fixed';
        }).remove();
        
    } else {
        console.log(`[${extensionName}] User cancelled preview`);
        // Reset UI state
        window.povRewriteResetUI();
    }
    
    return result === POPUP_RESULT.AFFIRMATIVE;
}

/**
 * Update character data from AI response
 */
function updateCharacterFromAIResponse(rewrittenData, character) {
    const data = character.data || {};
    const fields = extension_settings[extensionName].fields || defaultSettings.fields;

    // Update only enabled fields
    if (fields.description && rewrittenData.description !== undefined) {
        data.description = rewrittenData.description;
        $("#description_textarea").val(rewrittenData.description);
    }

    if (fields.personality && rewrittenData.personality !== undefined) {
        data.personality = rewrittenData.personality;
        $("#personality_textarea").val(rewrittenData.personality);
    }

    if (fields.first_mes && rewrittenData.first_mes !== undefined) {
        data.first_mes = rewrittenData.first_mes;
        character.first_mes = rewrittenData.first_mes;
        $("#firstmessage_textarea").val(rewrittenData.first_mes);
    }

    if (fields.mes_example && rewrittenData.mes_example !== undefined) {
        data.mes_example = rewrittenData.mes_example;
        character.mes_example = rewrittenData.mes_example;
        $("#mes_example_textarea").val(rewrittenData.mes_example);
    }

    if (fields.alternate_greetings && rewrittenData.alternate_greetings !== undefined) {
        data.alternate_greetings = rewrittenData.alternate_greetings;
        $("#alternate_greetings_template").val(
            JSON.stringify(rewrittenData.alternate_greetings, null, 2)
        );
    }

    // Trigger change events for updated fields only
    const selectorsToUpdate = [];
    if (fields.description) selectorsToUpdate.push("#description_textarea");
    if (fields.personality) selectorsToUpdate.push("#personality_textarea");
    if (fields.first_mes) selectorsToUpdate.push("#firstmessage_textarea");
    if (fields.mes_example) selectorsToUpdate.push("#mes_example_textarea");
    if (fields.alternate_greetings) selectorsToUpdate.push("#alternate_greetings_template");
    
    selectorsToUpdate.forEach((sel) => $(sel).trigger("change"));
}

// Initialize when document is ready
$(document).ready(function () {
    initExtension();
});