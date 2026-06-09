import { describe, expect, test } from "bun:test";

import { SHARK_LOGO_LINES } from "@/cli/tui/components/header";

describe("Velaire header logo", () => {
  test("uses the approved block shark logo", () => {
    expect(SHARK_LOGO_LINES).toEqual(["   ▄████▄", " ▄██▀●  ▀▌", "▐██  ___/", " ▀████▀"]);
  });
});
