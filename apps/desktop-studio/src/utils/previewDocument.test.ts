import { describe, expect, it } from "vitest";
import { HERMES_INSPECTOR_CLICK, isInspectorMessage } from "./previewDocument";

describe("isInspectorMessage", () => {
  it("accepts inspector messages for the expected channel", () => {
    expect(
      isInspectorMessage(
        {
          type: HERMES_INSPECTOR_CLICK,
          channel: "channel-1",
          selector: "button.primary",
          tagName: "button",
          text: "Save",
        },
        "channel-1",
      ),
    ).toBe(true);
  });

  it("rejects messages from unexpected channels or malformed payloads", () => {
    expect(
      isInspectorMessage(
        {
          type: HERMES_INSPECTOR_CLICK,
          channel: "wrong-channel",
          selector: "button.primary",
          tagName: "button",
          text: "Save",
        },
        "channel-1",
      ),
    ).toBe(false);

    expect(
      isInspectorMessage(
        {
          type: HERMES_INSPECTOR_CLICK,
          channel: "channel-1",
          selector: "",
          tagName: "button",
          text: "Save",
        },
        "channel-1",
      ),
    ).toBe(false);
  });
});
