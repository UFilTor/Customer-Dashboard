import { describe, it, expect } from "vitest";
import { meetingMatchesFilter, type FilterableMeetingEntry } from "./owners";

const MARC = "44912650";
const ANDERS = "962517007";
const ALESSANDRO = "34100335";
const JANNE = "37173812";

function entry(over: {
  meetingOwner?: string;
  attendees?: string[] | null;
  dealOwner?: string | null;
  country?: string | null;
}): FilterableMeetingEntry {
  return {
    meeting: {
      ownerId: over.meetingOwner ?? ANDERS,
      attendeeOwnerIds: over.attendees === undefined ? [] : over.attendees,
    },
    deal: {
      ownerId: over.dealOwner === undefined ? ANDERS : over.dealOwner,
      country: over.country === undefined ? "DK" : over.country,
    },
  };
}

describe("meetingMatchesFilter — owner scope", () => {
  it("keeps a meeting the person organizes on a colleague's account", () => {
    // The regression: Marc's meeting on Anders' US account used to be dropped
    // because only the deal owner was tested.
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: MARC },
        entry({ meetingOwner: MARC, dealOwner: ANDERS, country: "US" })
      )
    ).toBe(true);
  });

  it("keeps a meeting the person only attends", () => {
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: MARC },
        entry({ meetingOwner: ANDERS, attendees: [MARC], dealOwner: ANDERS })
      )
    ).toBe(true);
  });

  it("keeps a meeting on the person's own account even when a colleague runs it", () => {
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: MARC },
        entry({ meetingOwner: ANDERS, attendees: [], dealOwner: MARC })
      )
    ).toBe(true);
  });

  it("drops a meeting the person is in no way connected to", () => {
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: MARC },
        entry({ meetingOwner: ALESSANDRO, attendees: [ANDERS], dealOwner: ANDERS })
      )
    ).toBe(false);
  });

  it("matches a region filter on any of its owners", () => {
    // Marc and Anders are both DK.
    expect(
      meetingMatchesFilter(
        { kind: "region", region: "DK" },
        entry({ meetingOwner: MARC, dealOwner: ANDERS })
      )
    ).toBe(true);
    expect(
      meetingMatchesFilter(
        { kind: "region", region: "DK" },
        entry({ meetingOwner: ALESSANDRO, attendees: [], dealOwner: ALESSANDRO })
      )
    ).toBe(false);
  });

  it("keeps everything under the All filter", () => {
    expect(
      meetingMatchesFilter({ kind: "all" }, entry({ dealOwner: null, country: null }))
    ).toBe(true);
  });
});

describe("meetingMatchesFilter — undefined tolerance", () => {
  it("treats a payload without attendeeOwnerIds as no attendees", () => {
    // Up to 14 min after deploy the edge cache can still serve payloads that
    // predate the field, even though the TS type says it is required.
    const stale = {
      meeting: { ownerId: MARC },
      deal: { ownerId: ANDERS, country: "US" },
    } as FilterableMeetingEntry;
    expect(meetingMatchesFilter({ kind: "person", ownerId: MARC }, stale)).toBe(true);

    const staleNoMatch = {
      meeting: { ownerId: ALESSANDRO },
      deal: { ownerId: ALESSANDRO, country: "IT" },
    } as FilterableMeetingEntry;
    expect(
      meetingMatchesFilter({ kind: "person", ownerId: MARC }, staleNoMatch)
    ).toBe(false);
  });

  it("tolerates an explicit null attendee list", () => {
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: MARC },
        entry({ meetingOwner: ANDERS, attendees: null, dealOwner: ANDERS })
      )
    ).toBe(false);
  });
});

describe("meetingMatchesFilter — territory owner", () => {
  it("drops an in-territory meeting the territory owner is not in", () => {
    // The regression: Alessandro's meeting on a Swedish account used to show
    // under Janne purely because SE is in her territory. Meeting prep is a
    // calendar, not a book — she cannot prep a meeting she is not attending.
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: JANNE },
        entry({ meetingOwner: ALESSANDRO, attendees: [], dealOwner: ALESSANDRO, country: "SE" })
      )
    ).toBe(false);
  });

  it("keeps a meeting the territory owner organizes", () => {
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: JANNE },
        entry({ meetingOwner: JANNE, attendees: [], dealOwner: ANDERS, country: "SE" })
      )
    ).toBe(true);
  });

  it("keeps a meeting the territory owner attends", () => {
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: JANNE },
        entry({ meetingOwner: ANDERS, attendees: [JANNE], dealOwner: ANDERS, country: "DK" })
      )
    ).toBe(true);
  });

  it("keeps a meeting she attends even outside her territory countries", () => {
    // Attendance beats location: her own meeting on an Italian account is
    // still her meeting.
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: JANNE },
        entry({ meetingOwner: ALESSANDRO, attendees: [JANNE], dealOwner: ALESSANDRO, country: "IT" })
      )
    ).toBe(true);
  });

  it("keeps a meeting she attends on an account with no country", () => {
    expect(
      meetingMatchesFilter(
        { kind: "person", ownerId: JANNE },
        entry({ meetingOwner: JANNE, attendees: [], dealOwner: null, country: null })
      )
    ).toBe(true);
  });
});

describe("meetingMatchesFilter — country-scoped region", () => {
  it("keeps Spain by account country, since no CS owner attends anything yet", () => {
    expect(
      meetingMatchesFilter(
        { kind: "region", region: "ES" },
        entry({ meetingOwner: ALESSANDRO, dealOwner: ALESSANDRO, country: "ES" })
      )
    ).toBe(true);
  });

  it("drops accounts outside Spain", () => {
    expect(
      meetingMatchesFilter(
        { kind: "region", region: "ES" },
        entry({ meetingOwner: ALESSANDRO, dealOwner: ALESSANDRO, country: "IT" })
      )
    ).toBe(false);
  });

  it("drops accounts with no country under a country-scoped region", () => {
    expect(
      meetingMatchesFilter(
        { kind: "region", region: "ES" },
        entry({ meetingOwner: ALESSANDRO, dealOwner: ALESSANDRO, country: null })
      )
    ).toBe(false);
  });
});
