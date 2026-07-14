import { describe, expect, it } from "vitest";
import {
  buildOnboardingPatch,
  configuredCredentialProviderIds,
  hasUsableOnboardingProvider,
  initialChoiceIndex,
  PROVIDER_CHOICES,
  providerChoiceAcceptsApiKey,
  providerChoiceNeedsApiKey,
} from "./providers-catalog";

describe("providers-catalog", () => {
  it("has unique choice keys", () => {
    const keys = PROVIDER_CHOICES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe("providerChoiceNeedsApiKey", () => {
    it("requires credentials for unconfigured remote providers", () => {
      const openai = PROVIDER_CHOICES.find((c) => c.key === "openai")!;
      expect(providerChoiceNeedsApiKey(openai)).toBe(true);
    });

    it("accepts detected credentials, local providers, and optional custom keys", () => {
      const codex = PROVIDER_CHOICES.find((c) => c.key === "codex")!;
      const ollama = PROVIDER_CHOICES.find((c) => c.key === "ollama-local")!;
      const custom = PROVIDER_CHOICES.find((c) => c.key === "custom-endpoint")!;
      expect(providerChoiceNeedsApiKey(codex, new Set(["codex"]))).toBe(false);
      expect(providerChoiceNeedsApiKey(ollama)).toBe(false);
      expect(providerChoiceNeedsApiKey(custom)).toBe(false);
      expect(providerChoiceAcceptsApiKey(custom)).toBe(true);
    });
  });

  describe("onboarding readiness", () => {
    it("does not treat an offline keyless provider as usable", () => {
      expect(hasUsableOnboardingProvider([
        { configured: true, keyless: true },
      ], [])).toBe(false);
    });

    it("accepts remote credentials or a live local model", () => {
      expect(hasUsableOnboardingProvider([
        { configured: true, keyless: false },
      ], [])).toBe(true);
      expect(hasUsableOnboardingProvider([
        { configured: true, keyless: true },
      ], [{ id: "local-model" }])).toBe(true);
    });

    it("does not let a shared keyless provider suppress cloud credentials", () => {
      expect(configuredCredentialProviderIds([
        { id: "ollama", configured: true, keyless: true },
        { id: "openai", configured: true, keyless: false },
      ])).toEqual(new Set(["openai"]));
    });
  });

  it("includes the major providers", () => {
    const ids = PROVIDER_CHOICES.map((c) => c.key);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("ollama-local");
    expect(ids).toContain("custom-endpoint");
  });

  it("keyless choices have localKeyless set", () => {
    const local = PROVIDER_CHOICES.filter((c) => c.localKeyless);
    expect(local.every((c) => !c.keyUrl)).toBe(true);
  });

  describe("initialChoiceIndex", () => {
    it("returns 0 when nothing is configured", () => {
      expect(initialChoiceIndex(PROVIDER_CHOICES, {})).toBe(0);
    });

    it("detects an env var match", () => {
      const idx = initialChoiceIndex(PROVIDER_CHOICES, { OPENAI_API_KEY: "sk-1" });
      expect(PROVIDER_CHOICES[idx]!.key).toBe("openai");
    });

    it("detects a configured provider id", () => {
      const idx = initialChoiceIndex(PROVIDER_CHOICES, {}, new Set(["ollama"]));
      // ollama-cloud is the first non-keyless choice with registryId "ollama"
      expect(PROVIDER_CHOICES[idx]!.registryId).toBe("ollama");
    });

    it("skips keyless choices for env detection", () => {
      const idx = initialChoiceIndex(PROVIDER_CHOICES, { OLLAMA_BASE_URL: "http://x" });
      // ollama-local is keyless — should be skipped, falling back to 0
      expect(idx).toBe(0);
    });
  });

  describe("buildOnboardingPatch", () => {
    it("builds a model + provider patch with an API key", () => {
      expect(
        buildOnboardingPatch({
          model: "openai/gpt-5.5",
          providerId: "openai",
          apiKey: "sk-1",
        }),
      ).toEqual({
        model: "openai/gpt-5.5",
        providers: { openai: { apiKey: "sk-1" } },
      });
    });

    it("includes baseURL for custom endpoints", () => {
      expect(
        buildOnboardingPatch({
          model: "custom/my-model",
          providerId: "custom",
          apiKey: "sk-1",
          baseURL: "https://my.api/v1",
        }),
      ).toEqual({
        model: "custom/my-model",
        providers: { custom: { apiKey: "sk-1", baseURL: "https://my.api/v1" } },
      });
    });

    it("only sets model for keyless providers", () => {
      expect(
        buildOnboardingPatch({
          model: "ollama/gpt-oss:20b",
          providerId: "ollama",
        }),
      ).toEqual({ model: "ollama/gpt-oss:20b" });
    });
  });
});
