import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { authMiddleware } from '../auth.js';

const UPLOAD_DIR = join(process.cwd(), '.phoenix', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface FileInfo {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: Date;
}

const files = new Map<string, FileInfo>();

async function ensureUploadDir(): Promise<void> {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

function parseMultipartBody(buffer: Buffer, boundary: string): { fields: Record<string, string>; file?: { filename: string; contentType: string; data: Buffer } } {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  let file: { filename: string; contentType: string; data: Buffer } | undefined;

  let start = 0;
  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIdx === -1) break;

    const nextBoundaryIdx = buffer.indexOf(boundaryBuffer, boundaryIdx + boundaryBuffer.length);
    const partEnd = nextBoundaryIdx === -1 ? buffer.length - 2 : nextBoundaryIdx;
    const part = buffer.slice(boundaryIdx + boundaryBuffer.length, partEnd);

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      start = partEnd;
      continue;
    }

    const headers = part.slice(0, headerEnd).toString('utf-8');
    const body = part.slice(headerEnd + 4);

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const contentTypeMatch = headers.match(/Content-Type:\s*(.+?)$/im);

    if (filenameMatch && nameMatch) {
      const data = body[body.length - 2] === 0x0d ? body.slice(0, -2) : body;
      file = {
        filename: filenameMatch[1] ?? 'upload',
        contentType: contentTypeMatch?.[1]?.trim() ?? 'application/octet-stream',
        data: Buffer.from(data),
      };
    } else if (nameMatch) {
      fields[nameMatch[1] ?? ''] = body.toString('utf-8').trim();
    }

    start = partEnd;
  }

  return { fields, file };
}

export function createFileRoutes(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.post('/upload', async (req: Request, res: Response): Promise<void> => {
    await ensureUploadDir();

    const contentType = req.headers['content-type'] ?? '';
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);

    if (contentLength > MAX_FILE_SIZE) {
      res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
      return;
    }

    if (!contentType.includes('multipart/form-data')) {
      res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
      return;
    }

    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      res.status(400).json({ error: 'Missing boundary in Content-Type' });
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);

    const { file } = parseMultipartBody(body, boundaryMatch[1] ?? '');

    if (!file) {
      res.status(400).json({ error: 'No file in upload' });
      return;
    }

    const id = randomUUID();
    const ext = file.filename.includes('.') ? file.filename.split('.').pop() : '';
    const storedName = ext ? `${id}.${ext}` : id;
    const filePath = join(UPLOAD_DIR, storedName);

    await writeFile(filePath, file.data);

    const info: FileInfo = {
      id,
      originalName: file.filename,
      mimeType: file.contentType,
      size: file.data.length,
      path: filePath,
      createdAt: new Date(),
    };
    files.set(id, info);

    res.status(201).json({
      file: {
        id: info.id,
        originalName: info.originalName,
        mimeType: info.mimeType,
        size: info.size,
        createdAt: info.createdAt,
      },
    });
  });

  router.get('/:id', (req: Request, res: Response): void => {
    const info = files.get(req.params['id'] ?? '');
    if (!info) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json({
      file: {
        id: info.id,
        originalName: info.originalName,
        mimeType: info.mimeType,
        size: info.size,
        createdAt: info.createdAt,
      },
    });
  });

  router.get('/:id/download', async (req: Request, res: Response): Promise<void> => {
    const info = files.get(req.params['id'] ?? '');
    if (!info) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    try {
      const data = await readFile(info.path);
      res.setHeader('Content-Type', info.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${info.originalName}"`);
      res.setHeader('Content-Length', data.length);
      res.send(data);
    } catch {
      res.status(500).json({ error: 'Failed to read file' });
    }
  });

  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    const info = files.get(req.params['id'] ?? '');
    if (!info) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    try {
      await unlink(info.path);
    } catch {
      // File may already be deleted
    }

    files.delete(req.params['id'] ?? '');
    res.json({ success: true });
  });

  return router;
}
