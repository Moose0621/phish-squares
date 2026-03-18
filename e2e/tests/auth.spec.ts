import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:3000';

test.describe('Authentication API', () => {
  const testUser = {
    username: `testuser_${Date.now()}`,
    password: 'TestPassword123!',
  };

  test('should register a new user', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/register`, {
      data: testUser,
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe(testUser.username);
  });

  test('should reject duplicate username', async ({ request }) => {
    // Register first
    await request.post(`${API_URL}/api/auth/register`, {
      data: testUser,
    });

    // Try again
    const response = await request.post(`${API_URL}/api/auth/register`, {
      data: testUser,
    });
    expect(response.status()).toBe(409);
  });

  test('should login with valid credentials', async ({ request }) => {
    // Register first
    await request.post(`${API_URL}/api/auth/register`, {
      data: testUser,
    });

    const response = await request.post(`${API_URL}/api/auth/login`, {
      data: testUser,
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.token).toBeDefined();
  });

  test('should reject invalid credentials', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/login`, {
      data: { username: 'nonexistent', password: 'wrong' },
    });
    expect(response.status()).toBe(401);
  });

  test('should reject short password on register', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/register`, {
      data: { username: 'testuser', password: 'short' },
    });
    expect(response.status()).toBe(400);
  });

  test('should reject empty username', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/register`, {
      data: { username: '', password: 'ValidPassword123!' },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('Health Check', () => {
  test('should return healthy status', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/health`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
