import { describe, expect, it } from "vitest";
import { calculateAreaQtyScaled, calculateLineTotalMinor } from "../src/domain/calculations";

describe("square-meter invoice calculations", () => {
  it("calculates area and price per square meter in stored scales", () => {
    const qtyScaled = calculateAreaQtyScaled(2.5, 1.2);

    expect(qtyScaled).toBe(3000);
    expect(calculateLineTotalMinor(qtyScaled, 40000)).toBe(120000);
  });

  it("rejects missing or non-positive dimensions", () => {
    expect(() => calculateAreaQtyScaled(0, 1.2)).toThrow(/العرض/);
    expect(() => calculateAreaQtyScaled(2.5, -1)).toThrow(/الارتفاع/);
  });
});
