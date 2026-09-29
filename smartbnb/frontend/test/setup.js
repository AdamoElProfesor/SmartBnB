import { beforeEach } from "vitest";
import { locale } from "../src/i18n";

// Tests read English text: never depend on the language of the machine running them
beforeEach(() => {
  locale.value = "en";
});
