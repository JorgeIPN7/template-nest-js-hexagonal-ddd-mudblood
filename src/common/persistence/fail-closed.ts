export const failClosed = <T, E extends Error>(
  rebuild: () => T,
  isDomainError: (error: unknown) => error is E,
  describe: (error: E) => string,
): T => {
  try {
    return rebuild();
  } catch (error) {
    if (isDomainError(error)) {
      throw new Error(describe(error), { cause: error });
    }
    throw error;
  }
};
