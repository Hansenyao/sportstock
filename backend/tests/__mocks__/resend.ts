// Mock for resend — used via jest.config.ts moduleNameMapper

export class Resend {
  emails = {
    send: jest.fn().mockResolvedValue({ id: 'test-email-id' }),
  };
}
