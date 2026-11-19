const request = require('supertest');
const app = require('../app');

describe('CarePulse secure registration foundation', () => {
  it('blocks public staff registration', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      name: 'Unapproved User',
      email: 'unapproved@example.com',
      password: 'StrongPassword!123',
      role: 'doctor',
    });
    expect(response.statusCode).toBe(403);
    expect(response.body.message).toMatch(/Public registration is disabled/i);
  });

  it('does not expose audit logs without authentication', async () => {
    const response = await request(app).get('/api/v1/onboarding/audit-logs');
    expect(response.statusCode).toBe(401);
  });

  it('does not expose invitation creation without authentication', async () => {
    const response = await request(app).post('/api/v1/onboarding/invitations').send({
      name: 'New Nurse', email: 'nurse@example.com', role: 'nurse',
    });
    expect(response.statusCode).toBe(401);
  });
});
