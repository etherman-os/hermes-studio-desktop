import { describe, expect, it } from "vitest";
import type { ThemePack } from "@hermes-studio/shared-types";
import { resolveThemeWorld, themeWorldMotifs } from "./themeWorld";

type ThemeOverride = Omit<Partial<ThemePack>, "meta"> & {
  meta?: Partial<ThemePack["meta"]>;
};

function theme(partial: ThemeOverride): ThemePack {
  const { meta: metaOverride, ...rest } = partial;
  const meta: ThemePack["meta"] = {
    id: metaOverride?.id ?? "test",
    name: metaOverride?.name ?? "Test",
    version: metaOverride?.version ?? "0.0.0",
    author: metaOverride?.author ?? "test",
    description: metaOverride?.description,
    extends: metaOverride?.extends,
    keywords: metaOverride?.keywords,
  };
  return {
    ...rest,
    meta,
  };
}

describe("themeWorld", () => {
  it("resolves block themes from border style", () => {
    expect(resolveThemeWorld(theme({ borders: { style: "blocky" } }))).toBe("block");
  });

  it("resolves worlds from generic metadata hints", () => {
    expect(resolveThemeWorld(theme({ meta: { keywords: ["archive"] } }))).toBe("archive");
    expect(resolveThemeWorld(theme({ meta: { keywords: ["science"] } }))).toBe("lab");
    expect(resolveThemeWorld(theme({ meta: { keywords: ["minimal"] } }))).toBe("paper");
  });

  it("falls back to studio motifs", () => {
    expect(resolveThemeWorld(theme({}))).toBe("studio");
    expect(themeWorldMotifs("studio")).toEqual(["<>", "/", "*", ">>"]);
  });
});
