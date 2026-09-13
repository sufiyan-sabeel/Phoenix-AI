import type { Tool, ToolContext, ToolResult } from './types.js';
import { registerTool } from './registry.js';

function createWebSearchTool(): Tool {
  return {
    name: 'web_search',
    description: 'Search the web using DuckDuckGo',
    category: 'web',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        numResults: { type: 'number', description: 'Number of results (default: 5)' },
      },
      required: ['query'],
    },
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      try {
        const query = encodeURIComponent(args.query as string);
        const numResults = (args.numResults as number) || 5;
        const url = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`;

        const response = await fetch(url, {
          headers: { 'User-Agent': 'Phoenix/1.0' },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          return { success: false, output: null, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const data = await response.json() as Record<string, unknown>;
        const results: Array<{ title: string; url: string; snippet: string }> = [];

        if (data.AbstractText) {
          results.push({
            title: (data.Heading as string) || 'Result',
            url: (data.AbstractURL as string) || '',
            snippet: data.AbstractText as string,
          });
        }

        const relatedTopics = data.RelatedTopics as Array<Record<string, unknown>> | undefined;
        if (relatedTopics) {
          for (const topic of relatedTopics) {
            if (results.length >= numResults) break;
            if (topic.Text && topic.FirstURL) {
              results.push({
                title: (topic.Text as string).substring(0, 80),
                url: topic.FirstURL as string,
                snippet: topic.Text as string,
              });
            }
          }
        }

        return { success: true, output: results.slice(0, numResults) };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createFetchUrlTool(): Tool {
  return {
    name: 'fetch_url',
    description: 'Fetch content from a URL',
    category: 'web',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        method: { type: 'string', description: 'HTTP method (default: GET)', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body' },
      },
      required: ['url'],
    },
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      try {
        const url = args.url as string;
        const method = (args.method as string) || 'GET';
        const headers: Record<string, string> = {
          'User-Agent': 'Phoenix/1.0',
          Accept: 'text/html,application/json,text/plain,*/*',
          ...(args.headers as Record<string, string> || {}),
        };

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: AbortSignal.timeout(30000),
          redirect: 'follow',
        };

        if (args.body && ['POST', 'PUT'].includes(method)) {
          fetchOptions.body = args.body as string;
          if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
          }
        }

        const response = await fetch(url, fetchOptions);
        const contentType = response.headers.get('content-type') || '';
        let output: unknown;

        if (contentType.includes('application/json')) {
          output = await response.json();
        } else {
          const text = await response.text();
          output = text.length > 50000 ? text.substring(0, 50000) + '\n...[truncated]' : text;
        }

        return {
          success: response.ok,
          output: { status: response.status, contentType, data: output },
          error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
        };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

registerTool(createWebSearchTool());
registerTool(createFetchUrlTool());
