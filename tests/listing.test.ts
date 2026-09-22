import { describe, expect, it } from "vitest";
import { filterAndPaginate, normalizeSearch } from "../src/shared/listing";

describe("local list filtering and pagination", () => {
  it("normalizes search text and matches the requested record", () => {
    const result = filterAndPaginate(
      [{ name: "محمد علي", phone: "01000000000" }, { name: "أحمد", phone: "01111111111" }],
      "  01000000000 ",
      (item, query) => normalizeSearch(`${item.name} ${item.phone}`).includes(query),
      1,
    );

    expect(result.items).toEqual([{ name: "محمد علي", phone: "01000000000" }]);
    expect(result.totalItems).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it("returns thirty records per page and clamps an out-of-range page", () => {
    const result = filterAndPaginate(Array.from({ length: 65 }, (_, index) => index + 1), "", () => true, 99);

    expect(result.items).toHaveLength(5);
    expect(result.items[0]).toBe(61);
    expect(result.currentPage).toBe(3);
    expect(result.totalPages).toBe(3);
  });

  it("supports ten-result autocomplete pages", () => {
    const result = filterAndPaginate(
      Array.from({ length: 25 }, (_, index) => ({ name: `عميل ${index + 1}` })),
      "",
      () => true,
      2,
      10,
    );

    expect(result.items).toHaveLength(10);
    expect(result.items[0]).toEqual({ name: "عميل 11" });
    expect(result.totalPages).toBe(3);
  });
});
