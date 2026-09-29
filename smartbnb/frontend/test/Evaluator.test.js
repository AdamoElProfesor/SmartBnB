// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import Evaluator from "../src/components/Evaluator.vue";
import { locale } from "../src/i18n";
import { apiPost } from "../src/lib/api";

vi.mock("../src/lib/api", () => ({ apiPost: vi.fn() }));

const RESULT = {
  ok: true,
  listing_id: "53584592",
  smart_score: 72,
  listing: {
    name: "Lake view studio",
    room_type: "Entire home/apt",
    neighborhood: "Montreux",
    accommodates: 2,
    price: 120,
    median_price: 150,
    rating: 4.9,
    amenities: ["WIFI"],
    missing_amenities: [],
  },
  analysis: { pros: ["Lake view"], cons: [], summary: "A good deal." },
  analysis_cached: false,
};

async function check(wrapper, link) {
  await wrapper.find("input").setValue(link);
  await wrapper.find("form").trigger("submit");
  await flushPromises();
}

describe("Evaluator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reduced motion: the score is shown at once instead of counting up
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    // Not implemented by jsdom
    Element.prototype.scrollIntoView = vi.fn();
  });

  test("shows the score, verdict and price sentence of a listing", async () => {
    apiPost.mockResolvedValue(RESULT);
    const wrapper = mount(Evaluator, { global: { stubs: { DemoVideo: true } } });

    await check(wrapper, "https://www.airbnb.ch/rooms/53584592");

    expect(apiPost).toHaveBeenCalledWith("/score", { airbnbUrl: "https://www.airbnb.ch/rooms/53584592", lang: "en" });
    const text = wrapper.text();
    expect(text).toContain("Lake view studio");
    expect(text).toContain("72/100");
    expect(text).toContain("Worth booking");
    expect(text).toContain("20% below the median for an entire home in Montreux.");
  });

  test("shows the message for a listing outside our data", async () => {
    apiPost.mockRejectedValue(Object.assign(new Error("404 Not Found"), { status: 404 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = mount(Evaluator, { global: { stubs: { DemoVideo: true } } });

    await check(wrapper, "https://www.airbnb.ch/rooms/1");

    expect(wrapper.find('[role="alert"]').text()).toMatch(/isn't in our data/);
    expect(wrapper.find(".result").exists()).toBe(false);
  });

  test("a listing that left Airbnb is flagged, without score nor analysis", async () => {
    apiPost.mockResolvedValue({
      ...RESULT,
      active: false,
      last_seen: "2025-03-16",
      smart_score: null,
      analysis: null,
    });
    const wrapper = mount(Evaluator, { global: { stubs: { DemoVideo: true } } });

    await check(wrapper, "https://www.airbnb.ch/rooms/53584592");

    const text = wrapper.text();
    expect(text).toContain("Lake view studio");
    expect(text).toContain("No longer on Airbnb");
    expect(text).toContain("last seen on Airbnb on 16 March 2025");
    expect(wrapper.find(".verdict").exists()).toBe(false);
    expect(wrapper.find(".analysis").exists()).toBe(false);
    expect(text).toContain("Open this listing on Airbnb");
  });

  test("switching to French translates the page and asks for the analysis in French", async () => {
    apiPost.mockResolvedValue(RESULT);
    const wrapper = mount(Evaluator, { global: { stubs: { DemoVideo: true } } });
    await check(wrapper, "https://www.airbnb.ch/rooms/53584592");

    const french = { ...RESULT, analysis: { pros: ["Vue sur le lac"], cons: [], summary: "Une bonne affaire." } };
    apiPost.mockResolvedValue(french);
    locale.value = "fr";
    await flushPromises();

    expect(apiPost).toHaveBeenLastCalledWith("/score", { airbnbUrl: "53584592", lang: "fr" });
    const text = wrapper.text();
    expect(text).toContain("À réserver");
    expect(text).toContain("20% en dessous de la médiane pour un logement entier à Montreux.");
    expect(text).toContain("Vue sur le lac");
  });
});
