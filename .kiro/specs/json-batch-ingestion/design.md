# Design Document

## Overview

This design enhances the feedback radar system to support batch ingestion of multiple feedback items from JSON input. The solution introduces a unified batch processing pipeline that handles both production ingestion and mock data loading, ensuring consistency across all data entry points while maintaining the existing single-item ingestion capability.

## Architecture

### Current Architecture Analysis
The existing system processes feedback through these components:
- Individual feedback endpoint (`/api/feedback`) that handles single items
- Mock data seeder (`/api/seed`) with hardcoded SQL inserts
- Workflow-based analysis pipeline for sentiment, urgency, and vectorization
- D1 database storage with R2 for file attachments

### Enhanced Architecture
The new design introduces:
- **Batch Processing Layer**: Handles arrays of feedback items
- **Unified Ingestion Pipeline**: Single code path for both individual and batch processing
- **Enhanced Mock Data Loader**: Uses production pipeline instead of direct SQL
- **Improved Error Handling**: Per-item validation and processing results

## Components and Interfaces

### 1. Batch Ingestion Endpoint

**New Endpoint**: `POST /api/feedback/batch`

**Input Schema**:
```json
{
  "feedback": [
    {
      "content": "string (required)",
      "source": "string (required)", 
      "metadata": {
        "priority": "string (optional)",
        "category": "string (optional)"
      }
    }
  ]
}
```

**Response Schema**:
```json
{
  "total": "number",
  "processed": "number", 
  "failed": "number",
  "results": [
    {
      "index": "number",
      "success": "boolean",
      "feedbackId": "number (if successful)",
      "error": "string (if failed)"
    }
  ]
}
```

### 2. Enhanced Individual Endpoint

**Modified Endpoint**: `POST /api/feedback`

The existing endpoint will be refactored to use the same internal processing pipeline as batch ingestion, maintaining backward compatibility while ensuring consistency.

### 3. Batch Processor Module

**Core Processing Function**:
```javascript
async function processFeedbackBatch(feedbackArray, env) {
  const results = [];
  
  for (let i = 0; i < feedbackArray.length; i++) {
    try {
      const result = await processSingleFeedback(feedbackArray[i], env);
      results.push({ index: i, success: true, feedbackId: result.id });
    } catch (error) {
      results.push({ index: i, success: false, error: error.message });
    }
  }
  
  return results;
}
```

### 4. Updated Mock Data Loader

**Modified Endpoint**: `POST /api/seed`

**New Input Schema**:
```json
{
  "mockData": [
    {
      "content": "string",
      "source": "string",
      "metadata": {}
    }
  ]
}
```

The seeder will accept JSON input and process it through the same batch pipeline used in production.

## Data Models

### Feedback Item Structure
```javascript
{
  content: String,        // Required: The feedback text
  source: String,         // Required: Source of feedback
  metadata: {             // Optional: Additional context
    priority: String,
    category: String,
    timestamp: String,
    userId: String
  }
}
```

### Processing Result Structure
```javascript
{
  index: Number,          // Position in original array
  success: Boolean,       // Processing success flag
  feedbackId: Number,     // Database ID (if successful)
  error: String,          // Error message (if failed)
  warnings: Array         // Non-fatal issues
}
```

## Error Handling

### Validation Levels

1. **Payload Level**: Validate JSON structure and required array format
2. **Item Level**: Validate individual feedback items for required fields
3. **Processing Level**: Handle database, AI, and workflow errors per item

### Error Response Strategy

- **400 Bad Request**: Malformed JSON or missing required payload structure
- **207 Multi-Status**: Partial success with mixed results per item
- **200 OK**: All items processed successfully
- **500 Internal Server Error**: System-level failures

### Resilience Patterns

- **Continue on Error**: Process remaining items if individual items fail
- **Detailed Reporting**: Return specific error information for each failed item
- **Graceful Degradation**: Allow processing without workflow triggers in development

## Testing Strategy

### Unit Tests
- Batch processor function with various input scenarios
- Individual item validation logic
- Error handling for malformed data
- Mock data processing pipeline

### Integration Tests
- End-to-end batch ingestion with database persistence
- Workflow trigger verification for batch items
- Mock data loader using production pipeline
- Error scenarios with partial failures

### Performance Tests
- Large batch processing (100+ items)
- Memory usage during batch processing
- Database transaction handling for batches
- Concurrent batch processing

## Implementation Phases

### Phase 1: Core Batch Processing
- Create batch processor module
- Implement batch ingestion endpoint
- Add comprehensive error handling
- Update individual endpoint to use shared pipeline

### Phase 2: Mock Data Integration
- Refactor seed endpoint to accept JSON input
- Ensure mock data uses production pipeline
- Add validation for mock data format
- Maintain backward compatibility for existing seed behavior

### Phase 3: Enhanced Features
- Add batch processing metrics and logging
- Implement batch size limits and pagination
- Add support for file attachments in batch processing
- Optimize database operations for large batches