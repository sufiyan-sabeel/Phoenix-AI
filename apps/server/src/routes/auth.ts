import { Router, type Request, type Response } from 'express';
import { generateToken, verifyToken, hashPassword, verifyPassword, authMiddleware } from '../auth.js';

const router = Router();

const users = new Map<string, { password: string; role: string }>();

function ensureDefaultUser(): void {
  if (users.size === 0) {
    const defaultPassword = process.env['PHOENIX_DEFAULT_PASSWORD'] ?? 'admin';
    users.set('admin', {
      password: hashPassword(defaultPassword),
      role: 'owner',
    });
  }
}

ensureDefaultUser();

router.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const user = users.get(username);
  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = generateToken(username, user.role);
  res.json({
    token,
    user: { userId: username, role: user.role },
  });
});

router.post('/verify', (req: Request, res: Response): void => {
  const { token } = req.body as { token?: string };

  if (!token) {
    res.status(400).json({ error: 'Token is required' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  res.json({
    valid: true,
    user: { userId: payload.sub, role: payload.role },
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  });
});

router.post('/change-password', authMiddleware, (req: Request, res: Response): void => {
  const user = (req as any).user as { userId: string };
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new passwords are required' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }

  const stored = users.get(user.userId);
  if (!stored || !verifyPassword(currentPassword, stored.password)) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  stored.password = hashPassword(newPassword);
  res.json({ success: true, message: 'Password changed successfully' });
});

router.post('/register', (req: Request, res: Response): void => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  if (users.has(username)) {
    res.status(409).json({ error: 'Username already exists' });
    return;
  }

  users.set(username, {
    password: hashPassword(password),
    role: 'owner',
  });

  const token = generateToken(username, 'owner');
  res.status(201).json({
    token,
    user: { userId: username, role: 'owner' },
  });
});

export default router;
