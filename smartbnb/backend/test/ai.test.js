const mockCreate = jest.fn();
const mockOpenAI = jest.fn(() => ({ chat: { completions: { create: mockCreate } } }));

jest.mock("openai", () => mockOpenAI);

const AI_ENV = ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "OPENAI_API_KEY"];
const input = { listing: { id: "1", name: "Studio" }, smartScore: 70 };
const analysis = { pros: ["Calme"], cons: ["Cher"], summary: "Correct." };

function loadAi(env) {
  for (const key of AI_ENV) delete process.env[key];
  Object.assign(process.env, env);
  let ai;
  jest.isolateModules(() => {
    ai = require("../src/utils/ai");
  });
  return ai;
}

function reply(content) {
  mockCreate.mockResolvedValue({ choices: [{ message: { content } }] });
}

describe("AI pros/cons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    for (const key of AI_ENV) delete process.env[key];
  });

  test("returns an empty analysis when no key is configured", async () => {
    const ai = loadAi({});
    await expect(ai.chatProsCons(input)).resolves.toEqual({ pros: [], cons: [], summary: "" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("uses the OpenAI-compatible endpoint and model when configured", async () => {
    const ai = loadAi({
      AI_BASE_URL: "https://ai.example.com/v1",
      AI_API_KEY: "secret",
      AI_MODEL: "@cf/openai/gpt-oss-20b",
    });
    reply(JSON.stringify(analysis));

    await expect(ai.chatProsCons(input)).resolves.toEqual(analysis);
    expect(mockOpenAI).toHaveBeenCalledWith({
      apiKey: "secret",
      baseURL: "https://ai.example.com/v1",
      timeout: 15000,
      maxRetries: 1,
    });
    expect(mockCreate.mock.calls[0][0].model).toBe("@cf/openai/gpt-oss-20b");
  });

  test("falls back to OpenAI with gpt-4o-mini", async () => {
    const ai = loadAi({ OPENAI_API_KEY: "sk-test" });
    reply(JSON.stringify(analysis));

    await ai.chatProsCons(input);
    expect(mockOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-test", baseURL: undefined })
    );
    expect(mockCreate.mock.calls[0][0].model).toBe("gpt-4o-mini");
  });

  test("reads JSON wrapped in a code fence", async () => {
    const ai = loadAi({ AI_BASE_URL: "https://ai.example.com/v1", AI_API_KEY: "secret" });
    reply("Voici l'analyse :\n```json\n" + JSON.stringify(analysis) + "\n```");

    await expect(ai.chatProsCons(input)).resolves.toEqual(analysis);
  });

  test("drops trailing commas and non-string points", async () => {
    const ai = loadAi({ AI_BASE_URL: "https://ai.example.com/v1", AI_API_KEY: "secret" });
    reply(JSON.stringify({ pros: ["Calme,", 3, "  ", "Prix bas,"], cons: ["Cher ;", "Pas d'avis"], summary: "Correct." }));

    await expect(ai.chatProsCons(input)).resolves.toEqual({
      pros: ["Calme", "Prix bas"],
      cons: ["Cher", "Pas d'avis"],
      summary: "Correct.",
    });
  });

  test("caps the reply: max_tokens, at most 4 points, bounded lengths", async () => {
    const ai = loadAi({ AI_BASE_URL: "https://ai.example.com/v1", AI_API_KEY: "secret" });
    reply(JSON.stringify({ pros: ["a", "b", "c", "d", "e", "x".repeat(500)], cons: [], summary: "s".repeat(1000) }));

    const out = await ai.chatProsCons(input);
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(800);
    expect(mockCreate.mock.calls[0][0].messages[0].content).toMatch(/untrusted/);
    expect(out.pros).toEqual(["a", "b", "c", "d"]);
    expect(out.summary.length).toBe(400);
  });

  test("stops calling the AI once the daily call limit is reached", async () => {
    const ai = loadAi({ AI_BASE_URL: "https://ai.example.com/v1", AI_API_KEY: "secret", AI_DAILY_CALL_LIMIT: "2" });
    reply(JSON.stringify(analysis));
    jest.spyOn(console, "error").mockImplementation(() => {});

    await ai.chatProsCons(input);
    await ai.chatProsCons(input);
    await expect(ai.chatProsCons(input)).resolves.toEqual({ pros: [], cons: [], summary: "" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    delete process.env.AI_DAILY_CALL_LIMIT;
  });

  test("returns an empty analysis when the call fails", async () => {
    const ai = loadAi({ AI_BASE_URL: "https://ai.example.com/v1", AI_API_KEY: "secret" });
    mockCreate.mockRejectedValue(new Error("boom"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(ai.chatProsCons(input)).resolves.toEqual({ pros: [], cons: [], summary: "" });
  });

  test("cache key follows the model and the data sent to it", () => {
    const ai = loadAi({ AI_BASE_URL: "https://ai.example.com/v1", AI_API_KEY: "secret", AI_MODEL: "m1" });
    const key = ai.analysisCacheKey(input);
    expect(key).toEqual({ model: "m1", dataVersion: expect.stringMatching(/^sha256:[0-9a-f]{32}$/) });
    expect(ai.analysisCacheKey(input)).toEqual(key);
    expect(ai.analysisCacheKey({ ...input, smartScore: 71 }).dataVersion).not.toBe(key.dataVersion);
    expect(ai.analysisCacheKey({ ...input, listing: { ...input.listing, price: 90 } }).dataVersion).not.toBe(
      key.dataVersion
    );
  });

  test("no cache key without an AI configured", () => {
    const ai = loadAi({});
    expect(ai.analysisCacheKey(input)).toBeNull();
  });

  test("isNonEmptyAnalysis", () => {
    const ai = loadAi({});
    expect(ai.isNonEmptyAnalysis({ pros: [], cons: [], summary: "" })).toBe(false);
    expect(ai.isNonEmptyAnalysis({ pros: [], cons: [], summary: "  " })).toBe(false);
    expect(ai.isNonEmptyAnalysis(null)).toBe(false);
    expect(ai.isNonEmptyAnalysis({ pros: ["x"], cons: [], summary: "" })).toBe(true);
    expect(ai.isNonEmptyAnalysis({ pros: [], cons: [], summary: "Ok." })).toBe(true);
  });
});
