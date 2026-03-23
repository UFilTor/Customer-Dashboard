import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getRecentCompanies,
  addRecentCompany,
  removeRecentCompany,
} from "./recent-companies";

const STORAGE_KEY = "recent-companies";

describe("recent companies", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when no data stored", () => {
    expect(getRecentCompanies()).toEqual([]);
  });

  it("adds a company to recents", () => {
    addRecentCompany({ id: "1", name: "Alpha Co" });
    expect(getRecentCompanies()).toEqual([{ id: "1", name: "Alpha Co" }]);
  });

  it("moves duplicate to front instead of adding again", () => {
    addRecentCompany({ id: "1", name: "Alpha" });
    addRecentCompany({ id: "2", name: "Beta" });
    addRecentCompany({ id: "1", name: "Alpha" });
    const recents = getRecentCompanies();
    expect(recents).toHaveLength(2);
    expect(recents[0].id).toBe("1");
  });

  it("keeps max 5 entries", () => {
    for (let i = 1; i <= 7; i++) {
      addRecentCompany({ id: String(i), name: `Company ${i}` });
    }
    const recents = getRecentCompanies();
    expect(recents).toHaveLength(5);
    expect(recents[0].id).toBe("7");
    expect(recents[4].id).toBe("3");
  });

  it("removes a company by id", () => {
    addRecentCompany({ id: "1", name: "Alpha" });
    addRecentCompany({ id: "2", name: "Beta" });
    removeRecentCompany("1");
    expect(getRecentCompanies()).toEqual([{ id: "2", name: "Beta" }]);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(getRecentCompanies()).toEqual([]);
  });
});
