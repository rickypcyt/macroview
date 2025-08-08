// Error handling utilities for MacroView
export class APIError extends Error {
  constructor(
    message: string,
    public endpoint: string,
    public status?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export const logError = (error: unknown, context: string) => {
  console.error(`[MacroView Error - ${context}]:`, error);
  
  // In production, you might want to send this to a logging service
  if (process.env.NODE_ENV === 'production') {
    // Example: Send to logging service
    // sendToLoggingService({ error, context, timestamp: new Date().toISOString() });
  }
};

export const handleAPIError = (error: unknown, endpoint: string): APIError => {
  if (error instanceof Response) {
    return new APIError(
      `API request failed: ${error.statusText}`,
      endpoint,
      error.status,
      error
    );
  }
  
  if (error instanceof Error) {
    return new APIError(
      `API request failed: ${error.message}`,
      endpoint,
      undefined,
      error
    );
  }
  
  return new APIError(
    'Unknown API error occurred',
    endpoint,
    undefined,
    error
  );
};

export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
    }
  }
  
  throw lastError;
};
