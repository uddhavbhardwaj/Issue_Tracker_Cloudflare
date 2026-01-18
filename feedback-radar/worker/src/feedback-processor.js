/**
 * Shared feedback processing module
 * Handles database insertion and workflow triggering for both individual and batch processing
 */

/**
 * Process a single feedback item through the complete pipeline
 * @param {Object} feedbackData - The feedback data to process
 * @param {string} feedbackData.content - The feedback content
 * @param {string} feedbackData.source - The feedback source
 * @param {File|Blob} feedbackData.file - Optional file attachment
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<Object>} The processed feedback record with metadata
 */
export async function processSingleFeedback(feedbackData, env) {
    const { content, source, file } = feedbackData;

    // 1. Upload file to R2 if provided
    let imageUrl = null;
    if (file && (file instanceof File || file instanceof Blob)) {
        const key = `${Date.now()}-${file.name || 'upload'}`;
        await env.FEEDBACK_BUCKET.put(key, file);
        imageUrl = key;
    }

    // 2. Save initial "Pending" record to D1
    const { results } = await env.DB.prepare(`
        INSERT INTO feedback (content, source, sentiment, urgency_score, urgency_reason, themes, status, image_key, created_at)
        VALUES (?, ?, 'Pending', 0, 'Analyzing...', '[]', 'New', ?, ?)
        RETURNING *
    `).bind(content, source || 'Unknown', imageUrl, feedbackData.timestamp || new Date().toISOString()).all();

    const feedback = results[0];

    // 3. Trigger workflow for async analysis
    await triggerFeedbackWorkflow(feedback, env);

    return {
        ...feedback,
        message: "Feedback received. Analysis in progress."
    };
}

/**
 * Trigger the feedback analysis workflow
 * @param {Object} feedback - The feedback record from database
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<boolean>} Whether workflow was successfully triggered
 */
export async function triggerFeedbackWorkflow(feedback, env) {
    try {
        // Fallback to synchronous/inline analysis for reliability in this debugging phase.
        // In production, this should ideally be offloaded to a Workflow or Queue.

        console.log(`Starting inline analysis for feedback ${feedback.id}...`);

        const systemPrompt = `You are a helpful assistant that analyzes product feedback. 
Analyze the following feedback and extract:
- sentiment: "Positive", "Neutral", "Negative"
- urgency_score: Integer 1-10 (10=Critical/Security, 7=Major Bug, 5=Feature Request, 1=Minor/Cosmetic)
- urgency_reason: Short explanation (max 10 words)
- themes: Array of 1-3 key strings (e.g., ["UI", "Performance", "Billing"])

Return ONLY valid JSON. Do not output markdown code blocks.`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Feedback: "${feedback.content}"\n\nReturn JSON.` }
        ];

        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', { messages });

        // Parse JSON
        let result = { sentiment: 'Neutral', urgency_score: 5, urgency_reason: 'AI parsing failed', themes: [] };
        try {
            let text = response.response || '';
            text = text.replace(/```json\n?|\n?```/g, '').trim();
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                result = JSON.parse(match[0]);
            } else {
                result = JSON.parse(text);
            }
        } catch (e) {
            console.error("AI Parse Error", e);
        }

        // Ensure types
        const themesStr = JSON.stringify(Array.isArray(result.themes) ? result.themes : []);
        const score = typeof result.urgency_score === 'number' ? result.urgency_score : 5;
        const reason = result.urgency_reason || 'Analyzed';
        const sentiment = result.sentiment || 'Neutral';

        // Update DB
        await env.DB.prepare(`
          UPDATE feedback 
          SET sentiment = ?, urgency_score = ?, urgency_reason = ?, themes = ?, status = 'New'
          WHERE id = ?
        `).bind(sentiment, score, reason, themesStr, feedback.id).run();

        console.log(`Inline analysis complete for ${feedback.id}`);

        // --- EMBEDDINGS & VECTOR SEARCH ---
        try {
            if (env.VECTORIZE_INDEX) {
                console.log(`Generating embeddings for ${feedback.id}...`);
                const embeddingResp = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
                    text: [feedback.content]
                });
                const values = embeddingResp.data[0];

                await env.VECTORIZE_INDEX.upsert([{
                    id: feedback.id.toString(),
                    values: values,
                    metadata: {
                        source: feedback.source,
                        sentiment: sentiment
                    }
                }]);
                console.log(`Vector indexed for ${feedback.id}`);
            } else {
                console.warn("VECTORIZE_INDEX not bound, skipping similarity indexing.");
            }
        } catch (vecError) {
            console.error("Vector indexing failed:", vecError);
            // Don't fail the request, just log it.
        }

        return true;

    } catch (e) {
        console.warn('Inline analysis failed:', e);
        return false;
    }
}

/**
 * Validate feedback data structure with detailed field-level validation
 * @param {Object} feedbackData - The feedback data to validate
 * @returns {Object} Validation result with detailed field errors and warnings
 */
export function validateFeedbackData(feedbackData) {
    const fieldErrors = {};
    const warnings = [];
    const generalErrors = [];

    if (!feedbackData) {
        return {
            isValid: false,
            fieldErrors: {},
            generalErrors: ['Feedback data is required'],
            warnings: [],
            summary: 'No data provided'
        };
    }

    // Validate content field
    if (feedbackData.content === undefined || feedbackData.content === null) {
        fieldErrors.content = ['Field is required'];
    } else if (typeof feedbackData.content !== 'string') {
        fieldErrors.content = ['Must be a string'];
    } else if (feedbackData.content.trim() === '') {
        fieldErrors.content = ['Cannot be empty or whitespace only'];
    } else {
        // Content length validation
        if (feedbackData.content.length < 5) {
            warnings.push('Content is very short (less than 5 characters)');
        }
        if (feedbackData.content.length > 10000) {
            fieldErrors.content = [`Content too long (${feedbackData.content.length} characters, maximum 10000)`];
        } else if (feedbackData.content.length > 5000) {
            warnings.push(`Content is quite long (${feedbackData.content.length} characters)`);
        }
    }

    // Validate source field
    if (feedbackData.source === undefined || feedbackData.source === null) {
        fieldErrors.source = ['Field is required'];
    } else if (typeof feedbackData.source !== 'string') {
        fieldErrors.source = ['Must be a string'];
    } else if (feedbackData.source.trim() === '') {
        fieldErrors.source = ['Cannot be empty or whitespace only'];
    } else if (feedbackData.source.length > 255) {
        fieldErrors.source = [`Source too long (${feedbackData.source.length} characters, maximum 255)`];
    }

    // Validate file if provided
    if (feedbackData.file !== undefined && feedbackData.file !== null) {
        if (!(feedbackData.file instanceof File) && !(feedbackData.file instanceof Blob)) {
            fieldErrors.file = ['Must be a valid File or Blob object'];
        } else {
            // File size validation (10MB limit)
            const maxFileSize = 10 * 1024 * 1024; // 10MB
            if (feedbackData.file.size > maxFileSize) {
                fieldErrors.file = [`File too large (${Math.round(feedbackData.file.size / 1024 / 1024)}MB, maximum 10MB)`];
            } else if (feedbackData.file.size > 5 * 1024 * 1024) { // 5MB warning
                warnings.push(`Large file size (${Math.round(feedbackData.file.size / 1024 / 1024)}MB)`);
            }

            // File type validation (basic check)
            if (feedbackData.file.type && !feedbackData.file.type.startsWith('image/')) {
                warnings.push('File does not appear to be an image');
            }
        }
    }

    // Validate timestamp field
    if (feedbackData.timestamp === undefined || feedbackData.timestamp === null) {
        fieldErrors.timestamp = ['Field is required'];
    } else if (isNaN(Date.parse(feedbackData.timestamp))) {
        fieldErrors.timestamp = ['Must be a valid ISO date string'];
    }

    // Check for unexpected fields
    const allowedFields = ['content', 'source', 'file', 'timestamp'];
    const unexpectedFields = Object.keys(feedbackData).filter(key => !allowedFields.includes(key));
    if (unexpectedFields.length > 0) {
        warnings.push(`Unexpected fields will be ignored: ${unexpectedFields.join(', ')}`);
    }

    const hasFieldErrors = Object.keys(fieldErrors).length > 0;
    const hasGeneralErrors = generalErrors.length > 0;

    return {
        isValid: !hasFieldErrors && !hasGeneralErrors,
        fieldErrors,
        generalErrors,
        warnings,
        summary: hasFieldErrors || hasGeneralErrors
            ? `Validation failed for ${Object.keys(fieldErrors).length} field(s)`
            : 'Valid',
        // Legacy support for existing code
        errors: [
            ...generalErrors,
            ...Object.entries(fieldErrors).map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        ]
    };
}