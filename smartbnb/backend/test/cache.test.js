const { cached } = require("../src/utils/cache");

describe("cached", () => {
  test("reuses the result until it expires", async () => {
    jest.useFakeTimers();
    try {
      const fn = jest.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
      const get = cached(fn, 1000);
      await expect(get()).resolves.toBe("a");
      await expect(get()).resolves.toBe("a");
      expect(fn).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1001);
      await expect(get()).resolves.toBe("b");
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("parallel calls during a miss share one call", async () => {
    let resolve;
    const fn = jest.fn(() => new Promise((r) => (resolve = r)));
    const get = cached(fn, 1000);
    const both = Promise.all([get(), get()]);
    resolve("x");
    await expect(both).resolves.toEqual(["x", "x"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("a failed call is not cached", async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce("ok");
    const get = cached(fn, 1000);
    await expect(get()).rejects.toThrow("db down");
    await expect(get()).resolves.toBe("ok");
  });
});
