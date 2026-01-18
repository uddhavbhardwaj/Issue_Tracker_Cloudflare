/**
 * Batch Processing Module for Feedback Radar
 * Handles validation and processing of multiple feedback items
 */

import { processSingleFeedback as sharedProcessSingleFeedback } from './feedback-processor.js';

/**
 * Validates a single feedback item with detailed field-level validation
 * @param {Object} feedbackItem - The feedback item to validate
 * @param {number} index - The index of the item in the batch (for error reporting)
 * @returns {Object} Validation result with success flag, field errors, and warnings
 */
export function validateFeedbackItem(feedbackItem, index = 0) {
    const fieldErrors = {};
    const warnings = [];
    const generalErrors = [];

    // Check if feedbackItem is an object
    if (!feedbackItem || typeof feedbackItem !== 'object') {
        return {
            success: false,
            index,
            fieldErrors: {},
            generalErrors: ['Must be a valid object'],
            warnings: [],
            summary: 'Invalid item structure'
        };
    }

    // Validate required field: content
    if (feedbackItem.content === undefined || feedbackItem.content === null) {
        fieldErrors.content = ['Field is required'];
    } else if (typeof feedbackItem.content !== 'string') {
        fieldErrors.content = ['Must be a string'];
    } else if (feedbackItem.content.trim() === '') {
        fieldErrors.content = ['Cannot be empty or whitespace only'];
    } else {
        // Content length validation
        if (feedbackItem.content.length < 5) {
            warnings.push('Content is very short (less than 5 characters)');
        }
        if (feedbackItem.content.length > 10000) {
            fieldErrors.content = [`Content too long (${feedbackItem.content.length} characters, maximum 10000)`];
        } else if (feedbackItem.content.length > 5000) {
            warnings.push(`Content is quite long (${feedbackItem.content.length} characters)`);
        }
    }

    // Validate required field: source
    if (feedbackItem.source === undefined || feedbackItem.source === null) {
        fieldErrors.source = ['Field is required'];
    } else if (typeof feedbackItem.source !== 'string') {
        fieldErrors.source = ['Must be a string'];
    } else if (feedbackItem.source.trim() === '') {
        fieldErrors.source = ['Cannot be empty or whitespace only'];
    } else if (feedbackItem.source.length > 255) {
        fieldErrors.source = [`Source too long (${feedbackItem.source.length} characters, maximum 255)`];
    }

    // Validate optional metadata with detailed field validation
    if (feedbackItem.metadata !== undefined) {
        if (typeof feedbackItem.metadata !== 'object' || feedbackItem.metadata === null) {
            fieldErrors.metadata = ['Must be an object if provided'];
        } else {
            const metadataErrors = [];
            const { priority, category, timestamp, userId } = feedbackItem.metadata;

            // Validate metadata.priority
            if (priority !== undefined) {
                if (typeof priority !== 'string') {
                    metadataErrors.push('priority must be a string');
                } else if (priority.length > 50) {
                    metadataErrors.push(`priority too long (${priority.length} characters, maximum 50)`);
                }
            }

            // Validate metadata.category
            if (category !== undefined) {
                if (typeof category !== 'string') {
                    metadataErrors.push('category must be a string');
                } else if (category.length > 100) {
                    metadataErrors.push(`category too long (${category.length} characters, maximum 100)`);
                }
            }

            // Validate metadata.timestamp
            if (timestamp !== undefined) {
                if (typeof timestamp !== 'string') {
                    metadataErrors.push('timestamp must be a string');
                } else {
                    // Try to parse as ISO date
                    const date = new Date(timestamp);
                    if (isNaN(date.getTime())) {
                        metadataErrors.push('timestamp must be a valid ISO date string');
                    }
                }
            }

            // Validate metadata.userId
            if (userId !== undefined) {
                if (typeof userId !== 'string') {
                    metadataErrors.push('userId must be a string');
                } else if (userId.length > 255) {
                    metadataErrors.push(`userId too long (${userId.length} characters, maximum 255)`);
                }
            }

            if (metadataErrors.length > 0) {
                fieldErrors.metadata = metadataErrors;
            }
        }
    }

    // Check for unexpected fields (warn but don't fail)
    const allowedFields = ['content', 'source', 'metadata'];
    const unexpectedFields = Object.keys(feedbackItem).filter(key => !allowedFields.includes(key));
    if (unexpectedFields.length > 0) {
        warnings.push(`Unexpected fields will be ignored: ${unexpectedFields.join(', ')}`);
    }

    const hasFieldErrors = Object.keys(fieldErrors).length > 0;
    const hasGeneralErrors = generalErrors.length > 0;

    return {
        success: !hasFieldErrors && !hasGeneralErrors,
        index,
        fieldErrors,
        generalErrors,
        warnings,
        summary: hasFieldErrors || hasGeneralErrors 
            ? `Validation failed for ${Object.keys(fieldErrors).length} field(s)` 
            : 'Valid'
    };
}

/**
 * Validates an array of feedback items with enhanced error reporting
 * @param {Array} feedbackArray - Array of feedback items to validate
 * @returns {Object} Validation result with overall success and detailed per-item results
 */
export function validateFeedbackBatch(feedbackArray) {
    // Validate input is an array
    if (!Array.isArray(feedbackArray)) {
        return {
            success: false,
            batchErrors: ['Input must be an array of feedback items'],
            itemResults: [],
            summary: {
                total: 0,
                valid: 0,
                invalid: 0,
                warnings: 0
            }
        };
    }

    // Validate array is not empty
    if (feedbackArray.length === 0) {
        return {
            success: false,
            batchErrors: ['Array cannot be empty - at least one feedback item is required'],
            itemResults: [],
            summary: {
                total: 0,
                valid: 0,
                invalid: 0,
                warnings: 0
            }
        };
    }

    // Validate batch size limits
    const maxBatchSize = 100;
    if (feedbackArray.length > maxBatchSize) {
        return {
            success: false,
            batchErrors: [`Batch size too large (${feedbackArray.length} items, maximum ${maxBatchSize})`],
            itemResults: [],
            summary: {
                total: feedbackArray.length,
                valid: 0,
                invalid: feedbackArray.length,
                warnings: 0
            }
        };
    }

    // Validate each item
    const itemResults = [];
    let validCount = 0;
    let invalidCount = 0;
    let warningCount = 0;

    for (let i = 0; i < feedbackArray.length; i++) {
        const validation = validateFeedbackItem(feedbackArray[i], i);
        itemResults.push(validation);
        
        if (validation.success) {
            validCount++;
        } else {
            invalidCount++;
        }
        
        if (validation.warnings.length > 0) {
            warningCount++;
        }
    }

    return {
        success: invalidCount === 0,
        batchErrors: invalidCount > 0 ? [`${invalidCount} of ${feedbackArray.length} items failed validation`] : [],
        itemResults,
        summary: {
            total: feedbackArray.length,
            valid: validCount,
            invalid: invalidCount,
            warnings: warningCount
        }
    };
}

/**
 * Formats validation errors for API response with detailed field-level reporting
 * @param {Object} validationResult - Result from validateFeedbackBatch
 * @returns {Object} Formatted error response with detailed validation information
 */
export function formatValidationErrors(validationResult) {
    const response = {
        error: 'Validation failed',
        success: validationResult.success,
        summary: validationResult.summary || {
            total: 0,
            valid: 0,
            invalid: 0,
            warnings: 0
        }
    };

    // Add batch-level errors
    if (validationResult.batchErrors && validationResult.batchErrors.length > 0) {
        response.batchErrors = validationResult.batchErrors;
    }

    // Add detailed item validation results
    if (validationResult.itemResults && validationResult.itemResults.length > 0) {
        response.itemValidation = validationResult.itemResults.map(result => {
            const itemResponse = {
                index: result.index,
                valid: result.success,
                summary: result.summary
            };

            // Add field-level errors if present
            if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
                itemResponse.fieldErrors = result.fieldErrors;
            }

            // Add general errors if present
            if (result.generalErrors && result.generalErrors.length > 0) {
                itemResponse.generalErrors = result.generalErrors;
            }

            // Add warnings if present
            if (result.warnings && result.warnings.length > 0) {
                itemResponse.warnings = result.warnings;
            }

            return itemResponse;
        });

        // Filter to show only items with issues for cleaner response
        response.itemsWithIssues = response.itemValidation.filter(item => 
            !item.valid || (item.warnings && item.warnings.length > 0)
        );
    }

    // Add helpful message based on validation results
    if (response.summary.invalid === response.summary.total) {
        response.message = 'All items failed validation. Please check the field errors and try again.';
    } else if (response.summary.invalid > 0) {
        response.message = `${response.summary.invalid} of ${response.summary.total} items failed validation. Valid items can be resubmitted.`;
    } else if (response.summary.warnings > 0) {
        response.message = `All items are valid but ${response.summary.warnings} have warnings.`;
    }

    return response;
}
/**

 * Processes a single feedback item through the complete pipeline
 * @param {Object} feedbackItem - The feedback item to process
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Object} Processing result with success flag and data
 */
export async function processSingleFeedback(feedbackItem, env) {
    try {
        // Convert batch item format to shared processor format
        const feedbackData = {
            content: feedbackItem.content.trim(),
            source: feedbackItem.source.trim(),
            file: null // Batch processing doesn't support file uploads yet
        };
        
        // Use the shared processing pipeline
        const result = await sharedProcessSingleFeedback(feedbackData, env);

        return {
            success: true,
            feedbackId: result.id,
            data: result
        };
    } catch (error) {
        console.error('Error processing single feedback:', error);
        return {
            success: false,
            error: error.message || 'Unknown processing error'
        };
    }
}

/**
 * Processes a batch of feedback items with enhanced error isolation and reporting
 * @param {Array} feedbackArray - Array of feedback items to process
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Object} Batch processing results with detailed error information
 */
export async function processFeedbackBatch(feedbackArray, env) {
    // First validate the entire batch
    const validation = validateFeedbackBatch(feedbackArray);
    
    if (!validation.success) {
        return {
            success: false,
            total: feedbackArray.length,
            processed: 0,
            failed: feedbackArray.length,
            batchErrors: validation.batchErrors || [],
            validationSummary: validation.summary,
            results: validation.itemResults.map((result) => ({
                index: result.index,
                success: false,
                error: result.success ? 'Batch validation failed' : result.summary,
                fieldErrors: result.fieldErrors,
                generalErrors: result.generalErrors,
                warnings: result.warnings
            }))
        };
    }

    const results = [];
    let processedCount = 0;
    let failedCount = 0;

    // Process each item individually with error isolation
    for (let i = 0; i < feedbackArray.length; i++) {
        const feedbackItem = feedbackArray[i];
        const itemValidation = validation.itemResults[i];
        
        try {
            // Skip processing if item failed validation
            if (!itemValidation.success) {
                results.push({
                    index: i,
                    success: false,
                    error: itemValidation.summary,
                    fieldErrors: itemValidation.fieldErrors,
                    generalErrors: itemValidation.generalErrors,
                    warnings: itemValidation.warnings
                });
                failedCount++;
                continue;
            }

            // Process the individual item
            const processingResult = await processSingleFeedback(feedbackItem, env);
            
            if (processingResult.success) {
                results.push({
                    index: i,
                    success: true,
                    feedbackId: processingResult.feedbackId,
                    warnings: itemValidation.warnings.length > 0 ? itemValidation.warnings : undefined
                });
                processedCount++;
            } else {
                results.push({
                    index: i,
                    success: false,
                    error: processingResult.error,
                    processingError: true
                });
                failedCount++;
            }
        } catch (error) {
            console.error(`Error processing item at index ${i}:`, error);
            results.push({
                index: i,
                success: false,
                error: error.message || 'Unknown processing error',
                processingError: true
            });
            failedCount++;
        }
    }

    return {
        success: failedCount === 0,
        total: feedbackArray.length,
        processed: processedCount,
        failed: failedCount,
        validationSummary: validation.summary,
        results
    };
}

/**
 * Formats batch processing results for API response
 * @param {Object} batchResult - Result from processFeedbackBatch
 * @returns {Object} Formatted API response
 */
export function formatBatchResponse(batchResult) {
    const response = {
        total: batchResult.total,
        processed: batchResult.processed,
        failed: batchResult.failed,
        results: batchResult.results
    };

    // Add summary message
    if (batchResult.failed === 0) {
        response.message = `Successfully processed all ${batchResult.processed} feedback items`;
    } else if (batchResult.processed === 0) {
        response.message = `Failed to process all ${batchResult.failed} feedback items`;
    } else {
        response.message = `Processed ${batchResult.processed} items successfully, ${batchResult.failed} failed`;
    }

    // Add errors if present
    if (batchResult.errors && batchResult.errors.length > 0) {
        response.errors = batchResult.errors;
    }

    return response;
}
/**

 * Determines the appropriate HTTP status code for batch processing results
 * @param {Object} batchResult - Result from processFeedbackBatch
 * @returns {number} HTTP status code
 */
export function determineHttpStatusCode(batchResult) {
    // If there are batch-level errors (validation failures, etc.)
    if (batchResult.batchErrors && batchResult.batchErrors.length > 0) {
        return 400; // Bad Request
    }
    
    // If no items were processed at all
    if (batchResult.total === 0) {
        return 400; // Bad Request - empty batch
    }
    
    // If all items failed
    if (batchResult.failed === batchResult.total) {
        return 400; // Bad Request - complete failure
    }
    
    // If some items succeeded and some failed (partial success)
    if (batchResult.processed > 0 && batchResult.failed > 0) {
        return 207; // Multi-Status - partial success
    }
    
    // If all items succeeded
    if (batchResult.processed === batchResult.total) {
        return 200; // OK - complete success
    }
    
    // Fallback for unexpected scenarios
    return 500; // Internal Server Error
}

/**
 * Creates a standardized error response structure
 * @param {string} errorType - Type of error (validation, processing, system)
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Standardized error response
 */
export function createErrorResponse(errorType, message, details = {}, statusCode = 500) {
    const response = {
        error: message,
        type: errorType,
        statusCode,
        timestamp: new Date().toISOString()
    };
    
    // Add details if provided
    if (Object.keys(details).length > 0) {
        response.details = details;
    }
    
    // Add helpful messages based on status code
    switch (statusCode) {
        case 400:
            response.help = 'Please check your request format and data, then try again.';
            break;
        case 207:
            response.help = 'Some items were processed successfully. Check the results for details.';
            break;
        case 413:
            response.help = 'Request is too large. Try reducing the batch size or content length.';
            break;
        case 500:
            response.help = 'A server error occurred. Please try again later.';
            break;
    }
    
    return response;
}

/**
 * Enhanced batch response formatter with proper HTTP status code handling
 * @param {Object} batchResult - Result from processFeedbackBatch
 * @returns {Object} Enhanced API response with status code information
 */
export function formatBatchResponseWithStatus(batchResult) {
    const statusCode = determineHttpStatusCode(batchResult);
    
    const response = {
        success: batchResult.success,
        statusCode,
        total: batchResult.total,
        processed: batchResult.processed,
        failed: batchResult.failed,
        results: batchResult.results,
        timestamp: new Date().toISOString()
    };

    // Add validation summary if available
    if (batchResult.validationSummary) {
        response.validationSummary = batchResult.validationSummary;
    }

    // Add batch errors if present
    if (batchResult.batchErrors && batchResult.batchErrors.length > 0) {
        response.batchErrors = batchResult.batchErrors;
    }

    // Add contextual message based on status code
    switch (statusCode) {
        case 200:
            response.message = `Successfully processed all ${batchResult.processed} feedback items`;
            break;
        case 207:
            response.message = `Partial success: ${batchResult.processed} items processed, ${batchResult.failed} failed`;
            response.help = 'Check individual item results for details on failures';
            break;
        case 400:
            if (batchResult.failed === batchResult.total) {
                response.message = `All ${batchResult.failed} items failed processing`;
            } else {
                response.message = 'Request validation failed';
            }
            response.help = 'Please check your request format and data, then try again';
            break;
        case 500:
            response.message = 'Internal server error during batch processing';
            response.help = 'Please try again later or contact support if the issue persists';
            break;
    }

    return response;
}