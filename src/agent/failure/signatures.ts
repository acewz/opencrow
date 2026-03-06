import { createLogger } from "../../logger";

const log = createLogger("failure-signatures");

export interface ErrorSignature {
  raw: string;
  normalized: string;
  category: string;
  subCategory?: string;
  extractedParams: Record<string, string>;
}

export interface SignaturePattern {
  pattern: RegExp;
  category: string;
  subCategory: string;
  resolutionHint?: string;
}

/**
 * Known signature patterns for common errors
 */
const KNOWN_PATTERNS: SignaturePattern[] = [
  // Network errors
  {
    pattern: /ECONNREFUSED|connection refused|network error/i,
    category: "network",
    subCategory: "connection_refused",
    resolutionHint: "Check if the target service is running and accessible",
  },
  {
    pattern: /ETIMEDOUT|timeout|timed out/i,
    category: "network",
    subCategory: "timeout",
    resolutionHint: "Increase timeout or check network connectivity",
  },
  {
    pattern: /ENOTFOUND|DNS|hostname not found/i,
    category: "network",
    subCategory: "dns_error",
    resolutionHint: "Verify DNS configuration and hostname",
  },

  // Permission errors
  {
    pattern: /EACCES|permission denied|access denied/i,
    category: "permission",
    subCategory: "access_denied",
    resolutionHint: "Check file permissions or user privileges",
  },
  {
    pattern: /EPERM|operation not permitted/i,
    category: "permission",
    subCategory: "operation_permitted",
    resolutionHint: "Run with appropriate privileges",
  },

  // File system errors
  {
    pattern: /ENOENT|no such file|not found/i,
    category: "filesystem",
    subCategory: "file_not_found",
    resolutionHint: "Verify file path exists",
  },
  {
    pattern: /EEXIST|file already exists/i,
    category: "filesystem",
    subCategory: "file_exists",
    resolutionHint: "Remove existing file or use different name",
  },
  {
    pattern: /ENOSPC|no space left|disk full/i,
    category: "filesystem",
    subCategory: "disk_full",
    resolutionHint: "Free up disk space",
  },

  // API errors
  {
    pattern: /HTTP 4\d{2}|client error|bad request/i,
    category: "api",
    subCategory: "client_error",
    resolutionHint: "Check request parameters and authentication",
  },
  {
    pattern: /HTTP 5\d{2}|server error|internal error/i,
    category: "api",
    subCategory: "server_error",
    resolutionHint: "Service experiencing issues, retry later",
  },
  {
    pattern: /401|unauthorized|authentication failed/i,
    category: "api",
    subCategory: "auth_error",
    resolutionHint: "Verify API credentials and tokens",
  },
  {
    pattern: /403|forbidden|insufficient permissions/i,
    category: "api",
    subCategory: "forbidden",
    resolutionHint: "Check API permissions and scopes",
  },
  {
    pattern: /404|not found|resource not found/i,
    category: "api",
    subCategory: "not_found",
    resolutionHint: "Verify resource ID or endpoint",
  },
  {
    pattern: /429|rate limit|too many requests/i,
    category: "api",
    subCategory: "rate_limit",
    resolutionHint: "Reduce request frequency or implement backoff",
  },

  // Database errors
  {
    pattern: /SQL|database error|query failed/i,
    category: "database",
    subCategory: "query_error",
    resolutionHint: "Check SQL syntax and database connection",
  },
  {
    pattern: /connection pool|too many connections|pool exhausted/i,
    category: "database",
    subCategory: "connection_pool",
    resolutionHint: "Increase pool size or reduce concurrent queries",
  },
  {
    pattern: /deadlock|lock timeout|transaction aborted/i,
    category: "database",
    subCategory: "deadlock",
    resolutionHint: "Retry transaction or optimize query order",
  },

  // Memory errors
  {
    pattern: /ENOMEM|out of memory|heap out of memory/i,
    category: "memory",
    subCategory: "oom",
    resolutionHint: "Increase memory limit or optimize data processing",
  },

  // Process errors
  {
    pattern: /SIGKILL|killed|process terminated/i,
    category: "process",
    subCategory: "killed",
    resolutionHint: "Check resource limits and OOM killer",
  },
  {
    pattern: /SIGSEGV|segmentation fault|segfault/i,
    category: "process",
    subCategory: "segfault",
    resolutionHint: "Debug native code or check for buffer overflows",
  },

  // TypeScript/JavaScript errors
  {
    pattern: /TypeError|undefined is not a function|cannot read property/i,
    category: "runtime",
    subCategory: "type_error",
    resolutionHint: "Check variable types and null handling",
  },
  {
    pattern: /ReferenceError|is not defined|variable not defined/i,
    category: "runtime",
    subCategory: "reference_error",
    resolutionHint: "Verify variable scope and imports",
  },
  {
    pattern: /SyntaxError|unexpected token|parse error/i,
    category: "syntax",
    subCategory: "parse_error",
    resolutionHint: "Check code syntax and JSON formatting",
  },

  // Timeout errors
  {
    pattern: /timeout|timed out|deadline exceeded/i,
    category: "timeout",
    subCategory: "execution_timeout",
    resolutionHint: "Optimize operation or increase timeout limit",
  },
];

/**
 * Generate normalized error signature from error message
 */
export function generateErrorSignature(errorMessage: string): ErrorSignature {
  const raw = errorMessage;

  // Normalize the error message by removing variable parts
  let normalized = errorMessage
    .replace(/at\s+.*\(/g, "at <location>(") // Stack trace locations
    .replace(/\/[\w/.-]+/g, "<path>") // File paths
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>") // IDs/hashes
    .replace(/\b\d+\b/g, "<num>") // Numbers
    .replace(/line\s+\d+/gi, "line <n>") // Line numbers
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "<ip>") // IP addresses
    .toLowerCase()
    .slice(0, 500); // Truncate long messages

  // Extract parameters before normalization
  const extractedParams = extractErrorParams(errorMessage);

  // Find matching pattern
  const patternMatch = findMatchingPattern(errorMessage);

  return {
    raw,
    normalized,
    category: patternMatch?.category || "unknown",
    subCategory: patternMatch?.subCategory,
    extractedParams,
  };
}

/**
 * Find matching pattern for error
 */
function findMatchingPattern(errorMessage: string): SignaturePattern | null {
  for (const pattern of KNOWN_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Extract variable parameters from error message
 */
export function extractErrorParams(
  errorMessage: string,
): Record<string, string> {
  const params: Record<string, string> = {};

  // Extract file paths
  const pathMatch = errorMessage.match(/["']?(\/[\w/.-]+)["']?/i);
  if (pathMatch && pathMatch[1]) {
    params["path"] = pathMatch[1];
  }

  // Extract port numbers
  const portMatch = errorMessage.match(/port[:\s]+(\d+)/i);
  if (portMatch && portMatch[1]) {
    params["port"] = portMatch[1];
  }

  // Extract hostnames
  const hostMatch = errorMessage.match(/(?:host|hostname)[:\s]+([\w.-]+)/i);
  if (hostMatch && hostMatch[1]) {
    params["host"] = hostMatch[1];
  }

  // Extract HTTP status codes
  const statusMatch = errorMessage.match(/HTTP\s+(\d{3})/i);
  if (statusMatch && statusMatch[1]) {
    params["httpStatus"] = statusMatch[1];
  }

  // Extract line numbers
  const lineMatch = errorMessage.match(/line[:\s]+(\d+)/i);
  if (lineMatch && lineMatch[1]) {
    params["line"] = lineMatch[1];
  }

  // Extract column numbers
  const colMatch = errorMessage.match(/column[:\s]+(\d+)/i);
  if (colMatch && colMatch[1]) {
    params["column"] = colMatch[1];
  }

  return params;
}

/**
 * Compute similarity between two error signatures
 */
export function computeSignatureSimilarity(sig1: string, sig2: string): number {
  // Normalize both signatures
  const norm1 = sig1.toLowerCase().trim();
  const norm2 = sig2.toLowerCase().trim();

  // Exact match
  if (norm1 === norm2) {
    return 1.0;
  }

  // Levenshtein distance-based similarity
  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);

  if (maxLength === 0) {
    return 1.0;
  }

  const similarity = 1 - distance / maxLength;
  return similarity;
}

/**
 * Compute Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1, // deletion
        );
      }
    }
  }

  return matrix[str2.length]![str1.length]!;
}
