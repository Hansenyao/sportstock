// Mock for firebase-admin — prevents real SDK initialization in tests

const mockMessaging = {
  sendEachForMulticast: jest.fn().mockResolvedValue({ responses: [] }),
};

const admin = {
  apps: [] as unknown[],
  initializeApp: jest.fn().mockReturnValue({}),
  credential: {
    cert: jest.fn().mockReturnValue({}),
  },
  messaging: jest.fn().mockReturnValue(mockMessaging),
};

export default admin;
