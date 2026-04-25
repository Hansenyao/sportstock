// Mock for @clerk/backend — used via jest.config.ts moduleNameMapper

export const verifyToken = jest.fn().mockImplementation((token: string) => {
  const match = token.match(/^test\|(.+)$/);
  if (!match) return Promise.reject(new Error(`Invalid test token: ${token}`));
  return Promise.resolve({ sub: match[1] });
});

export const createClerkClient = jest.fn().mockReturnValue({
  users: {
    getUser: jest.fn().mockImplementation((clerkId: string) =>
      Promise.resolve({
        id: clerkId,
        emailAddresses: [{ emailAddress: `${clerkId}@test.com` }],
        firstName: 'Test',
        lastName: clerkId,
      })
    ),
    getUserList: jest.fn().mockResolvedValue({ data: [], totalCount: 0 }),
  },
});
