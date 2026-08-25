import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WhatsAppAction } from "./WhatsAppAction";

const WEB_HREF = "https://api.whatsapp.com/send?phone=46733867527&text=";

function renderAction(phone: string | null = "+46 73 386 75 27") {
  return render(
    <WhatsAppAction phone={phone} country="SE" contactName="Anna" style={{}}>
      wa
    </WhatsAppAction>
  );
}

describe("WhatsAppAction", () => {
  let open: ReturnType<typeof vi.fn>;

  // Clicking logs a "Not implemented: navigation" line from jsdom - that is
  // the whatsapp:// attempt reaching a DOM that cannot navigate. Expected.
  beforeEach(() => {
    vi.useFakeTimers();
    // Mirrors the browser: window.open returns null when noopener is set.
    open = vi.fn(() => null);
    vi.stubGlobal("open", open);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the web link on the href so copy-link and cmd-click still work", () => {
    renderAction();
    const link = screen.getByRole("link", { name: "Send WhatsApp to Anna" });
    expect(link.getAttribute("href")).toBe(WEB_HREF);
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders nothing when the number cannot be normalized", () => {
    renderAction(null);
    expect(screen.queryByRole("link")).toBeNull();
  });

  // jsdom cannot navigate, so the whatsapp:// attempt is only observable
  // through what happens after it. The real-browser check is in the session
  // notes: clicking fires an external-protocol navigation, not a page load.
  it("falls back to the web link when no app took the handoff", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    renderAction();
    screen.getByRole("link").click();
    // Nothing opens during the handoff window - the app may still be launching.
    vi.advanceTimersByTime(1199);
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledWith(WEB_HREF, "_blank", "noopener,noreferrer");
  });

  it("stays quiet when the desktop app stole focus", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    renderAction();
    screen.getByRole("link").click();
    vi.advanceTimersByTime(5000);
    expect(open).not.toHaveBeenCalled();
  });
});
